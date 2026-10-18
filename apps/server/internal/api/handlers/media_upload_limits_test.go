package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/openpost/backend/internal/services/entitlements"
	"github.com/stretchr/testify/require"
)

// TestMediaStorageReportsUploadLimits proves GET /media/storage publishes the
// same per-kind ceilings that mediaUploadSizeLimit enforces, so clients can
// validate against the server instead of restating its constants.
func TestMediaStorageReportsUploadLimits(t *testing.T) {
	storage := newFakeDirectUploadStorage()
	srv := newMediaDirectUploadTestServer(t, storage, entitlements.NewSelfHostedService())

	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/v1/media/storage?workspace_id=ws-1", nil)
	req.Header.Set("Authorization", "Bearer web-token")
	rec := httptest.NewRecorder()
	srv.echo.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	var body struct {
		UsedBytes     int64 `json:"used_bytes"`
		AssetCount    int   `json:"asset_count"`
		InternalBytes int64 `json:"internal_bytes"`
		LimitBytes    int64 `json:"limit_bytes"`
		UploadLimits  struct {
			DefaultBytes   int64 `json:"default_bytes"`
			VideoBytes     int64 `json:"video_bytes"`
			BrandFontBytes int64 `json:"brand_font_bytes"`
		} `json:"upload_limits"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))

	require.Equal(t, mediaUploadSizeLimit("", "photo.jpg", "image/jpeg"), body.UploadLimits.DefaultBytes)
	require.Equal(t, mediaUploadSizeLimit("", "clip.mp4", "video/mp4"), body.UploadLimits.VideoBytes)
	require.Equal(t, mediaUploadSizeLimit("brand_font", "font.woff2", "font/woff2"), body.UploadLimits.BrandFontBytes)
	require.Positive(t, body.UploadLimits.DefaultBytes)
	require.Positive(t, body.UploadLimits.VideoBytes)
	require.Positive(t, body.UploadLimits.BrandFontBytes)
	// limit_bytes keeps its current meaning: zero means no fixed quota exposed.
	require.Zero(t, body.LimitBytes)
}

// TestUploadSessionAdmissionAgreesWithAdvertisedLimits proves the advertised
// limits are the enforced ones: a session at the advertised limit is accepted
// and one byte over is rejected, for every published kind.
func TestUploadSessionAdmissionAgreesWithAdvertisedLimits(t *testing.T) {
	storage := newFakeDirectUploadStorage()
	srv := newMediaDirectUploadTestServer(t, storage, entitlements.NewSelfHostedService())

	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/v1/media/storage?workspace_id=ws-1", nil)
	req.Header.Set("Authorization", "Bearer web-token")
	rec := httptest.NewRecorder()
	srv.echo.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var advertised struct {
		UploadLimits struct {
			DefaultBytes   int64 `json:"default_bytes"`
			VideoBytes     int64 `json:"video_bytes"`
			BrandFontBytes int64 `json:"brand_font_bytes"`
		} `json:"upload_limits"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &advertised))

	cases := []struct {
		name      string
		limit     int64
		filename  string
		mimeType  string
		assetKind string
	}{
		{
			name:      "default",
			limit:     advertised.UploadLimits.DefaultBytes,
			filename:  "photo.jpg",
			mimeType:  "image/jpeg",
			assetKind: "library",
		},
		{
			name:      "video",
			limit:     advertised.UploadLimits.VideoBytes,
			filename:  "clip.mp4",
			mimeType:  "video/mp4",
			assetKind: "library",
		},
		{
			name:      "brand_font",
			limit:     advertised.UploadLimits.BrandFontBytes,
			filename:  "font.woff2",
			mimeType:  "font/woff2",
			assetKind: "brand_font",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.Positive(t, tc.limit, "advertised limit must be served before admission can agree with it")
			accepted := srv.postJSON(t, "/api/v1/media/upload-session", map[string]any{
				"workspace_id": "ws-1",
				"filename":     tc.filename,
				"mime_type":    tc.mimeType,
				"size":         tc.limit,
				"asset_kind":   tc.assetKind,
			})
			require.Equal(t, http.StatusOK, accepted.Code, accepted.Body.String())
			rejected := srv.postJSON(t, "/api/v1/media/upload-session", map[string]any{
				"workspace_id": "ws-1",
				"filename":     tc.filename,
				"mime_type":    tc.mimeType,
				"size":         tc.limit + 1,
				"asset_kind":   tc.assetKind,
			})
			require.Equal(t, http.StatusBadRequest, rejected.Code, rejected.Body.String())
		})
	}
}
