package messaging

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/platform"
	"github.com/openpost/backend/internal/services/inboxchanges"
	"github.com/openpost/backend/internal/services/organizationguard"
	"github.com/uptrace/bun"
)

// ApplyProviderEvents is the sole inbox ingress owner. Raw provider events have
// already been authenticated by their transport; this method rechecks current
// account eligibility, then commits normalized state and its checkpoint together.
func (s *Service) ApplyProviderEvents(ctx context.Context, accountID string, batch platform.FetchMessageEventsResult) error {
	var account models.SocialAccount
	if err := s.db.NewSelect().Model(&account).Where("id=? AND is_active=?", accountID, true).Scan(ctx); err != nil {
		return err
	}
	if !s.isMessagingEnabled(ctx, account.ID) {
		return fmt.Errorf("messaging is disabled for this account")
	}
	var received []receivedMessage
	err := s.db.RunInTx(ctx, &sql.TxOptions{}, func(txCtx context.Context, tx bun.Tx) error {
		if err := organizationguard.LockWorkspace(txCtx, tx, account.WorkspaceID); err != nil {
			return err
		}
		// The account can be disconnected while a transport callback is waiting.
		active, err := tx.NewSelect().Model((*models.SocialAccount)(nil)).Where("id=? AND workspace_id=? AND is_active=?", account.ID, account.WorkspaceID, true).Exists(txCtx)
		if err != nil {
			return err
		}
		if !active {
			return ErrNotFound
		}
		received, err = s.persistConversationsWithDB(txCtx, tx, account, batch.Conversations)
		if err != nil {
			return err
		}
		changes := []inboxchanges.Change{}
		for _, deleted := range batch.DeletedMessages {
			var messages []models.DirectMessage
			query := tx.NewSelect().Model(&messages).Join("JOIN conversations AS conversation ON conversation.id=direct_message.conversation_id").Where("conversation.social_account_id=? AND direct_message.remote_message_id=?", account.ID, deleted.MessageID)
			if deleted.ConversationID != "" {
				query = query.Where("conversation.remote_conversation_id=?", deleted.ConversationID)
			}
			if err = query.Scan(txCtx); err != nil {
				return err
			}
			for _, m := range messages {
				if !m.DeletedAt.IsZero() {
					continue
				}
				if _, err = tx.NewUpdate().Model(&m).Set("body=''").Set("attachments_json='[]'").Set("author_remote_id=''").Set("deleted_at=?", s.now()).Set("updated_at=?", s.now()).WherePK().Exec(txCtx); err != nil {
					return err
				}
				if _, err = tx.NewDelete().Table("message_reactions").Where("message_id=?", m.ID).Exec(txCtx); err != nil {
					return err
				}
				// Never retain a deleted message in the list preview.
				if _, err = tx.NewUpdate().Model((*models.Conversation)(nil)).Set("last_message_preview=''").Where("id=? AND last_remote_message_id=?", m.ConversationID, deleted.MessageID).Exec(txCtx); err != nil {
					return err
				}
				changes = append(changes, inboxchanges.Change{Kind: "message", ConversationID: m.ConversationID, MessageID: m.ID, Deleted: true})
			}
		}
		for _, read := range batch.ReadStates {
			var c models.Conversation
			if err = tx.NewSelect().Model(&c).Where("social_account_id=? AND remote_conversation_id=?", account.ID, read.ConversationID).Scan(txCtx); errors.Is(err, sql.ErrNoRows) {
				continue
			} else if err != nil {
				return err
			}
			if read.ActorRemoteID == account.AccountID {
				// A delayed own-read event cannot clear unread for a newer message.
				if read.MessageID != "" && read.MessageID == c.LastRemoteMessageID {
					if _, err = tx.NewUpdate().Model(&c).Set("unread_count=0").Set("read_at=?", s.now()).WherePK().Exec(txCtx); err != nil {
						return err
					}
					changes = append(changes, inboxchanges.Change{Kind: "conversation", ConversationID: c.ID})
				}
			} else if read.ActorRemoteID != "" && read.MessageID != "" {
				at := read.ReadAt
				if at.IsZero() {
					at = s.now()
				}
				var m models.DirectMessage
				if err = tx.NewSelect().Model(&m).Where("conversation_id=? AND remote_message_id=? AND direction='outbound'", c.ID, read.MessageID).Scan(txCtx); errors.Is(err, sql.ErrNoRows) {
					continue
				} else if err != nil {
					return err
				}
				if _, err = tx.NewUpdate().Model(&m).Set("provider_read_at=?", at).WherePK().Exec(txCtx); err != nil {
					return err
				}
				changes = append(changes, inboxchanges.Change{Kind: "message", ConversationID: c.ID, MessageID: m.ID})
			}
		}
		for _, reaction := range batch.Reactions {
			var m models.DirectMessage
			err = tx.NewSelect().Model(&m).Join("JOIN conversations AS conversation ON conversation.id=direct_message.conversation_id").Where("conversation.social_account_id=? AND conversation.remote_conversation_id=? AND direct_message.remote_message_id=? AND direct_message.deleted_at IS NULL", account.ID, reaction.ConversationID, reaction.MessageID).Scan(txCtx)
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			if err != nil {
				return err
			}
			if reaction.Deleted {
				_, err = tx.NewRaw(`DELETE FROM message_reactions WHERE message_id=? AND actor_remote_id=? AND value=?`, m.ID, reaction.ActorRemoteID, reaction.Value).Exec(txCtx)
			} else {
				_, err = tx.NewRaw(`INSERT INTO message_reactions(message_id,actor_remote_id,value) VALUES(?,?,?) ON CONFLICT DO NOTHING`, m.ID, reaction.ActorRemoteID, reaction.Value).Exec(txCtx)
			}
			if err != nil {
				return err
			}
			changes = append(changes, inboxchanges.Change{Kind: "message", ConversationID: m.ConversationID, MessageID: m.ID})
		}
		for _, remoteID := range batch.DeletedConversations {
			var c models.Conversation
			if err = tx.NewSelect().Model(&c).Where("social_account_id=? AND remote_conversation_id=?", account.ID, remoteID).Scan(txCtx); errors.Is(err, sql.ErrNoRows) {
				continue
			} else if err != nil {
				return err
			}
			// Keep local pending writes and operation receipts inspectable, but remove
			// provider content and archive a conversation no longer accessible remotely.
			if _, err = tx.NewUpdate().Model((*models.DirectMessage)(nil)).Set("body=''").Set("attachments_json='[]'").Set("deleted_at=?", s.now()).Where("conversation_id=? AND remote_message_id<>''", c.ID).Exec(txCtx); err != nil {
				return err
			}
			if _, err = tx.NewUpdate().Model(&c).Set("archived_at=?", s.now()).Set("last_message_preview=''").Set("unread_count=0").WherePK().Exec(txCtx); err != nil {
				return err
			}
			changes = append(changes, inboxchanges.Change{Kind: "conversation", ConversationID: c.ID, Deleted: true})
		}
		if batch.NextCursor != "" {
			if _, err = tx.NewRaw(`INSERT INTO message_event_checkpoints(social_account_id,cursor) VALUES(?,?) ON CONFLICT(social_account_id) DO UPDATE SET cursor=EXCLUDED.cursor`, account.ID, batch.NextCursor).Exec(txCtx); err != nil {
				return err
			}
		}
		return inboxchanges.Append(txCtx, tx, account.WorkspaceID, changes...)
	})
	if err == nil {
		s.notifyReceivedMessages(ctx, account, received)
	}
	return err
}
