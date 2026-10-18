import { afterEach, expect, test } from "bun:test";

import { accountHandle, platformLabel, relativeTime } from "./format";

const relativeTimeFormat = Intl.RelativeTimeFormat;

afterEach(() => {
  Object.defineProperty(Intl, "RelativeTimeFormat", {
    configurable: true,
    value: relativeTimeFormat,
  });
});

test("formats publication times when Hermes does not provide RelativeTimeFormat", () => {
  Object.defineProperty(Intl, "RelativeTimeFormat", {
    configurable: true,
    value: undefined,
  });
  const now = Date.now();
  const originalNow = Date.now;
  Date.now = () => now;

  try {
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString())).toBe("5 minutes ago");
  } finally {
    Date.now = originalNow;
  }
});

test("formats account handles with exactly one at sign", () => {
  expect(accountHandle("@rodrgds", "youtube-rodrgds")).toBe("@rodrgds");
  expect(accountHandle("rodrgds", "youtube-rodrgds")).toBe("@rodrgds");
  expect(accountHandle("", "youtube-rodrgds")).toBe("youtube-rodrgds");
});

test("labels fediverse platforms by name", () => {
  expect(platformLabel("pixelfed")).toBe("Pixelfed");
  expect(platformLabel("peertube")).toBe("PeerTube");
  expect(platformLabel("lemmy")).toBe("Lemmy");
  expect(platformLabel("piefed")).toBe("PieFed");
});

test("labels Google Business instead of the raw slug", () => {
  expect(platformLabel("googlebusiness")).toBe("Google Business");
  expect(platformLabel("gmb")).toBe("Google Business");
});

test("labels fediverse software instead of the raw slug", () => {
  expect(platformLabel("gotosocial")).toBe("GoToSocial");
  expect(platformLabel("akkoma")).toBe("Akkoma");
  expect(platformLabel("pleroma")).toBe("Pleroma");
  expect(platformLabel("friendica")).toBe("Friendica");
});

test("every canonical platform key resolves to a name different from the raw key", () => {
  const expected: Record<string, string> = {
    x: "X",
    twitter: "X",
    mastodon: "Mastodon",
    pixelfed: "Pixelfed",
    peertube: "PeerTube",
    lemmy: "Lemmy",
    piefed: "PieFed",
    gotosocial: "GoToSocial",
    akkoma: "Akkoma",
    pleroma: "Pleroma",
    friendica: "Friendica",
    threads: "Threads",
    bluesky: "Bluesky",
    discord: "Discord",
    linkedin: "LinkedIn",
    instagram: "Instagram",
    facebook: "Facebook",
    youtube: "YouTube",
    tiktok: "TikTok",
    pinterest: "Pinterest",
    reddit: "Reddit",
    telegram: "Telegram",
    gmb: "Google Business",
    googlebusiness: "Google Business",
  };
  for (const [key, name] of Object.entries(expected)) {
    expect(platformLabel(key)).toBe(name);
    expect(platformLabel(`${key}:suffix`)).toBe(name);
  }
});

test("connection labels preserve display names and instance-qualified platform names", () => {
  expect(accountHandle("Rodrigo Dias", "facebook", "facebook")).toBe("Rodrigo Dias");
  expect(accountHandle("Rodrigo", "linkedin", "linkedin")).toBe("Rodrigo");
  expect(accountHandle("rodrgds", "threads", "threads")).toBe("@rodrgds");
  expect(accountHandle("Studio", "YouTube", "youtube")).toBe("Studio");
  expect(accountHandle("@studio", "YouTube", "youtube")).toBe("@studio");
  expect(platformLabel("mastodon:https://masto.pt")).toBe("Mastodon");
});
