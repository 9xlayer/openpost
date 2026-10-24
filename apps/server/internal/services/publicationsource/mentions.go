package publicationsource

import (
	"encoding/json"
	"strings"

	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/posttext"
)

// ResolveMentions follows exactly the same source and whole-output decisions as
// AuthoredBody. Generated provider data never enters stored source authorship.
func ResolveMentions(canonical []models.PublicationSegment, sourceID, overridesJSON string, wholeOverride *string, settings map[string]any, joined bool) (string, *posttext.Projection, error) {
	var overrides []RenditionSourceOverride
	if strings.TrimSpace(overridesJSON) != "" {
		if err := json.Unmarshal([]byte(overridesJSON), &overrides); err != nil {
			return "", nil, posttext.ErrInvalid
		}
	}
	if joined || len(overrides) > 0 {
		return joinedMentions(canonical, overrides, wholeOverride, settings)
	}
	for _, source := range canonical {
		if source.ID != sourceID {
			continue
		}
		value, err := sourceMentionValue(source, nil)
		if err != nil {
			return "", nil, err
		}
		if wholeOverride != nil {
			value.Body = *wholeOverride
			value.Mentions, err = posttext.Read(settings)
			if err != nil {
				return "", nil, err
			}
		}
		return singleMentionProjection(value)
	}
	mentions, err := posttext.Read(settings)
	if err != nil || mentions != nil {
		return "", nil, posttext.ErrInvalid
	}
	return "", nil, nil
}

func joinedMentions(canonical []models.PublicationSegment, overrides []RenditionSourceOverride, wholeOverride *string, settings map[string]any) (string, *posttext.Projection, error) {
	if len(overrides) == 0 && wholeOverride != nil {
		mentions, err := posttext.Read(settings)
		if err != nil {
			return "", nil, err
		}
		return singleMentionProjection(posttext.Value{Body: *wholeOverride, Mentions: mentions})
	}
	byID := make(map[string]RenditionSourceOverride, len(overrides))
	for _, override := range overrides {
		byID[override.PublicationSegmentID] = override
	}
	values := make([]posttext.Value, 0, len(canonical))
	for _, source := range canonical {
		var override *RenditionSourceOverride
		if value, ok := byID[source.ID]; ok {
			override = &value
		}
		value, err := sourceMentionValue(source, override)
		if err != nil {
			return "", nil, err
		}
		values = append(values, value)
	}
	return posttext.Join(values)
}
func sourceMentionValue(source models.PublicationSegment, override *RenditionSourceOverride) (posttext.Value, error) {
	var settings map[string]any
	_ = json.Unmarshal([]byte(source.SettingsJSON), &settings)
	mentions, err := posttext.Read(settings)
	if err != nil {
		return posttext.Value{}, err
	}
	value := posttext.Value{Body: source.Body, Mentions: mentions}
	if override != nil && override.BodyOverride != nil {
		value.Body = *override.BodyOverride
		value.Mentions = override.Mentions
	}
	return value, posttext.Validate(value.Body, value.Mentions)
}
func singleMentionProjection(value posttext.Value) (string, *posttext.Projection, error) {
	if err := posttext.Validate(value.Body, value.Mentions); err != nil {
		return "", nil, err
	}
	if value.Mentions == nil {
		return value.Body, nil, nil
	}
	return value.Body, &posttext.Projection{Mentions: *value.Mentions}, nil
}

// DeliveryMentions is the shared validation and provider-write projection.
func DeliveryMentions(canonical []models.PublicationSegment, sourceID, overridesJSON string, wholeOverride *string, settings map[string]any, joined bool, delivered, provider, authority string) (*posttext.Projection, error) {
	body, projection, err := ResolveMentions(canonical, sourceID, overridesJSON, wholeOverride, settings, joined)
	if err != nil {
		return nil, err
	}
	return posttext.ForDelivery(body, delivered, provider, authority, projection)
}
