package analytics

import (
	"testing"
	"time"

	"github.com/openpost/backend/internal/platform"
	"github.com/stretchr/testify/require"
)

func TestExportGroupKeyFollowsTimezone(t *testing.T) {
	rome, err := time.LoadLocation("Europe/Rome")
	require.NoError(t, err)
	// 23:30 UTC on Sunday 4 Oct is already Monday 5 Oct in Rome.
	item := ContentOverview{PublishedAt: time.Date(2026, time.October, 4, 23, 30, 0, 0, time.UTC)}

	day, _ := exportGroupKey(item, ExportGroupDay, time.UTC)
	require.Equal(t, "2026-10-04", day)
	day, _ = exportGroupKey(item, ExportGroupDay, rome)
	require.Equal(t, "2026-10-05", day)

	week, _ := exportGroupKey(item, ExportGroupWeek, time.UTC)
	require.Equal(t, "2026-09-28", week, "weeks start on Monday")
	week, _ = exportGroupKey(item, ExportGroupWeek, rome)
	require.Equal(t, "2026-10-05", week)

	month, _ := exportGroupKey(item, ExportGroupMonth, rome)
	require.Equal(t, "2026-10", month)
}

func TestExportGroupedTableKeepsUnmeasuredMetricsEmpty(t *testing.T) {
	published := time.Date(2026, time.October, 1, 10, 0, 0, 0, time.UTC)
	content := []ContentOverview{
		{Platform: "x", PublishedAt: published, MetricAvailability: "available", Engagement: 10, Metrics: platform.AnalyticsValues{"views": 100, "likes": 0}},
		{Platform: "x", PublishedAt: published, MetricAvailability: "available", Engagement: 5, Metrics: platform.AnalyticsValues{"views": 50, "likes": 0}},
		{Platform: "bluesky", PublishedAt: published, MetricAvailability: "pending"},
		{Platform: "threads", PublishedAt: published, MetricAvailability: "available", Metrics: platform.AnalyticsValues{"views": 7}},
	}

	table := exportGroupedTable(content, []string{"views", "likes"}, ExportGroupPlatform, time.UTC)

	require.Equal(t, []string{"Platform", "Posts", "Engagement", "Views", "Likes"}, table.Columns)
	require.Equal(t, [][]any{
		{"x", 2, int64(15), int64(150), int64(0)},
		{"bluesky", 1, nil, nil, nil},
		{"threads", 1, nil, int64(7), nil},
	}, table.Rows, "a measured zero stays 0 and an unmeasured value stays empty")
}

func TestNormalizeExportGroupBy(t *testing.T) {
	value, err := NormalizeExportGroupBy("")
	require.NoError(t, err)
	require.Equal(t, ExportGroupPost, value)
	_, err = NormalizeExportGroupBy("hour")
	require.ErrorIs(t, err, ErrInvalidExportOptions)
}
