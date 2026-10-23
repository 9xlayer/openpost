import type { components } from '$lib/api/types';
import { m } from '$lib/paraglide/messages';
import {
	assertImageEditorImportAdmission,
	assertImageEditorImportDimensions,
	IMAGE_EDITOR_IMPORT_LIMITS
} from '$lib/image-editor/image-import';
import { IMAGE_EDITOR_EXPORT_WORKING_MEMORY_LIMIT } from '$lib/image-editor/export-budget';
import { encodeImageCanvas, type EncodedImageType } from './image-encode';

type Constraint = components['schemas']['MediaConstraint'];
const formats: EncodedImageType[] = ['image/png', 'image/webp', 'image/jpeg'];

/** Explicit, bounded preparation. Never used by automatic lossless optimization. */
export async function fitImageForNetwork(
	file: File,
	limits: Constraint,
	signal: AbortSignal
): Promise<File> {
	const mime = assertImageEditorImportAdmission(file);
	if (!formats.some((format) => format === mime)) throw new Error(m.compose_image_fit_failed());
	if (await animatedImage(file, mime)) throw new Error(m.compose_image_fit_animation());
	signal.throwIfAborted();
	const bitmap = await createImageBitmap(file);
	const canvas = document.createElement('canvas');
	try {
		signal.throwIfAborted();
		assertImageEditorImportDimensions(bitmap.width, bitmap.height);
		if (bitmap.width * bitmap.height * 16 > IMAGE_EDITOR_EXPORT_WORKING_MEMORY_LIMIT)
			throw new Error(m.compose_image_fit_failed());
		const allowed = formats.filter(
			(format) => !limits.allowed_mimes?.length || limits.allowed_mimes.includes(format)
		);
		if (!allowed.length) throw new Error(m.compose_image_fit_failed());
		const maxBytes = Math.min(
			IMAGE_EDITOR_IMPORT_LIMITS.maxFileBytes,
			...[limits.max_image_size_bytes, limits.max_size_bytes].filter(
				(n): n is number => !!n && n > 0
			)
		);
		const ratios = (limits.aspect_ratios ?? [])
			.map((ratio) => {
				const [w, h] = ratio.split(':').map(Number);
				return w / h;
			})
			.filter((n) => Number.isFinite(n) && n > 0);
		const ratio = ratios.length
			? ratios.reduce((best, next) =>
					Math.abs(Math.log(next / (bitmap.width / bitmap.height))) <
					Math.abs(Math.log(best / (bitmap.width / bitmap.height)))
						? next
						: best
				)
			: bitmap.width / bitmap.height;
		let width = Math.max(bitmap.width, Math.ceil(bitmap.height * ratio));
		let height = Math.ceil(width / ratio);
		const initialScale = Math.min(
			1,
			(limits.max_width || width) / width,
			(limits.max_height || height) / height,
			(limits.max_short_side || Math.min(width, height)) / Math.min(width, height)
		);
		width = Math.max(1, Math.floor(width * initialScale));
		height = Math.max(1, Math.floor(height * initialScale));
		for (let attempt = 0; attempt < 7; attempt++) {
			const scale = 0.8 ** attempt;
			canvas.width = Math.max(1, Math.floor(width * scale));
			canvas.height = Math.max(1, Math.floor(height * scale));
			if (canvas.width < (limits.min_width ?? 1) || canvas.height < (limits.min_height ?? 1)) break;
			if (canvas.width * canvas.height * 16 > IMAGE_EDITOR_EXPORT_WORKING_MEMORY_LIMIT)
				throw new Error(m.compose_image_fit_failed());
			const context = canvas.getContext('2d');
			if (!context) throw new Error(m.compose_image_fit_failed());
			context.imageSmoothingEnabled = true;
			context.imageSmoothingQuality = 'high';
			const imageScale = Math.min(1, canvas.width / bitmap.width, canvas.height / bitmap.height);
			const drawWidth = bitmap.width * imageScale,
				drawHeight = bitmap.height * imageScale;
			context.drawImage(
				bitmap,
				(canvas.width - drawWidth) / 2,
				(canvas.height - drawHeight) / 2,
				drawWidth,
				drawHeight
			);
			for (const format of allowed) {
				for (const quality of format === 'image/png' ? [1] : [0.94, 0.86, 0.78]) {
					signal.throwIfAborted();
					const blob = await encodeImageCanvas(canvas, format, quality);
					signal.throwIfAborted();
					if (blob.size <= maxBytes)
						return new File(
							[blob],
							file.name.replace(/\.[^.]+$/, '') +
								'-fit.' +
								(format === 'image/jpeg' ? 'jpg' : format.split('/')[1]),
							{ type: format }
						);
				}
			}
		}
		throw new Error(m.compose_image_fit_failed());
	} finally {
		bitmap.close();
		canvas.width = 0;
		canvas.height = 0;
	}
}

async function animatedImage(file: Blob, mime: string): Promise<boolean> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const view = new DataView(bytes.buffer);
	if (mime === 'image/png') {
		for (let pos = 8; pos + 12 <= bytes.length;) {
			const length = view.getUint32(pos);
			const kind = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
			if (kind === 'acTL') return true;
			if (kind === 'IDAT' || kind === 'IEND') return false;
			pos += length + 12;
		}
	}
	if (mime === 'image/webp') {
		for (let pos = 12; pos + 8 <= bytes.length;) {
			const kind = String.fromCharCode(...bytes.subarray(pos, pos + 4));
			const length = view.getUint32(pos + 4, true);
			if (
				kind === 'ANIM' ||
				kind === 'ANMF' ||
				(kind === 'VP8X' && pos + 8 < bytes.length && (bytes[pos + 8] & 2) !== 0)
			)
				return true;
			pos += 8 + length + (length % 2);
		}
	}
	return false;
}
