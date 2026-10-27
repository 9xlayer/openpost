package platform

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

// The replies edge returns only top-level replies. A reply to a reply, such
// as a follower answering the account's own reply, is only returned by the
// conversation edge, where replied_to names the reply it answers.
func TestThreadsListCommentsCollectsNestedReplies(t *testing.T) {
	originalClient := httpClient
	defer func() { httpClient = originalClient }()

	const (
		topLevel = `{"id": "reply-fan", "text": "Does it support video?", "username": "fan", "timestamp": "2026-09-14T10:00:00+0000", "is_reply_owned_by_me": false, "replied_to": {"id": "root-1"}}`
		ownReply = `{"id": "reply-own", "text": "Yes, up to five minutes.", "username": "openpost", "timestamp": "2026-09-14T10:05:00+0000", "is_reply_owned_by_me": true, "replied_to": {"id": "reply-fan"}}`
		followUp = `{"id": "reply-fan-2", "text": "And carousels?", "username": "fan", "timestamp": "2026-09-14T10:10:00+0000", "is_reply_owned_by_me": false, "replied_to": {"id": "reply-own"}}`
	)
	httpClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/v1.0/root-1/replies":
			return jsonResponse(req, `{"data": [`+topLevel+`]}`), nil
		case "/v1.0/root-1/conversation":
			return jsonResponse(req, `{"data": [`+followUp+`, `+ownReply+`, `+topLevel+`]}`), nil
		}
		return jsonResponseWithStatus(req, http.StatusNotFound, `{"error": {"message": "unexpected path"}}`), nil
	})}

	comments, err := NewThreadsAdapter("", "", "").ListComments(context.Background(), "threads-token", "user-1", "root-1")

	require.NoError(t, err)
	byID := map[string]Comment{}
	for _, comment := range comments {
		byID[comment.ID] = comment
	}
	require.Len(t, byID, 3)
	require.Equal(t, "root-1", byID["reply-fan"].ParentID, "a top-level reply answers the post")
	require.Equal(t, "reply-own", byID["reply-fan-2"].ParentID, "the follow-up must be threaded under the reply it answers")
	require.False(t, byID["reply-fan-2"].IsOurs)
	require.True(t, byID["reply-own"].IsOurs)
}
