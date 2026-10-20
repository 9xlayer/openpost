package platform

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var ErrMessageBootstrapCursorRequired = errors.New("provider log did not supply a bootstrap cursor")

type blueskyChatMessage struct {
	Type   string `json:"$type"`
	ID     string `json:"id"`
	Text   string `json:"text"`
	SentAt string `json:"sentAt"`
	Sender struct {
		DID string `json:"did"`
	} `json:"sender"`
}

type blueskyChatConversation struct {
	ID      string `json:"id"`
	Members []struct {
		DID         string `json:"did"`
		Handle      string `json:"handle"`
		DisplayName string `json:"displayName"`
		Avatar      string `json:"avatar"`
	} `json:"members"`
	LastMessage blueskyChatMessage `json:"lastMessage"`
	UnreadCount int                `json:"unreadCount"`
}

func (c blueskyChatConversation) provider(accountID string) ProviderConversation {
	at, _ := time.Parse(time.RFC3339Nano, c.LastMessage.SentAt)
	result := ProviderConversation{ID: c.ID, LastMessageAt: at, LastRemoteMessageID: c.LastMessage.ID, UnreadCount: c.UnreadCount}
	if c.LastMessage.Type == "" || c.LastMessage.Type == blueskyChatMessageView {
		result.LastMessagePreview = c.LastMessage.Text
	}
	for _, member := range c.Members {
		if member.DID != accountID {
			result.CounterpartRemoteID = member.DID
			result.CounterpartName = member.DisplayName
			result.CounterpartHandle = prefixHandle(member.Handle)
			result.CounterpartAvatarURL = member.Avatar
			break
		}
	}
	return result
}

func (m blueskyChatMessage) provider(accountID string) ProviderMessage {
	at, _ := time.Parse(time.RFC3339Nano, m.SentAt)
	direction := "inbound"
	if m.Sender.DID == accountID {
		direction = "outbound"
	}
	return ProviderMessage{ID: m.ID, Direction: direction, AuthorRemoteID: m.Sender.DID, Body: m.Text, RemoteCreatedAt: at}
}

// FetchMessageEvents consumes one bounded prefix of the official account log.
// getLog has no limit argument. A local prefix checkpoints its final revision,
// so unprocessed events on the server page are replayed on the next request.
func (b *BlueskyAdapter) FetchMessageEvents(ctx context.Context, token string, input FetchMessageEventsRequest) (FetchMessageEventsResult, error) {
	path := "/xrpc/chat.bsky.convo.getLog"
	if input.Cursor != "" {
		path += "?" + url.Values{"cursor": {input.Cursor}}.Encode()
	}
	body, err := b.chatRequest(ctx, token, http.MethodGet, path, nil)
	if err != nil {
		return FetchMessageEventsResult{}, err
	}
	var response struct {
		Cursor string `json:"cursor"`
		Logs   []struct {
			Type           string             `json:"$type"`
			Rev            string             `json:"rev"`
			ConversationID string             `json:"convoId"`
			Message        blueskyChatMessage `json:"message"`
			Reaction       struct {
				Value  string `json:"value"`
				Sender struct {
					DID string `json:"did"`
				} `json:"sender"`
			} `json:"reaction"`
		} `json:"logs"`
	}
	if err = json.Unmarshal(body, &response); err != nil {
		return FetchMessageEventsResult{}, fmt.Errorf("decoding Bluesky log: %w", err)
	}
	result := FetchMessageEventsResult{NextCursor: response.Cursor, Bootstrap: input.Cursor == ""}
	if result.NextCursor == "" {
		result.NextCursor = input.Cursor
	}
	if result.Bootstrap {
		if result.NextCursor == "" {
			return FetchMessageEventsResult{}, ErrMessageBootstrapCursorRequired
		}
		return result, nil
	}
	limit := input.Limit
	if limit <= 0 || limit > 100 {
		limit = 100
	}
	logs := response.Logs
	if len(logs) > limit {
		logs = logs[:limit]
	}
	if len(logs) > 0 {
		result.NextCursor = logs[len(logs)-1].Rev
	}
	result.HasMore = len(logs) > 0
	if len(logs) > 0 && (result.NextCursor == "" || result.NextCursor == input.Cursor) {
		return FetchMessageEventsResult{}, errors.New("Bluesky log cursor did not advance")
	}
	touched := make(map[string]bool)
	removed := make(map[string]bool)
	messages := make(map[string][]ProviderMessage)
	for _, event := range logs {
		cid := event.ConversationID
		if cid == "" {
			continue
		}
		kind := strings.TrimPrefix(event.Type, "chat.bsky.convo.defs#")
		switch kind {
		case "logLeaveConvo":
			removed[cid] = true
			delete(touched, cid)
			delete(messages, cid)
		case "logBeginConvo", "logAcceptConvo":
			delete(removed, cid)
			touched[cid] = true
		case "logCreateMessage":
			touched[cid] = true
			if event.Message.Type == "chat.bsky.convo.defs#deletedMessageView" {
				result.DeletedMessages = append(result.DeletedMessages, DeletedProviderMessage{ConversationID: cid, MessageID: event.Message.ID})
			} else if event.Message.ID != "" && (event.Message.Type == "" || event.Message.Type == blueskyChatMessageView) {
				messages[cid] = append(messages[cid], event.Message.provider(input.AccountID))
			}
		case "logDeleteMessage":
			touched[cid] = true
			result.DeletedMessages = append(result.DeletedMessages, DeletedProviderMessage{ConversationID: cid, MessageID: event.Message.ID})
		case "logReadMessage", "logReadConvo":
			touched[cid] = true
			result.ReadStates = append(result.ReadStates, ProviderReadState{ConversationID: cid, MessageID: event.Message.ID, ActorRemoteID: input.AccountID})
		case "logAddReaction", "logRemoveReaction":
			result.Reactions = append(result.Reactions, ProviderMessageReaction{ConversationID: cid, MessageID: event.Message.ID, ActorRemoteID: event.Reaction.Sender.DID, Value: event.Reaction.Value, Deleted: kind == "logRemoveReaction"})
		default:
			// New log kinds can refresh metadata without materializing blank messages.
			touched[cid] = true
		}
	}
	for cid := range removed {
		result.DeletedConversations = append(result.DeletedConversations, cid)
	}
	for cid := range touched {
		if removed[cid] {
			continue
		}
		data, fetchErr := b.chatRequest(ctx, token, http.MethodGet, "/xrpc/chat.bsky.convo.getConvo?"+url.Values{"convoId": {cid}}.Encode(), nil)
		if fetchErr != nil {
			return FetchMessageEventsResult{}, fetchErr
		}
		var response struct {
			Conversation blueskyChatConversation `json:"convo"`
		}
		if err = json.Unmarshal(data, &response); err != nil {
			return FetchMessageEventsResult{}, fmt.Errorf("decoding Bluesky conversation: %w", err)
		}
		if response.Conversation.ID != cid {
			return FetchMessageEventsResult{}, errors.New("Bluesky conversation identity mismatch")
		}
		convo := response.Conversation.provider(input.AccountID)
		convo.Messages = messages[cid]
		result.Conversations = append(result.Conversations, convo)
	}
	return result, nil
}

func (b *BlueskyAdapter) FetchMessageHistory(ctx context.Context, token string, input FetchMessageHistoryRequest) (FetchMessageHistoryResult, error) {
	limit := input.Limit
	if limit <= 0 || limit > 100 {
		limit = 100
	}
	query := url.Values{"convoId": {input.ConversationID}, "limit": {fmt.Sprint(limit)}}
	if input.Cursor != "" {
		query.Set("cursor", input.Cursor)
	}
	body, err := b.chatRequest(ctx, token, http.MethodGet, "/xrpc/chat.bsky.convo.getMessages?"+query.Encode(), nil)
	if err != nil {
		return FetchMessageHistoryResult{}, err
	}
	var response struct {
		Messages []blueskyChatMessage `json:"messages"`
		Cursor   string               `json:"cursor"`
	}
	if err = json.Unmarshal(body, &response); err != nil {
		return FetchMessageHistoryResult{}, fmt.Errorf("decoding Bluesky history: %w", err)
	}
	result := FetchMessageHistoryResult{NextCursor: response.Cursor}
	// Provider history is newest-first; stored messages are oldest-first.
	for i := len(response.Messages) - 1; i >= 0; i-- {
		m := response.Messages[i]
		if m.ID == "" {
			continue
		}
		switch m.Type {
		case "", blueskyChatMessageView:
			result.Messages = append(result.Messages, m.provider(input.AccountID))
		case "chat.bsky.convo.defs#deletedMessageView":
			result.DeletedMessages = append(result.DeletedMessages, DeletedProviderMessage{ConversationID: input.ConversationID, MessageID: m.ID})
		}
	}
	return result, nil
}
