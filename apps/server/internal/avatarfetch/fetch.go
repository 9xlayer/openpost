// Package avatarfetch owns the one bounded HTTP fetch for provider profile
// photos. accountavatar (cache into our storage) and publicationcards (render
// text cards) share this adapter and keep their own timeout, byte, and pixel
// bounds and outcome behavior instead of each owning an HTTP client.
package avatarfetch

import (
	"bytes"
	"context"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/png"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/openpost/backend/internal/netguard"
	_ "golang.org/x/image/webp"
)

// Bounds are the caller's own fetch limits. MaxPixels of zero skips the
// decoded-dimension check for callers that store the original bytes.
type Bounds struct {
	Label     string
	Timeout   time.Duration
	MaxBytes  int64
	MaxPixels int64
	Resolver  netguard.Resolver
	// Client overrides the transport in tests. Redirect validation still
	// applies, so a stubbed transport cannot bypass the URL policy.
	Client *http.Client
}

// Result is the fetched photo bytes with their detected content type.
type Result struct {
	Data        []byte
	ContentType string
}

// Fetch downloads one profile photo after validating the initial URL and
// every redirect against the netguard policy. Credentialed URLs are rejected
// before any network call.
func Fetch(ctx context.Context, rawURL string, bounds Bounds) (Result, error) {
	label := bounds.Label
	if label == "" {
		label = "profile photo"
	}
	timeout := bounds.Timeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	maxBytes := bounds.MaxBytes
	if maxBytes <= 0 {
		maxBytes = 4 * 1024 * 1024
	}
	remote, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || remote == nil {
		return Result{}, fmt.Errorf("invalid %s URL", label)
	}
	if remote.User != nil {
		return Result{}, fmt.Errorf("%s URL must not include credentials", label)
	}
	policy := netguard.URLPolicy{Label: label, AllowedSchemes: []string{"https"}, Resolver: bounds.Resolver}
	if err := netguard.ValidateURL(ctx, remote, policy); err != nil {
		return Result{}, err
	}

	client := bounds.Client
	if client == nil {
		client = netguard.NewHTTPClient(timeout, policy)
	}
	previousCheckRedirect := client.CheckRedirect
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if req.URL.User != nil {
			return fmt.Errorf("%s redirect must not include credentials", label)
		}
		if err := netguard.ValidateURL(req.Context(), req.URL, policy); err != nil {
			return err
		}
		if previousCheckRedirect != nil {
			return previousCheckRedirect(req, via)
		}
		if len(via) >= 10 {
			return fmt.Errorf("%s redirect limit exceeded", label)
		}
		return nil
	}
	defer func() { client.CheckRedirect = previousCheckRedirect }()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, remote.String(), nil)
	if err != nil {
		return Result{}, fmt.Errorf("create %s request: %w", label, err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return Result{}, fmt.Errorf("fetch %s request failed: %w", label, err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return Result{}, fmt.Errorf("%s returned HTTP %d", label, resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxBytes+1))
	if err != nil {
		return Result{}, fmt.Errorf("read %s: %w", label, err)
	}
	if len(data) == 0 || int64(len(data)) > maxBytes {
		return Result{}, fmt.Errorf("%s must be between 1 byte and %d bytes", label, maxBytes)
	}
	if bounds.MaxPixels > 0 {
		config, _, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil || config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > bounds.MaxPixels {
			return Result{}, fmt.Errorf("%s image dimensions are out of bounds", label)
		}
	}
	return Result{Data: data, ContentType: http.DetectContentType(data)}, nil
}
