package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humaecho"
	"github.com/labstack/echo/v4"
	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/posttext"
	"github.com/openpost/backend/internal/services/publicationsource"
	"github.com/stretchr/testify/require"
)

func TestPublicationMentionIdentitySurvivesLegacyEditsAndCountsInRevisions(t *testing.T) {
	db := createHandlerTestDB(t, (*models.WorkspaceMember)(nil), (*models.Job)(nil), (*models.Publication)(nil), (*models.PublicationSegment)(nil), (*models.PublicationSegmentMedia)(nil), (*models.Rendition)(nil), (*models.RenditionSegment)(nil), (*models.RenditionSegmentMedia)(nil), (*models.RenditionMedia)(nil))
	_, err := db.NewInsert().Model(&models.WorkspaceMember{WorkspaceID: "workspace-1", UserID: "user-1", Role: models.WorkspaceRoleAdmin}).Exec(t.Context())
	require.NoError(t, err)
	seedHandlerAccount(t, db, "bsky", "bluesky")
	e := echo.New()
	api := humaecho.NewWithGroup(e, e.Group("/api/v1"), huma.DefaultConfig("Test", "1"))
	NewPublicationHandler(db, testAuthenticator{}, nil).RegisterRoutes(api)
	send := func(method, path string, body any) *httptest.ResponseRecorder {
		data, err := json.Marshal(body)
		require.NoError(t, err)
		request := httptest.NewRequestWithContext(t.Context(), method, path, bytes.NewReader(data))
		request.Header.Set("Authorization", "Bearer web-token")
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		e.ServeHTTP(response, request)
		return response
	}
	mentions := &posttext.Mentions{Version: 1, Spans: []posttext.MentionSpan{{Start: 8, End: 14, Text: "@alice", Target: posttext.MentionTarget{Provider: "bluesky", Kind: "person", ID: "did:plc:ewvi7nxzyoun6zhxrhs64oiz", Handle: "alice.bsky.social"}}}}
	create := CreatePublicationBody{WorkspaceID: "workspace-1", Title: "Mentions", ContentProfile: "short_text", SourceText: "🚀 Hi @alice", Segments: []PublicationSegmentInput{{Body: "🚀 Hi @alice", Settings: map[string]any{"mentions": mentions}}}, SocialAccountIDs: []string{"bsky"}}
	response := send(http.MethodPost, "/api/v1/publications", create)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	var publication PublicationResponse
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &publication))
	read := func() PublicationResponse {
		response := send(http.MethodGet, "/api/v1/publications/"+publication.ID, nil)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		var output PublicationResponse
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &output))
		return output
	}
	publication = read()
	initialRevision := publication.Revision
	changed := "A 🚀 Hi @alice"
	response = send(http.MethodPut, "/api/v1/publications/"+publication.ID, PublicationUpdateBody{ExpectedRevision: publication.Revision, SourceText: &changed})
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	publication = read()
	require.Greater(t, publication.Revision, initialRevision)
	stored, err := posttext.Read(publication.Segments[0].Settings)
	require.NoError(t, err)
	require.Equal(t, 10, stored.Spans[0].Start)
	require.Equal(t, 16, stored.Spans[0].End)
	require.Equal(t, mentions.Spans[0].Target.ID, stored.Spans[0].Target.ID)
	unsafe := "A 🚀 Hi @alex"
	response = send(http.MethodPut, "/api/v1/publications/"+publication.ID, PublicationUpdateBody{ExpectedRevision: publication.Revision, SourceText: &unsafe})
	require.Equal(t, http.StatusBadRequest, response.Code, response.Body.String())
	after := read()
	require.Equal(t, publication.Revision, after.Revision)
	require.Equal(t, changed, after.Segments[0].Body)
	stored.Spans[0].Target.ID = "did:plc:z72i7hdynmk6r22z27h6tvur"
	response = send(http.MethodPut, "/api/v1/publications/"+publication.ID, PublicationUpdateBody{ExpectedRevision: publication.Revision, Segments: []PublicationSegmentInput{{ID: publication.Segments[0].ID, Body: changed, Settings: map[string]any{"mentions": stored}}}})
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	after = read()
	require.Greater(t, after.Revision, publication.Revision, "identity-only changes are authored revisions")
	require.Equal(t, changed, after.Segments[0].Body)

	publication = after
	override := "Prefix " + changed
	response = send(http.MethodPut, "/api/v1/publications/"+publication.ID+"/renditions", map[string]any{"expected_revision": publication.Revision, "renditions": []RenditionInput{{SocialAccountID: "bsky", Segments: []RenditionSegmentInput{{PublicationSegmentID: publication.Segments[0].ID, BodyOverride: &override}}}}})
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	publication = read()
	own, err := posttext.Read(publication.Renditions[0].Segments[0].Settings)
	require.NoError(t, err)
	require.NotNil(t, own)
	require.Equal(t, 17, own.Spans[0].Start)
	require.Equal(t, "did:plc:z72i7hdynmk6r22z27h6tvur", own.Spans[0].Target.ID, "legacy detachment snapshots the inherited stable identity")
	unsafeOverride := "Prefix A 🚀 Hi @alex"
	response = send(http.MethodPut, "/api/v1/publications/"+publication.ID+"/renditions", map[string]any{"expected_revision": publication.Revision, "renditions": []RenditionInput{{SocialAccountID: "bsky", Segments: []RenditionSegmentInput{{PublicationSegmentID: publication.Segments[0].ID, BodyOverride: &unsafeOverride}}}}})
	require.Equal(t, http.StatusBadRequest, response.Code, response.Body.String())
	require.Equal(t, publication.Revision, read().Revision)

	seedHandlerAccount(t, db, "bsky-new", "bluesky")
	response = send(http.MethodPut, "/api/v1/publications/"+publication.ID+"/renditions", map[string]any{"expected_revision": publication.Revision, "renditions": []RenditionInput{{SocialAccountID: "bsky-new", Segments: []RenditionSegmentInput{{PublicationSegmentID: publication.Segments[0].ID, BodyOverride: &override}}}}})
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	publication = read()
	for _, destination := range publication.Renditions {
		if destination.SocialAccountID == "bsky-new" {
			own, err = posttext.Read(destination.Segments[0].Settings)
		}
	}
	require.NoError(t, err)
	require.NotNil(t, own, "new account detachment retains the inherited selection")
	require.Equal(t, "did:plc:z72i7hdynmk6r22z27h6tvur", own.Spans[0].Target.ID)
	create.Title = "Malformed"
	create.Segments[0].Body = "short"
	response = send(http.MethodPost, "/api/v1/publications", create)
	require.Equal(t, http.StatusBadRequest, response.Code, response.Body.String())
	count, err := db.NewSelect().Model((*models.Publication)(nil)).Count(t.Context())
	require.NoError(t, err)
	require.Equal(t, 1, count, "failed authoring leaves no partial publication")
	seedHandlerAccount(t, db, "linkedin", "linkedin")
	company := &posttext.Mentions{Version: 1, Spans: []posttext.MentionSpan{{Start: 3, End: 7, Text: "Acme", Target: posttext.MentionTarget{Provider: "linkedin", Kind: "page", ID: "urn:li:organization:123"}}}}
	first := "Hi Acme"
	canonical := []PublicationSegmentInput{{ID: "first", Body: first, Settings: map[string]any{"mentions": company}}, {ID: "tail", Body: "Tail"}}
	response = send(http.MethodPost, "/api/v1/publications", CreatePublicationBody{WorkspaceID: "workspace-1", Title: "Joined mentions", ContentProfile: "thread", SourceText: first, Segments: canonical, Renditions: []RenditionInput{{SocialAccountID: "linkedin", Segments: []RenditionSegmentInput{{PublicationSegmentID: "first", SourceOverrides: []publicationsource.RenditionSourceOverride{{PublicationSegmentID: "first", BodyOverride: &first, Mentions: company, MediaInherited: true}}}}}}})
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &publication))
	publication = read()
	returned := publication.Renditions[0].Segments[0]
	inherited := returned.MediaInherited
	response = send(http.MethodPut, "/api/v1/publications/"+publication.ID+"/renditions", map[string]any{"expected_revision": publication.Revision, "renditions": []RenditionInput{{SocialAccountID: "linkedin", Segments: []RenditionSegmentInput{{PublicationSegmentID: returned.PublicationSegmentID, BodyOverride: returned.BodyOverride, MediaInherited: &inherited, SourceOverrides: returned.SourceOverrides, Settings: returned.Settings}}}}})
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	afterJoined := read()
	require.Equal(t, "Hi Acme\n\nTail", afterJoined.Renditions[0].Segments[0].Body)
	require.Equal(t, company, afterJoined.Renditions[0].Segments[0].SourceOverrides[0].Mentions)
	require.Nil(t, afterJoined.Renditions[0].Segments[0].Settings[posttext.SettingsKey], "joined selections remain per source")
}
