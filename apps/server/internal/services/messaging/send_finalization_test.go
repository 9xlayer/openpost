package messaging

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/openpost/backend/internal/database"
	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/platform"
	"github.com/openpost/backend/internal/services/providerwrite"
	"github.com/stretchr/testify/require"
)

type sendRequestProvider struct {
	testProvider
	sendRequest func(context.Context, platform.SendMessageRequest) (platform.SendMessageResult, error)
}

func (p sendRequestProvider) SendMessage(ctx context.Context, _ string, request platform.SendMessageRequest) (platform.SendMessageResult, error) {
	return p.sendRequest(ctx, request)
}

func TestQueuedReplyTargetSurvivesIncomingMessagesAndSafeRetry(t *testing.T) {
	for _, backend := range []string{"sqlite", "postgres"} {
		for _, provider := range []string{"mastodon", "bluesky"} {
			t.Run(backend+"/"+provider, func(t *testing.T) {
				s, db, account, actor := messagingBackendFixture(t, backend)
				now := time.Now().UTC().Truncate(time.Second).Add(time.Hour)
				s.now = func() time.Time { return now }
				account.Platform = provider
				_, err := db.NewUpdate().Model(&account).Column("platform").WherePK().Exec(t.Context())
				require.NoError(t, err)
				_, err = db.NewUpdate().Model((*models.Conversation)(nil)).Set("platform=?", provider).Set("last_remote_message_id=?", "admitted-thread-anchor").Set("counterpart_remote_id=?", "friend").Set("counterpart_handle=?", "friend@example.test").Where("id=?", "conversation").Exec(t.Context())
				require.NoError(t, err)
				requests := []platform.SendMessageRequest{}
				failure := &platform.HTTPError{StatusCode: http.StatusBadRequest}
				s.SetProvider(providerKey(account), sendRequestProvider{sendRequest: func(_ context.Context, request platform.SendMessageRequest) (platform.SendMessageResult, error) {
					requests = append(requests, request)
					if len(requests) == 1 {
						return platform.SendMessageResult{}, failure
					}
					return platform.SendMessageResult{RemoteMessageID: "sent-reply"}, nil
				}})
				message, err := s.QueueMessage(t.Context(), actor, "conversation", " continue this conversation ", "stable-reply-operation")
				require.NoError(t, err)
				incoming := func(id string) {
					t.Helper()
					now = now.Add(time.Second)
					require.NoError(t, s.ApplyProviderEvents(t.Context(), account.ID, platform.FetchMessageEventsResult{Conversations: []platform.ProviderConversation{{ID: "remote-thread", LastRemoteMessageID: id, LastMessageAt: now, LastMessagePreview: "a newer incoming message", Messages: []platform.ProviderMessage{{ID: id, Direction: "inbound", Body: "a newer incoming message", RemoteCreatedAt: now}}}}}))
				}
				incoming("arrived-after-admission")
				require.ErrorIs(t, s.HandleJob(t.Context(), JobTypeMessageSend, `{"id":"`+message.ID+`"}`), failure)
				incoming("arrived-before-retry")
				retried, err := s.RetryMessage(t.Context(), actor, "workspace", "conversation", message.ID)
				require.NoError(t, err)
				require.Equal(t, message.ID, retried.ID)
				require.NoError(t, s.HandleJob(t.Context(), JobTypeMessageSend, `{"id":"`+message.ID+`"}`))
				wantReplyTarget := ""
				if provider == "mastodon" {
					wantReplyTarget = "admitted-thread-anchor"
				}
				wantRequest := platform.SendMessageRequest{AccountID: account.AccountID, RemoteConversationID: "remote-thread", CounterpartRemoteID: "friend", CounterpartHandle: "friend@example.test", ReplyToRemoteID: wantReplyTarget, Body: "continue this conversation"}
				require.Equal(t, []platform.SendMessageRequest{wantRequest, wantRequest}, requests)
				var attempts []models.ProviderWriteAttempt
				require.NoError(t, db.NewSelect().Model(&attempts).Where("operation_id=?", "messaging:"+message.ID).Order("attempt_number ASC").Scan(t.Context()))
				require.Len(t, attempts, 2)
				require.Equal(t, attempts[0].PayloadFingerprint, attempts[1].PayloadFingerprint)
				require.Equal(t, providerwrite.StatusDefiniteFailure, attempts[0].Status)
				require.Equal(t, providerwrite.StatusAccepted, attempts[1].Status)
				require.Equal(t, "sent-reply", attempts[1].ExternalID)
				replay, err := s.QueueMessage(t.Context(), actor, "conversation", "continue this conversation", "stable-reply-operation")
				require.NoError(t, err)
				require.Equal(t, message.ID, replay.ID)
				encoded, err := json.Marshal(replay)
				require.NoError(t, err)
				require.NotContains(t, string(encoded), "reply_to_remote_id", "transport context is internal, not a public message field")
			})
		}
	}
}

func TestReplyTargetMigrationPreservesAttemptedRequests(t *testing.T) {
	for _, backend := range []string{"sqlite", "postgres"} {
		t.Run(backend, func(t *testing.T) {
			s, db, account, actor := messagingBackendFixture(t, backend)
			account.Platform = "mastodon"
			_, err := db.NewUpdate().Model(&account).Column("platform").WherePK().Exec(t.Context())
			require.NoError(t, err)
			_, err = db.NewUpdate().Model((*models.Conversation)(nil)).Set("platform='mastodon'").Set("last_remote_message_id='legacy-anchor'").Where("id=?", "conversation").Exec(t.Context())
			require.NoError(t, err)
			requests := []platform.SendMessageRequest{}
			failure := &platform.HTTPError{StatusCode: http.StatusBadRequest}
			s.SetProvider(providerKey(account), sendRequestProvider{sendRequest: func(_ context.Context, request platform.SendMessageRequest) (platform.SendMessageResult, error) {
				requests = append(requests, request)
				if len(requests) == 1 {
					return platform.SendMessageResult{}, failure
				}
				id := "accepted-attempted-legacy"
				if len(requests) > 2 {
					id = "accepted-unattempted-legacy"
				}
				return platform.SendMessageResult{RemoteMessageID: id}, nil
			}})
			attempted, err := s.QueueMessage(t.Context(), actor, "conversation", "attempted legacy body", "attempted-legacy")
			require.NoError(t, err)
			// Before migration 169 every request had an empty reply field. Execute
			// that legacy request through the real fence before upgrading its row.
			_, err = db.NewUpdate().Model((*models.DirectMessage)(nil)).Set("reply_to_remote_id=''").Where("id=?", attempted.ID).Exec(t.Context())
			require.NoError(t, err)
			require.ErrorIs(t, s.HandleJob(t.Context(), JobTypeMessageSend, `{"id":"`+attempted.ID+`"}`), failure)
			unattempted, err := s.QueueMessage(t.Context(), actor, "conversation", "unattempted legacy body", "unattempted-legacy")
			require.NoError(t, err)
			for _, statement := range []string{
				`ALTER TABLE direct_messages DROP COLUMN reply_to_remote_id`,
				`DELETE FROM schema_migrations WHERE version=169`,
				`UPDATE conversations SET last_remote_message_id='migration-current-anchor' WHERE id='conversation'`,
			} {
				_, err := db.NewRaw(statement).Exec(t.Context())
				require.NoError(t, err)
			}
			require.NoError(t, database.CreateSchema(db))
			var stored models.DirectMessage
			require.NoError(t, db.NewSelect().Model(&stored).Where("id=?", attempted.ID).Scan(t.Context()))
			require.Empty(t, stored.ReplyToRemoteID, "an attempted legacy request must retain its fenced payload")
			require.Equal(t, "attempted legacy body", stored.Body)
			require.NoError(t, db.NewSelect().Model(&stored).Where("id=?", unattempted.ID).Scan(t.Context()))
			require.Equal(t, "migration-current-anchor", stored.ReplyToRemoteID)
			require.Equal(t, "unattempted legacy body", stored.Body)
			_, err = s.RetryMessage(t.Context(), actor, "workspace", "conversation", attempted.ID)
			require.NoError(t, err)
			require.NoError(t, s.HandleJob(t.Context(), JobTypeMessageSend, `{"id":"`+attempted.ID+`"}`))
			require.NoError(t, s.HandleJob(t.Context(), JobTypeMessageSend, `{"id":"`+unattempted.ID+`"}`))
			require.Len(t, requests, 3)
			require.Equal(t, requests[0], requests[1], "migration and new incoming context must not alter a prior operation's request")
			require.Empty(t, requests[1].ReplyToRemoteID)
			require.Equal(t, "migration-current-anchor", requests[2].ReplyToRemoteID)
			var attempts []models.ProviderWriteAttempt
			require.NoError(t, db.NewSelect().Model(&attempts).Where("operation_id=?", "messaging:"+attempted.ID).Order("attempt_number ASC").Scan(t.Context()))
			require.Len(t, attempts, 2)
			require.Equal(t, attempts[0].PayloadFingerprint, attempts[1].PayloadFingerprint)
			require.Equal(t, providerwrite.StatusAccepted, attempts[1].Status)
		})
	}
}
