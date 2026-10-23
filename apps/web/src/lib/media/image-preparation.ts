import { applyAPIRequestHeaders, client } from '$lib/api/client';
import type { MediaUploadResult } from '$lib/media-upload-client';
import { uploadMediaFile } from '$lib/media-upload-client';
import { getAuthenticatedMediaByID } from '$lib/media-url';
import { IMAGE_EDITOR_IMPORT_LIMITS } from '$lib/image-editor/image-import';
import type { components } from '$lib/api/types';
import { m } from '$lib/paraglide/messages';

export async function optimizeStoredImage(
	mediaId: string,
	signal?: AbortSignal
): Promise<MediaUploadResult | null> {
	const { data, error } = await client.POST('/media/{id}/optimize-image', {
		params: { path: { id: mediaId } },
		signal
	});
	if (error || !data) throw new Error(error?.detail || m.compose_image_fit_failed());
	return data.optimized ? data.media : null;
}

export async function fitStoredImage(options: {
	workspaceId: string;
	mediaId: string;
	originalId: string;
	altText: string;
	limits: components['schemas']['MediaConstraint'];
	signal: AbortSignal;
}): Promise<MediaUploadResult> {
	const response = await fetch(getAuthenticatedMediaByID(options.mediaId), {
		headers: applyAPIRequestHeaders(new Headers()),
		signal: options.signal
	});
	if (!response.ok || !response.body) throw new Error(m.compose_image_fit_failed());
	const reader = response.body.getReader();
	const chunks: BlobPart[] = [];
	let size = 0;
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > IMAGE_EDITOR_IMPORT_LIMITS.maxFileBytes) {
				await reader.cancel();
				throw new Error(m.compose_image_fit_failed());
			}
			chunks.push(new Uint8Array(value));
		}
	} finally {
		reader.releaseLock();
	}
	const file = new File(
		chunks,
		'image.' + (response.headers.get('content-type')?.split('/')[1] ?? 'png'),
		{ type: response.headers.get('content-type')?.split(';')[0] ?? 'image/png' }
	);
	const { fitImageForNetwork } = await import('./image-fit');
	const fitted = await fitImageForNetwork(file, options.limits, options.signal);
	return uploadMediaFile({
		workspaceId: options.workspaceId,
		file: fitted,
		altText: options.altText,
		source: 'image_fit',
		parentMediaId: options.originalId,
		retentionClass: 'temporary',
		signal: options.signal
	});
}
