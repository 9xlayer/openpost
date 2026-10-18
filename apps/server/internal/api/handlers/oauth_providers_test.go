package handlers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humaecho"
	"github.com/labstack/echo/v4"
	"github.com/openpost/backend/internal/platform"
	"github.com/openpost/backend/internal/services/providerreadiness"
	"github.com/stretchr/testify/require"
)

type providerAvailabilityAdapter struct {
	instanceURL string
}

func (a providerAvailabilityAdapter) GenerateAuthURL(string) (string, map[string]string) {
	return "", nil
}

func (a providerAvailabilityAdapter) ExchangeCode(context.Context, string, map[string]string) (*platform.TokenResult, error) {
	return nil, nil
}

func (a providerAvailabilityAdapter) RefreshCapability() platform.RefreshCapability {
	return platform.RefreshCapability{}
}

func (a providerAvailabilityAdapter) RefreshToken(context.Context, platform.RefreshTokenInput) (*platform.TokenResult, error) {
	return nil, nil
}

func (a providerAvailabilityAdapter) GetProfile(context.Context, string) (*platform.UserProfile, error) {
	return nil, nil
}

func (a providerAvailabilityAdapter) UploadMedia(context.Context, string, string, string, io.Reader) (string, error) {
	return "", nil
}

func (a providerAvailabilityAdapter) Publish(context.Context, string, string, *platform.PublishRequest) (platform.PublishResult, error) {
	return platform.PublishResult{}, nil
}

func (a providerAvailabilityAdapter) InstanceURL() string {
	return a.instanceURL
}

func TestListProvidersReportsConfiguredProviders(t *testing.T) {
	t.Parallel()

	e := echo.New()
	api := humaecho.NewWithGroup(e, e.Group("/api/v1"), huma.DefaultConfig("Test", "1.0.0"))
	mastodonAdapter := providerAvailabilityAdapter{instanceURL: "https://masto.pt"}
	handler := &OAuthHandler{
		auth: testAuthenticator{},
		providers: map[string]platform.Adapter{
			"bluesky":                   providerAvailabilityAdapter{},
			"discord":                   providerAvailabilityAdapter{},
			"pinterest":                 providerAvailabilityAdapter{},
			"x":                         providerAvailabilityAdapter{},
			"mastodon:https://masto.pt": mastodonAdapter,
			"mastodon:Personal":         mastodonAdapter,
		},
	}
	handler.readiness = oauthConnectionReadiness(
		t,
		&oauthReadinessLedger{control: providerreadiness.RuntimeControlStateEnabled, approved: true},
		platform.AppConfig{Provider: "bluesky", ClientID: "bluesky-app"},
		platform.AppConfig{Provider: "discord", ConnectionMode: "webhook"},
		platform.AppConfig{Provider: "pinterest", ClientID: "pin-app", ClientSecret: "pin-secret", RedirectURI: "https://app.test/api/v1/accounts/pinterest/callback"},
		platform.AppConfig{Provider: "x", ClientID: "x-app"},
		platform.AppConfig{Provider: mastodonProvider, ClientID: "mastodon-app", InstanceURL: "https://masto.pt"},
	)
	handler.ListProviders(api)

	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/v1/accounts/providers", nil)
	req.Header.Set("Authorization", "Bearer web-token")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var out []ProviderInfo
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	require.Len(t, out, 18)
	require.Equal(t, "bluesky", out[0].Platform)
	require.Equal(t, providerStatusAvailable, out[0].Status)
	require.True(t, out[0].Configured)
	require.Contains(t, out[0].Capabilities, "MCP workflows")
	require.Equal(t, "devnull", out[1].Platform)
	require.Equal(t, "dev/null", out[1].DisplayName)
	require.Equal(t, "ssh_signature", out[1].AuthMode)
	require.False(t, out[1].Configured)
	require.Equal(t, "discord", out[2].Platform)
	require.Equal(t, providerStatusAvailable, out[2].Status)
	require.True(t, out[2].Configured)
	require.ElementsMatch(t, []string{"webhook", "bot"}, out[2].ConnectionModes)
	require.Equal(t, "pinterest", out[3].Platform)
	require.Equal(t, providerStatusAvailable, out[3].Status)
	require.True(t, out[3].Configured)
	require.Contains(t, out[3].Capabilities, "Board targeting")
	require.Equal(t, "telegram", out[4].Platform)
	require.NotEqual(t, providerStatusPlanned, out[4].Status)
	require.False(t, out[4].Configured)
	require.Equal(t, "x", out[5].Platform)
	require.Equal(t, providerStatusAvailable, out[5].Status)
	require.True(t, out[5].Configured)
	require.Equal(t, "mastodon", out[6].Platform)
	require.Equal(t, "Mastodon", out[6].DisplayName)
	require.Equal(t, "oauth_oob", out[6].AuthMode)
	require.True(t, out[6].Configured)
	require.Equal(t, providerStatusAvailable, out[6].Status)
	require.Equal(t, "Connect this configured Mastodon instance.", out[6].Description)
	require.Equal(t, coreProviderCapabilities, out[6].Capabilities)
	require.Equal(t, "Personal", out[6].Name)
	require.Equal(t, "https://masto.pt", out[6].InstanceURL)
	require.True(t, out[6].Readiness.Connectable)
	require.Equal(t, "pixelfed", out[7].Platform)
	require.Equal(t, "Pixelfed", out[7].DisplayName)
	require.Equal(t, "peertube", out[8].Platform)
	require.Equal(t, "lemmy", out[9].Platform)
	require.Equal(t, "piefed", out[10].Platform)
	require.Equal(t, "linkedin", out[11].Platform)
	require.Equal(t, "threads", out[12].Platform)
	require.Equal(t, "instagram", out[13].Platform)
	require.Equal(t, "facebook", out[14].Platform)
	require.Equal(t, "youtube", out[15].Platform)
	require.Equal(t, "googlebusiness", out[16].Platform)
	require.Equal(t, "Google Business", out[16].DisplayName)
	require.False(t, out[16].Configured)
	require.Contains(t, out[16].Capabilities, "Local posts")
	require.Equal(t, "tiktok", out[17].Platform)
	require.Equal(t, "OAuth app connection for TikTok videos and photo posts.", out[17].Description)
	require.Contains(t, out[17].Capabilities, "Short videos")
	require.Contains(t, out[17].Capabilities, "Photo posts")
}

func TestTelegramConnectionAvailabilityFollowsReadiness(t *testing.T) {
	for _, approved := range []bool{false, true} {
		t.Run(map[bool]string{false: "review missing", true: "review current"}[approved], func(t *testing.T) {
			e := echo.New()
			api := humaecho.NewWithGroup(e, e.Group("/api/v1"), huma.DefaultConfig("Test", "1.0.0"))
			handler := &OAuthHandler{auth: testAuthenticator{}}
			handler.readiness = oauthConnectionReadiness(t,
				&oauthReadinessLedger{control: providerreadiness.RuntimeControlStateEnabled, approved: approved},
				platform.AppConfig{Provider: "telegram", ConnectionMode: "bot", BotToken: "test-token", BotUsername: "test_bot", WebhookSecret: "test-secret"},
			)
			handler.ListProviders(api)
			req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/v1/accounts/providers", nil)
			req.Header.Set("Authorization", "Bearer web-token")
			rec := httptest.NewRecorder()
			e.ServeHTTP(rec, req)
			require.Equal(t, http.StatusOK, rec.Code)
			var providers []ProviderInfo
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &providers))
			for _, provider := range providers {
				if provider.Platform != "telegram" {
					continue
				}
				require.Equal(t, approved, provider.Configured)
				require.Equal(t, approved, provider.Readiness.Connectable)
				require.NotEqual(t, providerStatusPlanned, provider.Status)
				return
			}
			t.Fatal("Telegram missing from account providers")
		})
	}
}
