package analytics

import (
	"testing"
	"time"

	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/platform"
	"github.com/stretchr/testify/require"
)

// TestOverviewPublishedCountsPublishedDestinations locks the documented
// definition of Summary.Published for getopenpost/openpost#361: it counts
// published destination outputs (renditions), not publications. One
// publication with two published renditions contributes 2, while a failed
// rendition on another published publication contributes 0. PublicationTotal
// carries the distinct-post count so readers can reconcile the tile with the
// Posts "Published" tab, which filters by publication status.
func TestOverviewPublishedCountsPublishedDestinations(t *testing.T) {
	db := newAnalyticsTestDB(t)
	ctx := t.Context()
	account := seedAnalyticsAccount(t, db, "")
	secondAccount := models.SocialAccount{
		ID:              "account-2",
		WorkspaceID:     account.WorkspaceID,
		Slug:            "test-account-2",
		Platform:        account.Platform,
		AccountID:       "provider-account-2",
		AccountUsername: "person-2",
		AccessTokenEnc:  []byte("encrypted"),
		IsActive:        true,
		CreatedAt:       time.Now().UTC(),
	}
	_, err := db.NewInsert().Model(&secondAccount).Exec(ctx)
	require.NoError(t, err)

	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	published := seedAnalyticsPublication(t, db, account.WorkspaceID, "publication-published", now)
	for _, rendition := range []models.Rendition{
		{ID: "rendition-ok-1", PublicationID: published.ID, SocialAccountID: account.ID, Platform: account.Platform, Status: models.RenditionStatusPublished, CreatedAt: now, UpdatedAt: now},
		{ID: "rendition-ok-2", PublicationID: published.ID, SocialAccountID: secondAccount.ID, Platform: secondAccount.Platform, Status: models.RenditionStatusPublished, CreatedAt: now, UpdatedAt: now},
	} {
		_, err := db.NewInsert().Model(&rendition).Exec(ctx)
		require.NoError(t, err)
	}

	mixed := seedAnalyticsPublication(t, db, account.WorkspaceID, "publication-mixed", now)
	failed := models.Rendition{ID: "rendition-failed", PublicationID: mixed.ID, SocialAccountID: account.ID, Platform: account.Platform, Status: models.RenditionStatusFailed, CreatedAt: now, UpdatedAt: now}
	_, err = db.NewInsert().Model(&failed).Exec(ctx)
	require.NoError(t, err)

	service := NewService(db, staticTokenSource{})
	service.SetProvider("test", &fakeAnalyticsAdapter{support: platform.AnalyticsSupport{Account: true, Content: true}})
	service.now = func() time.Time { return now }

	overview, err := service.Overview(ctx, account.WorkspaceID, 30)
	require.NoError(t, err)

	require.Equal(t, 2, overview.Summary.Published, "Summary.Published counts published destination outputs")
	require.Equal(t, 2, overview.ContentTotal)
	require.Equal(t, 1, overview.PublicationTotal, "PublicationTotal counts distinct published posts")
	require.Len(t, overview.Content, 2)
	for _, item := range overview.Content {
		require.Equal(t, published.ID, item.PublicationID)
		require.NotEqual(t, failed.ID, item.RenditionID)
	}
}
