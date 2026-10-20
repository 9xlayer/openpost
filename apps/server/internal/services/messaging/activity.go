package messaging

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/services/inboxchanges"
	"github.com/openpost/backend/internal/services/workspaceaccess"
	"github.com/uptrace/bun"
)

type Activity struct {
	WorkspaceID    string
	ClientID       string
	View           string
	ConversationID string
}

func (s *Service) Heartbeat(ctx context.Context, actor Actor, input Activity) error {
	if err := s.authorize(ctx, input.WorkspaceID, actor, workspaceaccess.LevelRead); err != nil {
		return err
	}
	input.ClientID = strings.TrimSpace(input.ClientID)
	if input.ClientID == "" || len(input.ClientID) > 128 {
		return errors.New("client ID is required and must be at most 128 characters")
	}
	if input.View != "chats" && input.View != "comments" && input.View != "conversation" && input.View != "away" {
		return errors.New("invalid inbox view")
	}
	if input.View == "away" {
		_, err := s.db.NewRaw(`DELETE FROM inbox_activity WHERE workspace_id=? AND user_id=? AND client_id=?`, input.WorkspaceID, actor.UserID, input.ClientID).Exec(ctx)
		return err
	}
	accountID := ""
	if input.View == "conversation" {
		var conversation models.Conversation
		if err := s.db.NewSelect().Model(&conversation).Where("id=? AND workspace_id=?", input.ConversationID, input.WorkspaceID).Scan(ctx); errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		} else if err != nil {
			return err
		}
		accountID = conversation.SocialAccountID
	} else {
		input.ConversationID = ""
	}
	_, err := s.db.NewRaw(`INSERT INTO inbox_activity(workspace_id,user_id,client_id,view,conversation_id,social_account_id,expires_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(workspace_id,user_id,client_id) DO UPDATE SET view=EXCLUDED.view, conversation_id=EXCLUDED.conversation_id,social_account_id=EXCLUDED.social_account_id,expires_at=EXCLUDED.expires_at`, input.WorkspaceID, actor.UserID, input.ClientID, input.View, input.ConversationID, accountID, s.now().Add(time.Minute)).Exec(ctx)
	return err
}

type InboxChangePage struct {
	inboxchanges.Page
	Messages      []models.DirectMessage `json:"messages"`
	Conversations []models.Conversation  `json:"conversations"`
}

func (s *Service) Changes(ctx context.Context, actor Actor, workspaceID, cursor string, wait time.Duration) (InboxChangePage, error) {
	page, err := inboxchanges.Wait(ctx, s.db, workspaceID, cursor, wait, func(checkCtx context.Context) error {
		if err := s.credentialAlive(checkCtx, actor); err != nil {
			return err
		}
		return s.authorize(checkCtx, workspaceID, actor, workspaceaccess.LevelRead)
	})
	result := InboxChangePage{Page: page, Messages: []models.DirectMessage{}, Conversations: []models.Conversation{}}
	if err != nil {
		return result, err
	}
	messageIDs, conversationIDs := []string{}, []string{}
	for _, c := range page.Changes {
		if c.MessageID != "" {
			messageIDs = append(messageIDs, c.MessageID)
		}
		if c.ConversationID != "" {
			conversationIDs = append(conversationIDs, c.ConversationID)
		}
	}
	if len(messageIDs) > 0 {
		if err = s.db.NewSelect().Model(&result.Messages).Where("workspace_id=? AND id IN (?)", workspaceID, bun.In(messageIDs)).Scan(ctx); err != nil {
			return result, err
		}
	}
	if len(conversationIDs) > 0 {
		if err = s.db.NewSelect().Model(&result.Conversations).Where("workspace_id=? AND id IN (?)", workspaceID, bun.In(conversationIDs)).Scan(ctx); err != nil {
			return result, err
		}
	}
	if err = s.credentialAlive(ctx, actor); err != nil {
		return result, err
	}
	return result, s.authorize(ctx, workspaceID, actor, workspaceaccess.LevelRead)
}

func (s *Service) credentialAlive(ctx context.Context, actor Actor) error {
	var valid bool
	var err error
	if actor.SessionID != "" {
		valid, err = s.db.NewSelect().Model((*models.UserSession)(nil)).Where("id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?", actor.SessionID, actor.UserID, s.now()).Exists(ctx)
	} else if actor.TokenID != "" {
		valid, err = s.db.NewSelect().Model((*models.APIToken)(nil)).Where("id=? AND user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)", actor.TokenID, actor.UserID, s.now()).Exists(ctx)
	} else {
		return nil
	} // Trusted internal service actors, HTTP always has a credential.
	if err != nil {
		return err
	}
	if !valid {
		return ErrAccessDenied
	}
	return nil
}

type InboxSummary struct {
	UnreadConversations int `json:"unread_conversations"`
	UnreadComments      int `json:"unread_comments"`
}

func (s *Service) Summary(ctx context.Context, actor Actor, workspaceID string) (InboxSummary, error) {
	result := InboxSummary{}
	if err := s.authorize(ctx, workspaceID, actor, workspaceaccess.LevelRead); err != nil {
		return result, err
	}
	var err error
	result.UnreadConversations, err = s.db.NewSelect().Model((*models.Conversation)(nil)).Where("workspace_id=? AND archived_at IS NULL AND unread_count>0", workspaceID).Count(ctx)
	if err != nil {
		return result, err
	}
	result.UnreadComments, err = s.db.NewSelect().Model((*models.EngagementItem)(nil)).Where("workspace_id=? AND archived_at IS NULL AND read_at IS NULL AND deleted_at IS NULL AND is_ours=?", workspaceID, false).Count(ctx)
	return result, err
}
