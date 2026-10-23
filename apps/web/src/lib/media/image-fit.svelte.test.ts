import { expect, it } from 'vitest';
import { fitImageForNetwork } from './image-fit';
import type { components } from '$lib/api/types';
import animatedWebP from '$lib/video-editor/media/fixtures/animated-rgb.webp?url';

function limits(
	overrides: Partial<components['schemas']['MediaConstraint']> = {}
): components['schemas']['MediaConstraint'] {
	return {
		min_count: 0,
		max_count: 4,
		allowed_mimes: ['image/jpeg'],
		requires_public_url: false,
		requires_https_fetchable: false,
		...overrides
	};
}
async function noiseImage(): Promise<File> {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 192;
	const context = canvas.getContext('2d')!;
	const pixels = context.createImageData(256, 192);
	let state = 417;
	for (let i = 0; i < pixels.data.length; i += 4) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		pixels.data[i] = state & 255;
		pixels.data[i + 1] = (state >>> 8) & 255;
		pixels.data[i + 2] = (state >>> 16) & 255;
		pixels.data[i + 3] = 255;
	}
	context.putImageData(pixels, 0, 0);
	const blob = await new Promise<Blob>((resolve) =>
		canvas.toBlob((value) => resolve(value!), 'image/png')
	);
	return new File([blob], 'original.png', { type: 'image/png' });
}
it('fits encoded bytes and dimensions while preserving original bytes and proportions', async () => {
	const original = await noiseImage();
	const bytes = await original.arrayBuffer();
	const fitted = await fitImageForNetwork(
		original,
		limits({
			max_image_size_bytes: 12000,
			max_width: 128,
			max_height: 128,
			min_width: 64,
			min_height: 64
		}),
		new AbortController().signal
	);
	expect(fitted.type).toBe('image/jpeg');
	expect(fitted.size).toBeLessThanOrEqual(12000);
	const decoded = await createImageBitmap(fitted);
	expect(decoded.width).toBeLessThanOrEqual(128);
	expect(decoded.width).toBeGreaterThanOrEqual(64);
	expect(decoded.height).toBeGreaterThanOrEqual(64);
	expect(decoded.width / decoded.height).toBeCloseTo(4 / 3, 1);
	decoded.close();
	expect(await original.arrayBuffer()).toEqual(bytes);
});
it('preserves transparency when PNG is accepted', async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 80;
	canvas.height = 80;
	canvas.getContext('2d')!.fillRect(0, 0, 40, 80);
	const blob = await new Promise<Blob>((resolve) =>
		canvas.toBlob((value) => resolve(value!), 'image/png')
	);
	const fitted = await fitImageForNetwork(
		new File([blob], 'alpha.png', { type: 'image/png' }),
		limits({
			allowed_mimes: ['image/png'],
			max_width: 40,
			max_height: 40,
			max_image_size_bytes: 5000
		}),
		new AbortController().signal
	);
	const bitmap = await createImageBitmap(fitted);
	canvas.width = 40;
	canvas.height = 40;
	const context = canvas.getContext('2d')!;
	context.drawImage(bitmap, 0, 0);
	bitmap.close();
	expect(context.getImageData(39, 20, 1, 1).data[3]).toBe(0);
	expect(context.getImageData(0, 20, 1, 1).data[3]).toBe(255);
});
it('rejects animation and cancellation rather than silently flattening a frame', async () => {
	const source = await (await fetch(animatedWebP)).blob();
	await expect(
		fitImageForNetwork(
			new File([source], 'animated.webp', { type: 'image/webp' }),
			limits(),
			new AbortController().signal
		)
	).rejects.toThrow(/Animated/);
	const controller = new AbortController();
	controller.abort();
	await expect(
		fitImageForNetwork(await noiseImage(), limits(), controller.signal)
	).rejects.toThrow();
});
