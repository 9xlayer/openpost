package handlers

import (
	"encoding/json"
	"maps"

	"github.com/danielgtaylor/huma/v2"
	"github.com/openpost/backend/internal/capabilities"
	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/posttext"
	"github.com/openpost/backend/internal/services/publicationsource"
)

func preparePublicationMentions(inputs []PublicationSegmentInput, previous []models.PublicationSegment) ([]PublicationSegmentInput, error) {
	byID := make(map[string]models.PublicationSegment, len(previous))
	for _, source := range previous {
		byID[source.ID] = source
	}
	output := append([]PublicationSegmentInput{}, inputs...)
	for i := range output {
		input := &output[i]
		old := byID[input.ID]
		var settings map[string]any
		_ = json.Unmarshal([]byte(old.SettingsJSON), &settings)
		next, err := posttext.PreserveSettings(old.Body, input.Body, settings, input.Settings)
		if err != nil {
			return nil, huma.Error400BadRequest(err.Error())
		}
		input.Settings = next
	}
	return output, nil
}

func prepareDestinationMentions(input RenditionSegmentInput, authored string, body *string) (RenditionSegmentInput, *string, error) {
	if _, reserved := input.Settings[posttext.NativeSettingsKey]; reserved {
		return input, body, huma.Error400BadRequest("provider mention projections cannot be authored")
	}
	mentions, err := posttext.Read(input.Settings)
	if err != nil {
		return input, body, huma.Error400BadRequest(err.Error())
	}
	if mentions == nil {
		return input, body, nil
	}
	if len(input.SourceOverrides) > 0 {
		return input, body, huma.Error400BadRequest("choose mentions on each joined source instead of the whole output")
	}
	if err := posttext.Validate(authored, mentions); err != nil {
		return input, body, huma.Error400BadRequest(err.Error())
	}
	input.Settings = maps.Clone(input.Settings)
	input.Settings[posttext.SettingsKey] = mentions
	return input, &authored, nil
}

func validatePublicationMentions(rendition models.Rendition, account models.SocialAccount, segment RenditionSegmentResponse, canonical []models.PublicationSegment, outputCount int) []capabilities.ValidationIssue {
	_, err := publicationsource.DeliveryMentions(canonical, segment.PublicationSegmentID, mustJSON(segment.SourceOverrides), segment.BodyOverride, segment.Settings, outputCount == 1 && len(canonical) > 1, segment.Body, rendition.Platform, account.InstanceURL)
	if err == nil {
		return nil
	}
	return []capabilities.ValidationIssue{{Code: "mention_choice_invalid", Message: err.Error(), Severity: "error", Provider: rendition.Platform, Field: "mentions", SegmentID: segment.ID, Scope: capabilities.SettingScopeSegment, ScopeID: segment.ID}}
}

func snapshotCanonicalMentionOverride(input RenditionSegmentInput, canonical []models.PublicationSegment, sourceID string, body *string, joined bool) (RenditionSegmentInput, error) {
	if body == nil || len(input.SourceOverrides) > 0 {
		return input, nil
	}
	if _, explicit := input.Settings[posttext.SettingsKey]; explicit {
		return input, nil
	}
	inherited, projection, err := publicationsource.ResolveMentions(canonical, sourceID, "", nil, nil, joined)
	if err != nil {
		return input, err
	}
	if projection == nil {
		return input, nil
	}
	input.Settings, err = posttext.PreserveSettings(inherited, *body, map[string]any{posttext.SettingsKey: &projection.Mentions}, input.Settings)
	return input, err
}
