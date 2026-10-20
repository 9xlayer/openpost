import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MediaThumbnail from './media-thumbnail.svelte';

// Static assets served by the test dev server, so image loads settle without
// a network error and each error transition below is driven by the test.
const THUMB_SRC = '/assets/brand/pwa-192.png';
const ORIGINAL_SRC = '/assets/brand/icon.svg';

const imageItem = {
	mime_type: 'image/png',
	thumbnail_url: THUMB_SRC,
	poster_thumbnail_url: null,
	url: ORIGINAL_SRC,
	alt_text: 'The team after a successful release.',
	original_filename: 'team.png'
};

function imageElement(
	screen: { getByRole: (role: string, options?: Record<string, unknown>) => unknown },
	name: string
): HTMLImageElement {
	const locator = screen.getByRole('img', { name }) as { element: () => unknown };
	const element = locator.element();
	if (!(element instanceof HTMLImageElement)) throw new Error('Expected an image element.');
	return element;
}

describe('media thumbnail', () => {
	it('renders the thumbnail still with the authored alt text', async () => {
		const screen = await render(MediaThumbnail, {
			props: {
				item: imageItem,
				fallbackAlt: 'Media',
				class: 'size-full object-cover'
			}
		});

		await expect
			.element(screen.getByRole('img', { name: 'The team after a successful release.' }))
			.toBeVisible();
		const element = imageElement(screen, 'The team after a successful release.');
		expect(element.src).toContain(THUMB_SRC);
	});

	it('can render a larger still than the item thumbnail', async () => {
		const screen = await render(MediaThumbnail, {
			props: {
				item: imageItem,
				fallbackAlt: 'Media',
				still: '/assets/brand/pwa-512.png'
			}
		});

		const element = imageElement(screen, 'The team after a successful release.');
		expect(element.src).toContain('/assets/brand/pwa-512.png');
		expect(element.src).not.toContain(THUMB_SRC);

		element.dispatchEvent(new Event('error'));
		await tick();
		expect(element.src).toContain(ORIGINAL_SRC);
	});

	it('falls back to the filename and then the caller label for alt text', async () => {
		const withoutAlt = await render(MediaThumbnail, {
			props: {
				item: { ...imageItem, alt_text: '' },
				fallbackAlt: 'Media'
			}
		});
		await expect.element(withoutAlt.getByRole('img', { name: 'team.png' })).toBeVisible();

		const withoutNames = await render(MediaThumbnail, {
			props: {
				item: { ...imageItem, alt_text: null, original_filename: null },
				fallbackAlt: 'Media'
			}
		});
		await expect.element(withoutNames.getByRole('img', { name: 'Media' })).toBeVisible();
	});

	it('retries the original once before reporting a missing thumbnail', async () => {
		const onMissing = vi.fn();
		const screen = await render(MediaThumbnail, {
			props: {
				item: imageItem,
				fallbackAlt: 'Media',
				onMissing
			}
		});

		const element = imageElement(screen, 'The team after a successful release.');
		expect(element.src).toContain(THUMB_SRC);

		element.dispatchEvent(new Event('error'));
		await tick();
		expect(element.src).toContain(ORIGINAL_SRC);
		expect(element.src).not.toContain('pwa-192');
		expect(onMissing).not.toHaveBeenCalled();

		element.dispatchEvent(new Event('error'));
		await tick();
		await expect.element(screen.getByRole('img')).not.toBeInTheDocument();
		await expect.element(screen.getByRole('presentation')).toBeVisible();
		expect(onMissing).toHaveBeenCalledTimes(1);
	});

	it('shows a placeholder for audio without requesting a still', async () => {
		const screen = await render(MediaThumbnail, {
			props: {
				item: {
					mime_type: 'audio/mpeg',
					thumbnail_url: null,
					poster_thumbnail_url: null,
					url: ORIGINAL_SRC,
					alt_text: null,
					original_filename: 'episode.mp3'
				},
				fallbackAlt: 'Media'
			}
		});

		await expect.element(screen.getByRole('img')).not.toBeInTheDocument();
		await expect.element(screen.getByRole('presentation')).toBeVisible();
	});

	it('prefers the poster still for video', async () => {
		const screen = await render(MediaThumbnail, {
			props: {
				item: {
					mime_type: 'video/mp4',
					thumbnail_url: null,
					poster_thumbnail_url: ORIGINAL_SRC,
					url: THUMB_SRC,
					alt_text: null,
					original_filename: 'clip.mp4'
				},
				fallbackAlt: 'Media'
			}
		});

		await expect.element(screen.getByRole('img', { name: 'clip.mp4' })).toBeVisible();
		const element = imageElement(screen, 'clip.mp4');
		expect(element.src).toContain(ORIGINAL_SRC);
	});
});
