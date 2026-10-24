package handlers

import (
	"context"
	"encoding/json"

	"github.com/danielgtaylor/huma/v2"
	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/posttext"
	"github.com/openpost/backend/internal/services/publicationsource"
	"github.com/uptrace/bun"
)

// Replacement clients can omit annotations on an unchanged body. Preserve the
// selected identity, but require explicit metadata when its text is ambiguous.
func preserveRenditionMentionInputs(ctx context.Context, db bun.IDB, publicationID string, inputs []RenditionInput, accounts map[string]models.SocialAccount) error {
	var canonical []models.PublicationSegment
	if err := db.NewSelect().Model(&canonical).Where("publication_id = ?", publicationID).Order("position ASC").Scan(ctx); err != nil {
		return err
	}
	var renditions []models.Rendition
	if err := db.NewSelect().Model(&renditions).Where("publication_id = ?", publicationID).Scan(ctx); err != nil {
		return err
	}
	for i := range inputs {
		input := &inputs[i]
		key, err := normalizeRenditionTargetKey(accounts[input.SocialAccountID], input.TargetKey, input.Settings)
		if err != nil {
			return huma.Error400BadRequest(err.Error())
		}
		for _, previous := range renditions {
			if previous.SocialAccountID != input.SocialAccountID || previous.TargetKey != key {
				continue
			}
			var segments []models.RenditionSegment
			if err := db.NewSelect().Model(&segments).Where("rendition_id = ?", previous.ID).Order("position ASC").Scan(ctx); err != nil {
				return err
			}
			if err := preserveRenditionSegmentMentions(input, segments, canonical); err != nil {
				return huma.Error400BadRequest(err.Error())
			}
		}
	}
	return nil
}

func preserveRenditionSegmentMentions(input *RenditionInput, previous []models.RenditionSegment, canonical []models.PublicationSegment) error {
	for index, old := range previous {
		if len(input.Segments) == 0 {
			if err := requireRetainedMentionSegments(old); err != nil {
				return err
			}
			continue
		}
		for i := range input.Segments {
			next := &input.Segments[i]
			if !sameMentionSource(*next, old, index, i) {
				continue
			}
			if len(next.SourceOverrides) == 0 {
				if err := preserveRenditionTextMentions(next, old, canonical, len(previous) == 1 && len(canonical) > 1); err != nil {
					return err
				}
			}
			if err := preserveJoinedMentionInputs(next.SourceOverrides, readRenditionSourceOverrides(old.SourceOverridesJSON), canonical); err != nil {
				return err
			}
		}
	}
	return nil
}
func sameMentionSource(next RenditionSegmentInput, old models.RenditionSegment, oldIndex, newIndex int) bool {
	if next.PublicationSegmentID != "" {
		return next.PublicationSegmentID == old.PublicationSegmentID
	}
	return oldIndex == newIndex
}
func requireRetainedMentionSegments(old models.RenditionSegment) error {
	sources := readRenditionSourceOverrides(old.SourceOverridesJSON)
	var settings map[string]any
	_ = json.Unmarshal([]byte(old.SettingsJSON), &settings)
	metadata, err := posttext.Read(settings)
	if err != nil {
		return err
	}
	if old.BodyOverride != nil && len(sources) == 0 && hasSelectedMentions(metadata) {
		return posttext.ErrMetadataRequired
	}
	for _, source := range sources {
		if hasSelectedMentions(source.Mentions) {
			return posttext.ErrMetadataRequired
		}
	}
	return nil
}
func hasSelectedMentions(value *posttext.Mentions) bool { return value != nil && len(value.Spans) > 0 }
func preserveRenditionTextMentions(next *RenditionSegmentInput, old models.RenditionSegment, canonical []models.PublicationSegment, joined bool) error {
	var settings map[string]any
	_ = json.Unmarshal([]byte(old.SettingsJSON), &settings)
	body, projection, err := publicationsource.ResolveMentions(canonical, old.PublicationSegmentID, old.SourceOverridesJSON, old.BodyOverride, settings, joined)
	if err != nil {
		return err
	}
	// An absent override restores canonical text and its annotations.
	if next.BodyOverride == nil && (next.Body == "" || old.BodyOverride == nil && next.Body == body) {
		return nil
	}
	authored := next.Body
	if next.BodyOverride != nil {
		authored = *next.BodyOverride
	}
	previous := map[string]any{}
	if projection != nil {
		previous[posttext.SettingsKey] = &projection.Mentions
	}
	next.Settings, err = posttext.PreserveSettings(body, authored, previous, next.Settings)
	return err
}
func preserveJoinedMentionInputs(next, previous []publicationsource.RenditionSourceOverride, canonical []models.PublicationSegment) error {
	for i := range next {
		source := &next[i]
		if source.BodyOverride == nil || source.Mentions != nil {
			continue
		}
		before, err := priorJoinedMentionText(source.PublicationSegmentID, previous, canonical)
		if err != nil {
			return err
		}
		source.Mentions, err = posttext.Remap(before.Body, *source.BodyOverride, before.Mentions)
		if err != nil {
			return err
		}
	}
	return nil
}
func priorJoinedMentionText(id string, previous []publicationsource.RenditionSourceOverride, canonical []models.PublicationSegment) (posttext.Value, error) {
	for _, source := range previous {
		if source.PublicationSegmentID == id && source.BodyOverride != nil {
			return posttext.Value{Body: *source.BodyOverride, Mentions: source.Mentions}, nil
		}
	}
	for _, source := range canonical {
		if source.ID != id {
			continue
		}
		var settings map[string]any
		_ = json.Unmarshal([]byte(source.SettingsJSON), &settings)
		metadata, err := posttext.Read(settings)
		return posttext.Value{Body: source.Body, Mentions: metadata}, err
	}
	return posttext.Value{}, nil // Same-request client source references resolve during insertion.
}
