import type { components } from "@openpost/api-contract";

type Media = Pick<
  components["schemas"]["MediaSummary"],
  "id" | "role" | "alt_text" | "thumbnail_timestamp_ms" | "settings"
>;
type MediaInput = components["schemas"]["PublicationMediaInput"];
type RenditionInput = components["schemas"]["RenditionInput"];
type SegmentInput = components["schemas"]["RenditionSegmentInput"];
type Publication = Pick<components["schemas"]["PublicationResponse"], "segments" | "renditions"> &
  Partial<Pick<components["schemas"]["PublicationResponse"], "media">>;

function inputs(media: readonly Media[]): MediaInput[] {
  return media.map((item) => ({
    media_id: item.id,
    role: item.role,
    alt_text: item.alt_text,
    thumbnail_timestamp_ms: item.thumbnail_timestamp_ms,
    settings: item.settings,
  }));
}

/** Select fitted copies only in this destination, retaining source and media metadata. */
export function applyRenditionImageChoices(
  publication: Publication,
  rendition: RenditionInput,
  choices: Readonly<Record<string, string>>,
  strategy: "preserve" | "join",
): RenditionInput {
  if (!Object.keys(choices).length) return rendition;
  let changed = false;
  const replace = (media: readonly MediaInput[]) =>
    media.map((item) => {
      const selected = choices[item.media_id];
      if (!selected || selected === item.media_id) return item;
      changed = true;
      return { ...item, media_id: selected };
    });
  const sources = publication.segments ?? [];
  const stored = publication.renditions?.find(
    (item) => item.social_account_id === rendition.social_account_id,
  );
  let segments = rendition.segments;
  if (!segments?.length && !stored?.segments?.length && (stored || !sources.length)) {
    const media = replace(rendition.media ?? inputs(stored?.media ?? publication.media ?? []));
    return changed ? { ...rendition, media } : rendition;
  }
  if (!segments?.length) {
    segments =
      strategy === "join" && sources.length > 1
        ? [
            {
              publication_segment_id: sources[0].id,
              source_overrides: sources.map((source) => ({
                publication_segment_id: source.id,
                media_inherited: true,
              })),
            },
          ]
        : sources.map((source) => ({ publication_segment_id: source.id, media_inherited: true }));
  }
  const output: SegmentInput[] = segments.map((segment, index) => {
    if (segment.source_overrides?.length) {
      const overrides = sources
        .map((source) => {
          const authored = segment.source_overrides?.find(
            (item) => item.publication_segment_id === source.id,
          );
          const media =
            authored?.media_inherited === false
              ? (authored.media ?? [])
              : inputs(source.media ?? []);
          if (!media.some((item) => choices[item.media_id])) return authored;
          return {
            ...authored,
            publication_segment_id: source.id,
            media_inherited: false,
            media: replace(media),
          };
        })
        .filter((value): value is NonNullable<typeof value> => !!value);
      return { ...segment, source_overrides: overrides };
    }
    const storedSegment = stored?.segments?.[index];
    const source = sources.find((source) => source.id === segment.publication_segment_id);
    const media =
      segment.media_inherited === false
        ? (segment.media ?? [])
        : inputs(storedSegment?.media ?? source?.media ?? []);
    if (!media.some((item) => choices[item.media_id])) return segment;
    return { ...segment, media_inherited: false, media: replace(media) };
  });
  return changed ? { ...rendition, segments: output } : rendition;
}
