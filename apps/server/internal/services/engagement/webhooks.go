package engagement

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/services/inboxchanges"
	"github.com/uptrace/bun"
)

// RefreshFromWebhook queues only stored posts belonging to the receiving
// account. A bounded fallback covers provider events that omit a post ID.
func (s *Service) RefreshFromWebhook(ctx context.Context, accountID string, change json.RawMessage) error {
	var account models.SocialAccount
	if err := s.db.NewSelect().Model(&account).Where("id=? AND is_active=?", accountID, true).Scan(ctx); err != nil {
		return err
	}
	if !s.isEngagementEnabled(ctx, account.ID) {
		return nil
	}
	var payload struct {
		Value struct {
			PostID string `json:"post_id"`
			Media  struct {
				ID string `json:"id"`
			} `json:"media"`
		} `json:"value"`
	}
	if err := json.Unmarshal(change, &payload); err != nil {
		return err
	}
	postID := strings.TrimSpace(payload.Value.PostID)
	if postID == "" {
		postID = payload.Value.Media.ID
	}
	var renditions []models.Rendition
	query := s.db.NewSelect().Model(&renditions).Where("social_account_id=? AND status=? AND external_id<>''", account.ID, models.RenditionStatusPublished).Order("updated_at DESC").Limit(10)
	if postID != "" {
		query = query.Where("external_id=?", postID)
	}
	if err := query.Scan(ctx); err != nil {
		return err
	}
	for _, r := range renditions {
		payload, _ := json.Marshal(subjectJob{ID: r.ID})
		if _, err := s.enqueue(ctx, account.WorkspaceID, JobTypeEngagementSync, string(payload), s.now()); err != nil {
			return err
		}
	}
	return nil
}

// appendEngagementChange is called inside the same mutation transaction.
func appendEngagementChange(ctx context.Context, tx bun.IDB, item models.EngagementItem) error {
	return inboxchanges.Append(ctx, tx, item.WorkspaceID, inboxchanges.Change{Kind: "engagement", EngagementID: item.ID, Deleted: !item.DeletedAt.IsZero()})
}
