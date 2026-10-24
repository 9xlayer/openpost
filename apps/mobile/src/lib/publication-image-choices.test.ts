import { expect, test } from "bun:test";
import type { components } from "@openpost/api-contract";
import { mobileRenditionInput } from "./publication-renditions";

const image: components["schemas"]["MediaSummary"] = {
  id: "original",
  mime_type: "image/png",
  url: "/media/original",
  original_filename: "original.png",
  alt_text: "Authored description",
  analysis_status: "ready",
  aspect_ratio: "1:1",
  dominant_type: "image",
  duration_ms: 0,
  frame_rate: 0,
  height: 2048,
  width: 2048,
  size: 20000,
  public_url_ready: false,
  public_url_status: 0,
  role: "attachment",
  settings: { crop: "authored" },
};
const sources: components["schemas"]["PublicationSegmentResponse"][] = [
  {
    id: "first",
    position: 0,
    body: "First caption",
    title: "",
    description: "",
    settings: {},
    media: [image],
  },
  {
    id: "tail",
    position: 1,
    body: "Continuation",
    title: "",
    description: "",
    settings: {},
    media: [{ ...image, id: "tail-image", alt_text: "Tail description" }],
  },
];

for (const strategy of ["preserve", "join"] as const) {
  test(`selecting a fitted image for a new ${strategy} destination retains every source and its metadata`, () => {
    const publication = { segments: sources, renditions: [] };
    const input = mobileRenditionInput(publication, "account", undefined, [], undefined, strategy, {
      original: "fitted",
    });
    if (strategy === "preserve") {
      expect(input.segments).toHaveLength(2);
      expect(input.segments?.[0]).toMatchObject({
        publication_segment_id: "first",
        media_inherited: false,
        media: [
          {
            media_id: "fitted",
            alt_text: "Authored description",
            role: "attachment",
            settings: { crop: "authored" },
          },
        ],
      });
      expect(input.segments?.[1]).toMatchObject({
        publication_segment_id: "tail",
        media_inherited: true,
      });
      expect(input.segments?.[1]?.media).toBeUndefined();
    } else {
      expect(input.segments).toHaveLength(1);
      expect(input.segments?.[0]?.source_overrides).toMatchObject([
        {
          publication_segment_id: "first",
          media_inherited: false,
          media: [{ media_id: "fitted", alt_text: "Authored description" }],
        },
        { publication_segment_id: "tail", media_inherited: true },
      ]);
    }
    expect(sources[0].media?.[0].id).toBe("original");
    const inherited = mobileRenditionInput(
      publication,
      "other-account",
      undefined,
      [],
      undefined,
      strategy,
    );
    expect(inherited).toEqual({ social_account_id: "other-account" });
  });
}

test("fitted image selection retains a legacy whole-output caption and independent attachment metadata", () => {
  const rendition: components["schemas"]["RenditionResponse"] = {
    id: "variant",
    publication_id: "post",
    social_account_id: "account",
    platform: "linkedin",
    target_key: "page",
    profile: "short_text",
    output_profile: "linkedin.post",
    format_locked: true,
    body: "Independent whole-output caption",
    title: "",
    description: "",
    settings: {},
    status: "draft",
    error_retryable: false,
    media: [],
    segments: [
      {
        id: "output",
        publication_segment_id: "first",
        position: 0,
        body: "Independent whole-output caption",
        body_override: "Independent whole-output caption",
        title: "",
        description: "",
        settings: {},
        status: "draft",
        error_retryable: false,
        media_inherited: false,
        media: [
          { ...image, alt_text: "Destination description" },
          { ...image, id: "tail-image" },
        ],
      },
    ],
  };
  const input = mobileRenditionInput(
    { segments: sources, renditions: [rendition] },
    "account",
    undefined,
    [],
    undefined,
    "join",
    { original: "fitted" },
  );
  expect(input.segments?.[0]).toMatchObject({
    body_override: "Independent whole-output caption",
    media_inherited: false,
    media: [
      { media_id: "fitted", alt_text: "Destination description" },
      { media_id: "tail-image" },
    ],
  });
  expect(input.segments?.[0]?.source_overrides).toBeUndefined();
  expect(rendition.segments?.[0].media?.[0].id).toBe("original");
});
