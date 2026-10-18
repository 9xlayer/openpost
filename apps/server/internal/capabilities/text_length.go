package capabilities

import (
	"github.com/openpost/backend/internal/providerlimits"
)

// xTransformedURLLength and mastodonURLLength mirror
// providerlimits.XTransformedURLLength and
// providerlimits.MastodonCountedURLLength, where the runtime counter lives.
// The literals stay here because the shared cross-language guard pins them:
// platform_text_conformance_test.go and
// scripts/check-platform-text-conformance.mjs parse these exact values, and
// the fixture URL count cases fail if either side's 23 drifts.
const (
	xTransformedURLLength = 23
	mastodonURLLength     = 23
)

// TextLength is the single server counter for provider post-body length.
// It delegates to providerlimits.TextLength, the same implementation the
// platform delivery-side validators call, so capability validation and the
// publisher cannot drift apart. X normalizes text to NFC, shortens every URL
// to 23 characters, weights selected Unicode ranges as one character, and
// weights the rest as two. Bluesky counts grapheme clusters, the unit its
// 300-character post limit uses, Mastodon counts every link as 23 characters
// and every remote mention as its username. Threads and YouTube descriptions
// count UTF-8 bytes.
func TextLength(provider, text string) int {
	return providerlimits.TextLength(provider, text)
}
