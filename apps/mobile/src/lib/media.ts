import { nativeTelemetry } from "./telemetry";
import * as FileSystem from "expo-file-system/legacy";

import {
  api,
  apiRequestIdentityIsCurrent,
  captureApiRequestIdentity,
  errorMessage,
  type Api,
} from "./api/client";

export const MAX_MOBILE_ATTACHMENT_COUNT = 10;
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_ATTACHMENT_BYTES = 16 * 1024 * 1024 * 1024;
export const ORIGINAL_IMAGE_QUALITY = 1;

export interface AttachmentLimits {
  videoBytes: number;
  defaultBytes: number;
}

// Mirrors the server's published ceilings (media.go: MaxMediaUploadBytes and
// MaxBufferedMediaUploadBytes) until the shared source in #395 lands.
export const ATTACHMENT_SIZE_LIMITS: AttachmentLimits = {
  videoBytes: MAX_VIDEO_ATTACHMENT_BYTES,
  defaultBytes: MAX_ATTACHMENT_BYTES,
};

function formatAttachmentLimit(limit: number): string {
  if (limit >= 1024 * 1024 * 1024 && limit % (1024 * 1024 * 1024) === 0) {
    return `${limit / (1024 * 1024 * 1024)} GB`;
  }
  return `${Math.round(limit / (1024 * 1024))} MB`;
}

export function isVideoAttachment(mimeType: string, filename: string): boolean {
  if (mimeType.trim().toLowerCase().startsWith("video/")) return true;
  const dot = filename.toLowerCase().lastIndexOf(".");
  if (dot >= 0) {
    const ext = filename.toLowerCase().slice(dot);
    if (ext === ".mp4" || ext === ".mov" || ext === ".m4v" || ext === ".webm") return true;
  }
  return false;
}

export function attachmentSizeError(
  file: { mimeType: string; filename: string; size: number | null },
  limits: AttachmentLimits = ATTACHMENT_SIZE_LIMITS,
): string | null {
  if (file.size === null) return null;
  const video = isVideoAttachment(file.mimeType, file.filename);
  const limit = video ? limits.videoBytes : limits.defaultBytes;
  if (file.size <= limit) return null;
  if (video) return `Videos must be ${formatAttachmentLimit(limit)} or smaller.`;
  return `Attachments must be ${formatAttachmentLimit(limit)} or smaller.`;
}

export type PendingAttachment = {
  localId: string;
  uri: string;
  mimeType: string;
  filename: string;
  size: number | null;
};

/**
 * Upload a local file through the direct-upload session flow:
 * create session → raw binary upload to the presigned target → complete.
 * Returns the final media id for attaching to publications/renditions.
 */
export async function uploadAttachment(
  file: PendingAttachment,
  {
    client = api(),
    workspaceId,
    source,
    altText,
  }: {
    client?: Api;
    workspaceId: string;
    source?: "screenshot_template";
    altText?: string;
  },
): Promise<string> {
  const identity = captureApiRequestIdentity();
  const localFile = await FileSystem.getInfoAsync(file.uri);
  if (!localFile.exists || localFile.isDirectory) {
    throw new Error("This attachment is no longer available. Choose it again.");
  }
  // Android picker metadata can describe the original instead of its compressed copy.
  const size = localFile.size;
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error("This attachment is empty or its size could not be read.");
  }
  const sizeError = attachmentSizeError(
    { mimeType: file.mimeType, filename: file.filename, size },
    ATTACHMENT_SIZE_LIMITS,
  );
  if (sizeError) {
    throw new Error(sizeError);
  }
  const {
    data: session,
    error,
    response,
  } = await client.POST("/media/upload-session", {
    body: {
      workspace_id: workspaceId,
      filename: file.filename,
      size,
      mime_type: file.mimeType,
      asset_kind: "library",
      source: source ?? (file.localId.startsWith("camera:") ? "camera" : "upload"),
      ...(altText ? { alt_text: altText } : {}),
    },
  });
  if (error || !session)
    throw new Error(await errorMessage(response, "Upload failed to start", error));

  if (!session.deduped) {
    const uploadResult = await FileSystem.uploadAsync(session.upload.url, file.uri, {
      httpMethod: session.upload.method.toUpperCase() as "PUT" | "POST",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: session.upload.headers,
    });
    if (uploadResult.status >= 400) {
      throw new Error(`Upload failed (${uploadResult.status})`);
    }
  }

  const { error: completeError, response: completeResponse } = await client.POST(
    "/media/upload-session/{id}/complete",
    {
      params: { path: { id: session.media_id } },
      body: { workspace_id: workspaceId },
    },
  );
  if (completeError) {
    throw new Error(
      await errorMessage(completeResponse, "Upload could not be finalized", completeError),
    );
  }

  if (apiRequestIdentityIsCurrent(identity))
    nativeTelemetry.capture("media uploaded", {
      count: 1,
      source: file.localId.startsWith("camera:") ? "camera" : "upload",
    });
  return session.media_id;
}
