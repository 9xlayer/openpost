package platform

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

type messagingQuotaProbe struct {
	denied             error
	reserved, observed int
}

func (q *messagingQuotaProbe) ReserveXMessagingRequest(_ context.Context, user, operation string) error {
	q.reserved++
	if user != "111" || operation != XMessagingSend {
		return errors.New("incorrect quota identity")
	}
	return q.denied
}
func (q *messagingQuotaProbe) ObserveXMessagingResponse(_ context.Context, _, _ string, _ int, _ http.Header) error {
	q.observed++
	return nil
}

func TestXSendRequiresRemoteMessageIdentity(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = fmt.Fprint(w, `{"data":{}}`) }))
	defer server.Close()
	adapter := NewXAdapter("consumer", "secret", "")
	defer close(adapter.cleanupDone)
	adapter.apiBaseURL = server.URL
	_, err := adapter.SendMessage(t.Context(), "access|secret", SendMessageRequest{AccountID: "111", RemoteConversationID: "111-222", Body: "hello"})
	require.Error(t, err, "a 2xx response without a message identity cannot confirm delivery")
}

func TestXMessagingOAuthVariantsShareQuotaAdmission(t *testing.T) {
	for _, variant := range []string{"oauth1", "oauth2"} {
		t.Run(variant, func(t *testing.T) {
			requests := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests++
				if variant == "oauth2" {
					require.Equal(t, "Bearer supplemental", r.Header.Get("Authorization"))
				} else {
					require.True(t, strings.HasPrefix(r.Header.Get("Authorization"), "OAuth "))
				}
				require.Equal(t, "/2/dm_conversations/111-222/messages", r.URL.Path)
				w.Header().Set("x-rate-limit-remaining", "14")
				_, _ = fmt.Fprint(w, `{"data":{"dm_event_id":"message"}}`)
			}))
			defer server.Close()
			original := httpClient
			httpClient = server.Client()
			defer func() { httpClient = original }()
			adapter := NewXAdapter("consumer", "secret", "")
			defer close(adapter.cleanupDone)
			adapter.apiBaseURL = server.URL
			quota := &messagingQuotaProbe{denied: errors.New("budget denied")}
			adapter.SetMessagingQuotaGate(quota)
			token := "access|secret"
			if variant == "oauth2" {
				token = XMessagingOAuth2Token("supplemental")
			}
			input := SendMessageRequest{AccountID: "111", RemoteConversationID: "111-222", Body: "hello"}
			_, err := adapter.SendMessage(t.Context(), token, input)
			require.Error(t, err)
			require.Zero(t, requests)
			quota.denied = nil
			result, err := adapter.SendMessage(t.Context(), token, input)
			require.NoError(t, err)
			require.Equal(t, "message", result.RemoteMessageID)
			require.Equal(t, 1, requests)
			require.Equal(t, 2, quota.reserved)
			require.Equal(t, 1, quota.observed)
		})
	}
}
