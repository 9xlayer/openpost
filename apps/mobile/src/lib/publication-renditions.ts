import {
  readMentionMetadata,
  remapMentionMetadata,
  type PostTextValue,
} from "@openpost/platform-text/mentions";
import type { components } from "@openpost/api-contract";

type Publication = components["schemas"]["PublicationResponse"];
type Rendition = components["schemas"]["RenditionResponse"];
type RenditionSegment = components["schemas"]["RenditionSegmentResponse"];
type Media = components["schemas"]["MediaSummary"];
type MediaInput = components["schemas"]["PublicationMediaInput"];
type Attachment = { mediaId?: string; mimeType: string; altText?: string };
type PublicationContent = Pick<Publication, "renditions" | "segments">;
export type RenditionTextEdits = Readonly<Record<string, string>>;

function authoredSegmentBody(
  publication: PublicationContent,
  rendition: Rendition,
  segment: RenditionSegment,
) {
  if (segment.body_override !== undefined) return segment.body_override;
  if (rendition.segments?.length === 1 && (publication.segments?.length ?? 0) > 1) {
    return publication
      .segments!.map((source) => source.body.trim())
      .filter(Boolean)
      .join("\n\n");
  }
  return (
    publication.segments?.find((source) => source.id === segment.publication_segment_id)?.body ??
    segment.body
  );
}

/** Joined captions edit canonical sources; thread captions edit ordered output segments. */
export function mobileRenditionTextFields(publication: PublicationContent, accountId: string) {
  const rendition = publication.renditions?.find((item) => item.social_account_id === accountId);
  const joined = rendition?.segments?.find((segment) => segment.source_overrides?.length);
  if (joined) {
    return (publication.segments ?? []).map((source) => ({
      key: `source:${source.id}`,
      value:
        joined.source_overrides?.find((override) => override.publication_segment_id === source.id)
          ?.body_override ?? source.body,
    }));
  }
  if (rendition?.segments?.length) {
    return rendition.segments.map((segment) => ({
      key: `segment:${segment.position}`,
      value: authoredSegmentBody(publication, rendition, segment),
    }));
  }
  return [{ key: "body", value: rendition?.body ?? publication.segments?.[0]?.body ?? "" }];
}

function withAttachments(
  media: readonly MediaInput[],
  attachments: readonly Attachment[],
): MediaInput[] {
  const capturedAltText = new Map<string, string>();
  for (const attachment of attachments) {
    if (attachment.mediaId && attachment.altText !== undefined)
      capturedAltText.set(attachment.mediaId, attachment.altText);
  }
  const result = media.map((item) => {
    const altText = capturedAltText.get(item.media_id);
    return altText === undefined ? item : { ...item, alt_text: altText };
  });
  for (const attachment of attachments) {
    if (attachment.mediaId && !result.some((item) => item.media_id === attachment.mediaId))
      result.push({
        media_id: attachment.mediaId,
        ...(attachment.altText === undefined ? {} : { alt_text: attachment.altText }),
      });
  }
  return result;
}

function mediaInput(media: Media): MediaInput {
  return {
    media_id: media.id,
    role: media.role,
    alt_text: media.alt_text,
    thumbnail_timestamp_ms: media.thumbnail_timestamp_ms,
    settings: media.settings,
  };
}

export function attachmentRequirement(
  settings: Record<string, unknown> | null | undefined,
): { kind: "image" | "video"; brief: string } | undefined {
  const value = settings?.attachment_requirement;
  if (
    !value ||
    typeof value !== "object" ||
    !("kind" in value) ||
    (value.kind !== "image" && value.kind !== "video")
  )
    return;
  return {
    kind: value.kind,
    brief: "brief" in value && typeof value.brief === "string" ? value.brief : "",
  };
}

/** Preserve authored destination media, formats, and segment settings on native saves. */
export function mobileRenditionInput(
  publication: PublicationContent,
  accountId: string,
  textEdits: RenditionTextEdits | undefined,
  attachments: readonly Attachment[],
  annotatedEdits?: Readonly<Record<string, PostTextValue>>,
): components["schemas"]["RenditionInput"] {
  const rendition = publication.renditions?.find((item) => item.social_account_id === accountId);
  if (!rendition)
    return {
      ...(annotatedEdits?.body?.mentions !== undefined
        ? {
            segments: [
              {
                publication_segment_id: publication.segments?.[0]?.id,
                body_override: annotatedEdits.body.body,
                settings: { mentions: { version: 1, spans: annotatedEdits.body.mentions } },
              },
            ],
          }
        : {}),
      social_account_id: accountId,
      ...(textEdits?.body === undefined ? {} : { body: textEdits.body }),
    };
  const segments = rendition.segments?.map((segment) => {
    const requirement = attachmentRequirement(segment.settings);
    const supplied = requirement
      ? attachments.filter(
          (attachment) =>
            attachment.mediaId && attachment.mimeType.startsWith(`${requirement.kind}/`),
        )
      : [];
    const media = withAttachments((segment.media ?? []).map(mediaInput), supplied);
    const textEdit = annotatedEdits?.[`segment:${segment.position}`];
    let body =
      textEdit?.body ?? textEdits?.[`segment:${segment.position}`] ?? segment.body_override;
    let sources = segment.source_overrides;
    if (sources?.length) {
      sources = sources.map((source) => ({ ...source }));
      for (const canonical of publication.segments ?? []) {
        const annotated = annotatedEdits?.[`source:${canonical.id}`];
        const caption = annotated?.body ?? textEdits?.[`source:${canonical.id}`];
        const addsMedia = supplied.length > 0 && canonical.id === publication.segments?.[0]?.id;
        if (caption === undefined && !addsMedia) continue;
        let source = sources.find((item) => item.publication_segment_id === canonical.id);
        if (!source) {
          source = { publication_segment_id: canonical.id, media_inherited: true };
          sources.push(source);
        }
        if (caption !== undefined) {
          source.body_override = caption;
          if (annotated?.mentions !== undefined)
            source.mentions = { version: 1, spans: annotated.mentions };
          else {
            const previous = joinedSourceMentionValue(publication, segment, canonical.id);
            const metadata = remapMentionMetadata(previous.body, caption, previous.metadata);
            if (metadata) source.mentions = metadata;
          }
        }
        if (addsMedia) {
          const sourceMedia = source.media_inherited
            ? (canonical.media ?? []).map(mediaInput)
            : (source.media ?? []);
          source.media = withAttachments(sourceMedia, supplied);
          source.media_inherited = false;
        }
      }
      if (publication.segments?.length) {
        body = publication.segments
          .map((canonical) =>
            (
              sources?.find((source) => source.publication_segment_id === canonical.id)
                ?.body_override ?? canonical.body
            ).trim(),
          )
          .filter(Boolean)
          .join("\n\n");
      }
    }
    return {
      publication_segment_id: segment.publication_segment_id,
      body_override: body,
      title_override: segment.title_override,
      description_override: segment.description_override,
      url_override: segment.url_override,
      settings: renditionMentionSettings(
        publication,
        rendition,
        segment,
        body,
        textEdit,
        (sources?.length ?? 0) > 0,
      ),
      media_inherited: supplied.length ? false : segment.media_inherited,
      ...(supplied.length || !segment.media_inherited ? { media } : {}),
      ...(sources?.length ? { source_overrides: sources } : {}),
    };
  });
  return {
    social_account_id: accountId,
    target_key: rendition.target_key,
    output_profile: rendition.output_profile,
    format_locked: rendition.format_locked,
    profile: rendition.profile,
    title: rendition.title,
    description: rendition.description,
    settings: rendition.settings,
    schedule_override: rendition.schedule_override,
    ...(segments?.length
      ? {
          body:
            segments[0].body_override ??
            authoredSegmentBody(publication, rendition, rendition.segments![0]!),
          segments,
        }
      : {
          body: textEdits?.body ?? rendition.body,
          media: (rendition.media ?? []).map(mediaInput),
        }),
  };
}

export function renditionImages(rendition: Rendition): Media[] {
  const media =
    rendition.segments?.flatMap((segment) => segment.media ?? []) ?? rendition.media ?? [];
  return [
    ...new Map(
      media.filter((item) => item.mime_type.startsWith("image/")).map((item) => [item.id, item]),
    ).values(),
  ];
}

function joinedSourceMentionValue(
  publication: PublicationContent,
  segment: RenditionSegment,
  id: string,
) {
  const canonical = publication.segments?.find((source) => source.id === id);
  const own = segment.source_overrides?.find((source) => source.publication_segment_id === id);
  const body = own?.body_override ?? canonical?.body ?? "";
  return {
    body,
    metadata: readMentionMetadata(
      body,
      own?.body_override !== undefined ? own.mentions : canonical?.settings?.mentions,
    ),
  };
}
export function mobileRenditionTextValue(
  publication: PublicationContent,
  accountId: string,
  key: string,
  body: string,
): PostTextValue {
  const rendition = publication.renditions?.find((item) => item.social_account_id === accountId);
  let metadata;
  if (key.startsWith("source:")) {
    const segment = rendition?.segments?.find((segment) => segment.source_overrides?.length);
    if (segment) metadata = joinedSourceMentionValue(publication, segment, key.slice(7)).metadata;
  } else {
    const segment = rendition?.segments?.find((segment) => key === `segment:${segment.position}`);
    const source = publication.segments?.find(
      (source) => source.id === segment?.publication_segment_id,
    );
    metadata = readMentionMetadata(
      body,
      segment?.body_override !== undefined
        ? segment.settings?.mentions
        : source?.settings?.mentions,
    );
  }
  return { body, mentions: metadata?.spans };
}

function renditionMentionSettings(
  publication: PublicationContent,
  rendition: Rendition,
  segment: RenditionSegment,
  body: string | undefined,
  edited: PostTextValue | undefined,
  joined: boolean,
) {
  if (joined) return segment.settings;
  if (edited?.mentions !== undefined)
    return { ...segment.settings, mentions: { version: 1 as const, spans: edited.mentions } };
  if (body === undefined) return segment.settings;
  const previous = authoredSegmentBody(publication, rendition, segment);
  const metadata = remapMentionMetadata(
    previous,
    body,
    readMentionMetadata(previous, segment.settings?.mentions),
  );
  return metadata ? { ...segment.settings, mentions: metadata } : segment.settings;
}
