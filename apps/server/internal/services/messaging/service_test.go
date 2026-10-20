package messaging

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/openpost/backend/internal/database"
	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/platform"
	"github.com/stretchr/testify/require"
	"github.com/uptrace/bun"
)

type testGate struct{}

func (testGate) IsEffectiveEnabled(context.Context, string, string) (bool, error) { return true, nil }

type testToken struct{}

func (testToken) GetValidAccessToken(context.Context, string) (string, error) { return "token", nil }

type testProvider struct {
	fetch func() (platform.FetchMessagesResult, error)
	send  func(context.Context) (platform.SendMessageResult, error)
}

func (testProvider) MessagingSupport() platform.MessagingSupport {
	return platform.MessagingSupport{Enabled: true, CanSend: true}
}
func (p testProvider) FetchMessages(context.Context, string, platform.FetchMessagesRequest) (platform.FetchMessagesResult, error) {
	if p.fetch != nil {
		return p.fetch()
	}
	return platform.FetchMessagesResult{}, nil
}
func (p testProvider) SendMessage(ctx context.Context, _ string, _ platform.SendMessageRequest) (platform.SendMessageResult, error) {
	return p.send(ctx)
}

func messagingFixture(t *testing.T) (*Service, *bun.DB, models.SocialAccount, Actor) {
	t.Helper()
	db, err := database.InitDBWithDriver("sqlite", fmt.Sprintf("file:messaging-%d?mode=memory&cache=shared", time.Now().UnixNano()))
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, db.Close()) })
	require.NoError(t, database.CreateSchema(db))
	now := time.Now().UTC()
	account := models.SocialAccount{ID: "account", WorkspaceID: "workspace", Platform: "bluesky", AccountID: "did:plc:self", Slug: "self", AccessTokenEnc: []byte("token"), IsActive: true}
	for _, row := range []any{
		&models.User{ID: "user", Email: "chat@example.test", PasswordHash: "hash", CreatedAt: now},
		&models.Organization{ID: "org", Name: "Org", CreatedByID: "user", CreatedAt: now, UpdatedAt: now},
		&models.Workspace{ID: "workspace", Name: "Workspace", OrganizationID: "org", CreatedAt: now},
		&models.WorkspaceMember{WorkspaceID: "workspace", UserID: "user", Role: models.WorkspaceRoleAdmin, Status: models.WorkspaceMemberStatusActive, CreatedAt: now},
		&account,
		&models.Conversation{ID: "conversation", WorkspaceID: "workspace", SocialAccountID: "account", Platform: "bluesky", RemoteConversationID: "remote-thread", LastMessageAt: now, CreatedAt: now, UpdatedAt: now},
	} {
		_, err = db.NewInsert().Model(row).Exec(t.Context())
		require.NoError(t, err)
	}
	s := NewService(db, testToken{}, nil)
	s.SetFeatureGate(testGate{})
	return s, db, account, Actor{UserID: "user"}
}

// A provider can deliver its outbound echo while the HTTP send is still returning.
// The admitted local ID must survive so clients can reconcile their optimistic bubble.
func TestSendReconcilesEchoBeforeAcceptance(t *testing.T) {
	s, db, account, actor := messagingFixture(t)
	s.SetProvider("bluesky", testProvider{send: func(ctx context.Context) (platform.SendMessageResult, error) {
		_, err := s.persistConversations(ctx, account, []platform.ProviderConversation{{ID: "remote-thread", LastMessageAt: s.now(), Messages: []platform.ProviderMessage{{ID: "remote-message", Direction: "outbound", Body: "hello", RemoteCreatedAt: s.now()}}}})
		return platform.SendMessageResult{RemoteMessageID: "remote-message"}, err
	}})
	queued, err := s.QueueMessage(t.Context(), actor, "conversation", "hello")
	require.NoError(t, err)
	require.NoError(t, s.HandleJob(t.Context(), JobTypeMessageSend, `{"id":"`+queued.ID+`"}`))
	page, err := s.ListMessages(t.Context(), actor, MessageQuery{WorkspaceID: "workspace", ConversationID: "conversation"})
	require.NoError(t, err)
	require.Len(t, page.Items, 1)
	require.Equal(t, queued.ID, page.Items[0].ID)
	require.Equal(t, "sent", page.Items[0].SendStatus)
	require.Equal(t, "remote-message", page.Items[0].RemoteMessageID)
	var jobs int
	require.NoError(t, db.NewSelect().Model((*models.Job)(nil)).ColumnExpr("COUNT(*)").Scan(t.Context(), &jobs))
	require.Equal(t, 1, jobs)
}

func TestUnreadAndArchiveSurviveIncomingCollection(t *testing.T) {
	s, _, account, actor := messagingFixture(t)
	read, archived := false, true
	require.NoError(t, s.SetConversationState(t.Context(), actor, "workspace", "conversation", &read, &archived))
	page, err := s.ListConversations(t.Context(), actor, ConversationQuery{WorkspaceID: "workspace", UnreadOnly: true, Archived: true})
	require.NoError(t, err)
	require.Len(t, page.Items, 1, "mark unread must restore an unread indicator")
	_, err = s.persistConversations(t.Context(), account, []platform.ProviderConversation{{ID: "remote-thread", LastMessageAt: s.now(), Messages: []platform.ProviderMessage{{ID: "incoming", Direction: "inbound", Body: "new reply", RemoteCreatedAt: s.now()}}}})
	require.NoError(t, err)
	page, err = s.ListConversations(t.Context(), actor, ConversationQuery{WorkspaceID: "workspace", UnreadOnly: true})
	require.NoError(t, err)
	require.Len(t, page.Items, 1, "new incoming messages must reopen archived chats")
}

func TestMessageOperationReplayAndConflict(t *testing.T) {
	s, db, _, actor := messagingFixture(t)
	s.SetProvider("bluesky", testProvider{})
	first, err := s.QueueMessage(t.Context(), actor, "conversation", "same text", "operation-1")
	require.NoError(t, err)
	replay, err := s.QueueMessage(t.Context(), actor, "conversation", "same text", "operation-1")
	require.NoError(t, err)
	require.Equal(t, first.ID, replay.ID)
	require.Equal(t, "operation-1", replay.ClientOperationID)
	_, err = s.QueueMessage(t.Context(), actor, "conversation", "changed text", "operation-1")
	require.ErrorIs(t, err, ErrOperationConflict)
	other, err := s.QueueMessage(t.Context(), actor, "conversation", "same text", "operation-2")
	require.NoError(t, err)
	require.NotEqual(t, first.ID, other.ID, "identical text is not an idempotency key")
	count, err := db.NewSelect().Model((*models.Job)(nil)).Count(t.Context())
	require.NoError(t, err)
	require.Equal(t, 2, count)
}

func TestInboxEventsReplayDeleteAndAuthorization(t *testing.T) {
	s, db, account, actor := messagingFixture(t)
	initial, err := s.Changes(t.Context(), actor, "workspace", "", 0)
	require.NoError(t, err)
	batch := platform.FetchMessageEventsResult{NextCursor: "revision-1", Conversations: []platform.ProviderConversation{{ID: "remote-thread", LastMessageAt: s.now(), LastRemoteMessageID: "inbound-1", LastMessagePreview: "private body", Messages: []platform.ProviderMessage{{ID: "inbound-1", Direction: "inbound", Body: "private body", RemoteCreatedAt: s.now()}}}}}
	require.NoError(t, s.ApplyProviderEvents(t.Context(), account.ID, batch))
	require.NoError(t, s.ApplyProviderEvents(t.Context(), account.ID, batch))
	page, err := s.ListConversations(t.Context(), actor, ConversationQuery{WorkspaceID: "workspace", UnreadOnly: true, Search: "private body"})
	require.NoError(t, err)
	require.Len(t, page.Items, 1)
	require.Equal(t, 1, page.Items[0].UnreadCount)
	changes, err := s.Changes(t.Context(), actor, "workspace", initial.Cursor, 0)
	require.NoError(t, err)
	require.Len(t, changes.Messages, 1)
	require.Equal(t, "private body", changes.Messages[0].Body)
	require.NoError(t, s.ApplyProviderEvents(t.Context(), account.ID, platform.FetchMessageEventsResult{NextCursor: "revision-2", DeletedMessages: []platform.DeletedProviderMessage{{MessageID: "inbound-1"}}}))
	removed, err := s.Changes(t.Context(), actor, "workspace", changes.Cursor, 0)
	require.NoError(t, err)
	require.Len(t, removed.Messages, 1)
	require.Empty(t, removed.Messages[0].Body)
	require.False(t, removed.Messages[0].DeletedAt.IsZero())
	var checkpoint string
	require.NoError(t, db.NewRaw(`SELECT cursor FROM message_event_checkpoints WHERE social_account_id=?`, account.ID).Scan(t.Context(), &checkpoint))
	require.Equal(t, "revision-2", checkpoint)
	_, err = db.NewUpdate().Model((*models.WorkspaceMember)(nil)).Set("status=?", models.WorkspaceMemberStatusInactive).Where("workspace_id=? AND user_id=?", "workspace", actor.UserID).Exec(t.Context())
	require.NoError(t, err)
	_, err = s.Changes(t.Context(), actor, "workspace", removed.Cursor, 0)
	require.ErrorIs(t, err, ErrAccessDenied)
}

func TestProviderReadFailureRemainsVisible(t *testing.T) {
	s, _, account, actor := messagingFixture(t)
	failure := fmt.Errorf("provider unavailable")
	s.SetProvider("bluesky", testProvider{fetch: func() (platform.FetchMessagesResult, error) { return platform.FetchMessagesResult{}, failure }})
	err := s.HandleJob(t.Context(), JobTypeMessagesSync, `{"id":"`+account.ID+`"}`)
	require.ErrorIs(t, err, failure)
	states, err := s.ListSyncStates(t.Context(), actor, "workspace")
	require.NoError(t, err)
	require.Len(t, states, 1)
	require.Equal(t, "failed", states[0].Status)
}

func TestRetryNeverReplaysAnAmbiguousProviderWrite(t *testing.T) {
	s, _, _, actor := messagingFixture(t)
	calls := 0
	s.SetProvider("bluesky", testProvider{send: func(context.Context) (platform.SendMessageResult, error) {
		calls++
		return platform.SendMessageResult{}, context.DeadlineExceeded
	}})
	message, err := s.QueueMessage(t.Context(), actor, "conversation", "keep this text", "ambiguous-operation")
	require.NoError(t, err)
	require.Error(t, s.HandleJob(t.Context(), JobTypeMessageSend, `{"id":"`+message.ID+`"}`))
	page, err := s.ListMessages(t.Context(), actor, MessageQuery{WorkspaceID: "workspace", ConversationID: "conversation"})
	require.NoError(t, err)
	require.Len(t, page.Items, 1)
	require.Equal(t, "ambiguous", page.Items[0].SendStatus)
	require.Equal(t, "keep this text", page.Items[0].Body)
	_, err = s.RetryMessage(t.Context(), actor, "workspace", "conversation", message.ID)
	require.ErrorIs(t, err, ErrRetryUnsafe)
	replay, err := s.QueueMessage(t.Context(), actor, "conversation", "keep this text", "ambiguous-operation")
	require.NoError(t, err)
	require.Equal(t, message.ID, replay.ID)
	require.Equal(t, 1, calls)
}

func TestLateReactionSnapshotDoesNotResurrectRemovedReaction(t *testing.T) {
	s, db, account, _ := messagingFixture(t)
	incoming := platform.ProviderMessage{ID: "m1", Direction: "inbound", Body: "hello", RemoteCreatedAt: s.now(), ReactionsKnown: true, Reactions: []platform.ProviderMessageReaction{{ActorRemoteID: "friend", Value: "heart"}}}
	batch := platform.FetchMessageEventsResult{Conversations: []platform.ProviderConversation{{ID: "remote-thread", Messages: []platform.ProviderMessage{incoming}}}}
	require.NoError(t, s.ApplyProviderEvents(t.Context(), account.ID, batch))
	require.NoError(t, s.ApplyProviderEvents(t.Context(), account.ID, platform.FetchMessageEventsResult{Reactions: []platform.ProviderMessageReaction{{ConversationID: "remote-thread", MessageID: "m1", ActorRemoteID: "friend", Value: "heart", Deleted: true}}}))
	// A history response that began earlier can contain this stale snapshot.
	require.NoError(t, s.ApplyProviderEvents(t.Context(), account.ID, batch))
	var count int
	require.NoError(t, db.NewRaw(`SELECT COUNT(*) FROM message_reactions`).Scan(t.Context(), &count))
	require.Zero(t, count)
}

func TestUnreadSummaryCountsConversationsBeyondPageOne(t *testing.T) {
	s, db, _, actor := messagingFixture(t)
	for i := range 101 {
		_, err := db.NewInsert().Model(&models.Conversation{ID: fmt.Sprintf("chat-%03d", i), WorkspaceID: "workspace", SocialAccountID: "account", Platform: "bluesky", RemoteConversationID: fmt.Sprintf("remote-%d", i), UnreadCount: 3, CreatedAt: s.now(), UpdatedAt: s.now()}).Exec(t.Context())
		require.NoError(t, err)
	}
	summary, err := s.Summary(t.Context(), actor, "workspace")
	require.NoError(t, err)
	require.Equal(t, 101, summary.UnreadConversations)
	page, err := s.ListConversations(t.Context(), actor, ConversationQuery{WorkspaceID: "workspace", UnreadOnly: true, Limit: 100})
	require.NoError(t, err)
	require.Len(t, page.Items, 100)
	require.NotNil(t, page.NextCursor)
}
