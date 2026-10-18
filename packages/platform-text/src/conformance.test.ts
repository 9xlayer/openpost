import { describe, expect, it } from "vitest";

import {
  PLATFORM_LIMITS,
  X_PREMIUM_CHAR_LIMIT,
  X_STANDARD_CHAR_LIMIT,
  YOUTUBE_DESCRIPTION_MAX_BYTES,
  countPlatformText,
} from "./index";
import fixtures from "../conformance/fixtures.json";

describe("platform-text cross-language conformance", () => {
  it("keeps the named limit constants aligned with the shared fixture", () => {
    expect(X_STANDARD_CHAR_LIMIT).toBe(fixtures.constants.x_standard_char_limit);
    expect(X_PREMIUM_CHAR_LIMIT).toBe(fixtures.constants.x_premium_char_limit);
    expect(YOUTUBE_DESCRIPTION_MAX_BYTES).toBe(fixtures.constants.youtube_description_max_bytes);
  });

  it("keeps every shared platform limit aligned with the shared fixture", () => {
    for (const [platform, charLimit] of Object.entries(fixtures.limits)) {
      expect(PLATFORM_LIMITS[platform as keyof typeof PLATFORM_LIMITS].charLimit).toBe(charLimit);
    }
  });

  it("counts the shared fixture inputs as the Go implementation must", () => {
    for (const { platform, text, expected } of fixtures.counts) {
      expect(countPlatformText(platform, text)).toBe(expected);
    }
  });
});
