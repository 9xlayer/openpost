package messaging

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/platform"
	"github.com/openpost/backend/internal/services/inboxchanges"
	"github.com/openpost/backend/internal/services/organizationguard"
	"github.com/openpost/backend/internal/services/workspaceaccess"
	"github.com/uptrace/bun"
)

func (s *Service) QueueHistory(ctx context.Context, actor Actor, workspaceID, conversationID string) error {
	if err := s.authorize(ctx, workspaceID, actor, workspaceaccess.LevelRead); err != nil {
		return err
	}
	var c models.Conversation
	if err := s.db.NewSelect().Model(&c).Where("id=? AND workspace_id=?", conversationID, workspaceID).Scan(ctx); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	var account models.SocialAccount
	if err := s.db.NewSelect().Model(&account).Where("id=? AND workspace_id=? AND is_active=?", c.SocialAccountID, workspaceID, true).Scan(ctx); err != nil {
		return err
	}
	if _, ok := s.provider(account).(platform.MessageHistoryAdapter); !ok {
		return nil
	}
	if !s.isMessagingEnabled(ctx, account.ID) {
		return errors.New("messaging is disabled for this account")
	}
	payload, _ := json.Marshal(subjectJob{ID: account.ID, ConversationID: c.ID})
	_, err := s.enqueue(ctx, workspaceID, JobTypeMessagesSync, string(payload), s.now())
	return err
}

func (s *Service) syncHistory(ctx context.Context, accountID, conversationID string) error {
	var account models.SocialAccount
	if err := s.db.NewSelect().Model(&account).Where("id=? AND is_active=?", accountID, true).Scan(ctx); err != nil {
		return err
	}
	if !s.isMessagingEnabled(ctx, account.ID) {
		return errors.New("messaging is disabled for this account")
	}
	provider, ok := s.provider(account).(platform.MessageHistoryAdapter)
	if !ok {
		return nil
	}
	var c models.Conversation
	if err := s.db.NewSelect().Model(&c).Where("id=? AND social_account_id=? AND workspace_id=?", conversationID, accountID, account.WorkspaceID).Scan(ctx); err != nil {
		return err
	}
	var checkpoint struct {
		Cursor   string
		Complete bool
	}
	err := s.db.NewRaw(`SELECT cursor,complete FROM message_history_checkpoints WHERE conversation_id=?`, c.ID).Scan(ctx, &checkpoint)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if checkpoint.Complete {
		return nil
	}
	token, err := s.messagingToken(ctx, account)
	if err != nil {
		return err
	}
	page, err := provider.FetchMessageHistory(ctx, token, platform.FetchMessageHistoryRequest{AccountID: account.AccountID, ConversationID: c.RemoteConversationID, Cursor: checkpoint.Cursor, Limit: 100})
	if err != nil {
		return err
	}
	return s.db.RunInTx(ctx, &sql.TxOptions{}, func(txCtx context.Context, tx bun.Tx) error {
		if err := organizationguard.LockWorkspace(txCtx, tx, account.WorkspaceID); err != nil {
			return err
		}
		// History is not a new incoming event: retain its position and unread state.
		for _, remote := range page.Messages {
			if _, err := insertProviderMessage(txCtx, tx, account, c.ID, remote, s.now()); err != nil {
				return err
			}
		}
		for _, deleted := range page.DeletedMessages {
			if _, err := tx.NewUpdate().Model((*models.DirectMessage)(nil)).Set("body=''").Set("attachments_json='[]'").Set("author_remote_id=''").Set("deleted_at=?", s.now()).Set("updated_at=?", s.now()).Where("conversation_id=? AND remote_message_id=?", c.ID, deleted.MessageID).Exec(txCtx); err != nil {
				return err
			}
		}
		_, err := tx.NewRaw(`INSERT INTO message_history_checkpoints(conversation_id,cursor,complete) VALUES(?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET cursor=EXCLUDED.cursor,complete=EXCLUDED.complete`, c.ID, page.NextCursor, page.NextCursor == "").Exec(txCtx)
		if err != nil {
			return err
		}
		return inboxchanges.Append(txCtx, tx, account.WorkspaceID, inboxchanges.Change{Kind: "message", ConversationID: c.ID})
	})
}

func (s *Service) historyAvailable(ctx context.Context, conversation models.Conversation) (bool, error) {
	var account models.SocialAccount
	if err := s.db.NewSelect().Model(&account).Where("id=? AND workspace_id=?", conversation.SocialAccountID, conversation.WorkspaceID).Scan(ctx); err != nil {
		return false, err
	}
	if _, ok := s.provider(account).(platform.MessageHistoryAdapter); !ok {
		return false, nil
	}
	var complete bool
	err := s.db.NewRaw(`SELECT complete FROM message_history_checkpoints WHERE conversation_id=?`, conversation.ID).Scan(ctx, &complete)
	if errors.Is(err, sql.ErrNoRows) {
		return true, nil
	}
	return !complete, err
}
