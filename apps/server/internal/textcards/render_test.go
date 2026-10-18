package textcards

import (
	"bytes"
	"image/jpeg"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRenderDrawsReadableTextAndKeepsDeterministicBytes(t *testing.T) {
	style, err := Parse(map[string]any{"text_card": "always", "text_card_shadow": false})
	require.NoError(t, err)
	for _, text := range []string{"A new release.", "Olá, café!", "مرحبا بالعالم", "שלום עולם", "日本語の投稿", "Hello 👋 🌍"} {
		t.Run(text, func(t *testing.T) {
			images, err := Render(t.Context(), text, "instagram.feed", style, Identity{Name: "Founder", Handle: "founder"}, nil, 0)
			require.NoError(t, err)
			require.Len(t, images, 1)
			photo, err := jpeg.Decode(bytes.NewReader(images[0].JPEG))
			require.NoError(t, err)
			// This rectangle contains the body, below the identity and above the footer.
			ink := 0
			for y := 690; y < 770; y++ {
				for x := 136; x < 944; x++ {
					r, g, b, _ := photo.At(x, y).RGBA()
					if r < 16000 && g < 16000 && b < 16000 {
						ink++
					}
				}
			}
			require.Greater(t, ink, 100, "the body must contain visible glyphs")
			again, err := Render(t.Context(), text, "instagram.feed", style, Identity{Name: "Founder", Handle: "founder"}, nil, 0)
			require.NoError(t, err)
			require.Equal(t, images[0].JPEG, again[0].JPEG)
		})
	}
}

func TestLayoutPaginatesWithoutDroppingTextAndBoundsWork(t *testing.T) {
	body := strings.Repeat("We shipped a smaller, faster editor. ", 55)
	pages, err := Layout(body, "instagram.feed")
	require.NoError(t, err)
	require.Greater(t, len(pages), 1)
	characters := 0
	for _, page := range pages {
		for _, line := range page.lines {
			for _, run := range line.runs {
				characters += run.Runes.Count
			}
		}
	}
	require.Equal(t, len([]rune(strings.TrimSpace(body))), characters)
	_, err = Layout(strings.Repeat("x\n", 1000), "instagram.feed")
	require.ErrorContains(t, err, "more than 10 images")
	_, err = Layout(strings.Repeat("x", MaxCharacters+1), "instagram.feed")
	require.ErrorContains(t, err, "2200")
}

func TestEllipsizeLabelTruncatesClippedIdentity(t *testing.T) {
	faces, err := newFaces()
	require.NoError(t, err)
	longName := "Alexandra Josephine Montgomery Rutherfordington the Third Esquire of the Long Names Society"
	truncated := ellipsizeLabel(longName, faces, 34, 690)
	require.True(t, strings.HasSuffix(truncated, "…"), "clipped name must end in an ellipsis, got %q", truncated)
	lines := wrapText(truncated, faces, 34, 690)
	require.Len(t, lines, 1, "truncated name must fit on one line")
	require.LessOrEqual(t, lines[0].width, 690)
	require.Equal(t, "Founder", ellipsizeLabel("Founder", faces, 34, 690), "short names must stay unchanged")
	longHandle := "@" + strings.Repeat("a", 120)
	truncatedHandle := ellipsizeLabel(longHandle, faces, 27, 690)
	require.True(t, strings.HasSuffix(truncatedHandle, "…"), "clipped handle must end in an ellipsis, got %q", truncatedHandle)
	handleLines := wrapText(truncatedHandle, faces, 27, 690)
	require.Len(t, handleLines, 1, "truncated handle must fit on one line")
	require.LessOrEqual(t, handleLines[0].width, 690)
}

func TestRenderEllipsizesLongIdentity(t *testing.T) {
	style, err := Parse(map[string]any{"text_card": "always", "text_card_shadow": false})
	require.NoError(t, err)
	faces, err := newFaces()
	require.NoError(t, err)
	longName := "Alexandra Josephine Montgomery Rutherfordington the Third Esquire of the Long Names Society"
	clipped, err := Render(t.Context(), "Hello world", "instagram.feed", style, Identity{Name: longName, Handle: "founder"}, nil, 0)
	require.NoError(t, err)
	require.Len(t, clipped, 1)
	explicit, err := Render(t.Context(), "Hello world", "instagram.feed", style, Identity{Name: ellipsizeLabel(longName, faces, 34, 690), Handle: "founder"}, nil, 0)
	require.NoError(t, err)
	require.Len(t, explicit, 1)
	require.Equal(t, explicit[0].JPEG, clipped[0].JPEG, "the renderer must draw the ellipsized identity")
}
