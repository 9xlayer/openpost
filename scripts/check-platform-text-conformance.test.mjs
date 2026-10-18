import assert from "node:assert/strict";
import test from "node:test";

import {
  parseGoTextFacts,
  parseTypeScriptTextFacts,
  platformTextConformanceProblems,
  validatePlatformTextConformance,
} from "./check-platform-text-conformance.mjs";

const tsSource = `
export const YOUTUBE_DESCRIPTION_MAX_BYTES = 5000;
export const X_STANDARD_CHAR_LIMIT = 280;
export const X_PREMIUM_CHAR_LIMIT = 25_000;
const X_TRANSFORMED_URL_LENGTH = 23;
const MASTODON_URL_LENGTH = 23;
export const PLATFORM_LIMITS = {
  x: { key: "x", name: "X", charLimit: X_STANDARD_CHAR_LIMIT },
  mastodon: { key: "mastodon", name: "Mastodon", charLimit: 500 },
  youtube: { key: "youtube", name: "YouTube", charLimit: YOUTUBE_DESCRIPTION_MAX_BYTES },
};
`;

const goSources = {
  capabilities: `
const (
  ProviderX = "x"
  ProviderMastodon = "mastodon"
  ProviderYouTube = "youtube"
)
func ProviderTextLimit(provider string) (int, bool) {
  if provider == ProviderX {
    return 280, true
  }
}
var _ = []Capability{
  {Provider: ProviderX, Profile: models.ContentProfileShortText, Label: "X post", TextLimit: 25_000},
  {Provider: ProviderMastodon, Profile: models.ContentProfileShortText, Label: "Mastodon post", TextLimit: 500},
  {Provider: ProviderYouTube, Profile: models.ContentProfileLongVideo, Label: "YouTube video", TextLimit: providerlimits.YouTubeDescriptionMaxBytes},
}
`,
  textLength: `const (
  xTransformedURLLength = 23
  mastodonURLLength     = 23
)`,
  youtube: `const YouTubeDescriptionMaxBytes = 5000`,
  devnull: ``,
};

test("matching sources produce no conformance problems", () => {
  const problems = platformTextConformanceProblems(
    parseTypeScriptTextFacts(tsSource),
    parseGoTextFacts(goSources),
  );
  assert.deepEqual(problems, []);
});

test("a drifted TypeScript limit is reported", () => {
  const ts = parseTypeScriptTextFacts(tsSource.replace("charLimit: 500", "charLimit: 501"));
  const problems = platformTextConformanceProblems(ts, parseGoTextFacts(goSources));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /mastodon.*TypeScript 501 vs Go 500/u);
});

test("a drifted Go constant is reported", () => {
  const go = parseGoTextFacts({
    ...goSources,
    youtube: `const YouTubeDescriptionMaxBytes = 4999`,
  });
  const problems = platformTextConformanceProblems(parseTypeScriptTextFacts(tsSource), go);
  assert.ok(problems.some((problem) => problem.includes("YouTube description max bytes")));
});

test("the repository sources currently agree", async () => {
  assert.deepEqual(await validatePlatformTextConformance(), []);
});
