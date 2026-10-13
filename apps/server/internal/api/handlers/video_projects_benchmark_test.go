package handlers

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/openpost/backend/internal/models"
)

// Include JSON encoding: projection is followed by the HTTP response encoder.
func BenchmarkVideoProjectResponse(b *testing.B) {
	for _, itemCount := range []int{10, 100, 500} {
		b.Run(fmt.Sprintf("items_%d", itemCount), func(b *testing.B) {
			frames := make([]int, 120)
			values := make([]float64, len(frames))
			for i := range frames {
				frames[i] = i * 5
				values[i] = float64(i) / 119
			}
			items := make([]map[string]any, itemCount)
			for i := range items {
				items[i] = map[string]any{
					"id": fmt.Sprintf("clip-%d", i), "type": "video", "from": i * 30,
					"durationInFrames": 600, "label": "Recorded product demonstration",
					"transform": map[string]any{"x": 120, "y": 80, "width": 1920, "height": 1080},
					"keyframes": map[string]any{"opacity": map[string]any{"frames": frames, "values": values}},
				}
			}
			document, err := json.Marshal(map[string]any{
				"schemaFamily": "openpost", "schemaVersion": 11,
				"metadata": map[string]any{"width": 1920, "height": 1080, "fps": 30},
				"timeline": map[string]any{"items": items},
			})
			if err != nil {
				b.Fatal(err)
			}
			project := &models.VideoProject{ID: "benchmark", Name: "Demonstration", DocumentJSON: string(document)}
			b.ReportAllocs()
			b.SetBytes(int64(len(document)))
			b.ResetTimer()
			for b.Loop() {
				response, err := videoProjectResponse(project)
				if err != nil {
					b.Fatal(err)
				}
				if _, err := json.Marshal(response); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}
