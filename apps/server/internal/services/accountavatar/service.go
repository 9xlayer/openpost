package accountavatar

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/openpost/backend/internal/avatarfetch"
	"github.com/openpost/backend/internal/netguard"
	"github.com/openpost/backend/internal/services/mediastore"
)

const (
	accountAvatarKeyPrefix = "avatar_account_"
	accountAvatarURLPrefix = "/avatars/"
	maxAccountAvatarBytes  = 4 * 1024 * 1024
	accountAvatarTimeout   = 15 * time.Second
)

var unsafeObjectKeyCharacter = regexp.MustCompile(`[^a-zA-Z0-9_-]+`)

type Service struct {
	storage  mediastore.BlobStorage
	client   *http.Client
	resolver netguard.Resolver
}

func New(storage mediastore.BlobStorage) *Service {
	return &Service{storage: storage}
}

func (s *Service) CacheLinkedIn(ctx context.Context, accountID, rawURL string) (string, error) {
	remote, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || remote == nil {
		return "", fmt.Errorf("invalid LinkedIn profile photo URL")
	}
	if !isLinkedInMediaHost(remote.Hostname()) {
		return "", fmt.Errorf("profile photo URL is not hosted by LinkedIn")
	}
	return s.CacheAvatar(ctx, accountID, rawURL)
}

// CacheAvatar copies any provider's profile photo into our storage so the
// stored photo keeps working after the provider's signed CDN URL expires.
// The previous photo, if any, stays the caller's to retire through Delete so
// replaced photos stop counting against storage.
func (s *Service) CacheAvatar(ctx context.Context, accountID, rawURL string) (string, error) {
	result, err := avatarfetch.Fetch(ctx, rawURL, avatarfetch.Bounds{
		Label: "profile photo URL", Timeout: accountAvatarTimeout,
		MaxBytes: maxAccountAvatarBytes, Resolver: s.resolver, Client: s.client,
	})
	if err != nil {
		return "", err
	}
	contentType := result.ContentType
	extension := imageExtension(contentType)
	if extension == "" {
		return "", fmt.Errorf("profile photo has unsupported content type %q", contentType)
	}

	key := fmt.Sprintf(
		accountAvatarKeyPrefix+"%s_%s%s",
		unsafeObjectKeyCharacter.ReplaceAllString(accountID, "_"),
		uuid.NewString(),
		extension,
	)
	if _, err := mediastore.SaveWithContentType(ctx, s.storage, key, bytes.NewReader(result.Data), contentType); err != nil {
		_ = mediastore.DeleteForCleanup(ctx, s.storage, key)
		return "", fmt.Errorf("save profile photo: %w", err)
	}
	return accountAvatarURLPrefix + key, nil
}

func (s *Service) Delete(ctx context.Context, avatarURL string) error {
	remote, err := url.Parse(strings.TrimSpace(avatarURL))
	if err != nil {
		return nil
	}
	key := filepath.Base(remote.Path)
	if !strings.HasPrefix(key, accountAvatarKeyPrefix) {
		return nil
	}
	return mediastore.DeleteForCleanup(ctx, s.storage, key)
}

func isLinkedInMediaHost(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	return host == "media.licdn.com" || strings.HasSuffix(host, ".licdn.com")
}

func imageExtension(contentType string) string {
	switch contentType {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	default:
		return ""
	}
}
