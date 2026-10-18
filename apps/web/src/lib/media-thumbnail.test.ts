import { describe, expect, it } from 'vitest';
import { mediaThumbAlt, mediaThumbKind, mediaThumbnailURL } from './media-thumbnail';

describe('mediaThumbKind', () => {
	it('detects image, video, and audio MIME types', () => {
		expect(mediaThumbKind('image/png')).toBe('image');
		expect(mediaThumbKind('video/mp4')).toBe('video');
		expect(mediaThumbKind('audio/mpeg')).toBe('audio');
	});

	it('falls back to other for unknown MIME types', () => {
		expect(mediaThumbKind('application/pdf')).toBe('other');
		expect(mediaThumbKind('')).toBe('other');
	});
});

describe('mediaThumbnailURL', () => {
	it('prefers the thumbnail URL', () => {
		expect(
			mediaThumbnailURL({
				thumbnail_url: '/media/a/thumb/sm',
				poster_thumbnail_url: '/media/a/poster',
				url: '/media/a'
			})
		).toBe('/media/a/thumb/sm');
	});

	it('falls back to the poster URL when no thumbnail exists', () => {
		expect(
			mediaThumbnailURL({
				thumbnail_url: null,
				poster_thumbnail_url: '/media/a/poster',
				url: '/media/a'
			})
		).toBe('/media/a/poster');
	});

	it('falls back to the original URL when neither still exists', () => {
		expect(
			mediaThumbnailURL({
				thumbnail_url: '',
				poster_thumbnail_url: null,
				url: '/media/a'
			})
		).toBe('/media/a');
	});
});

describe('mediaThumbAlt', () => {
	it('prefers alt text, then the filename, then the caller fallback', () => {
		expect(mediaThumbAlt({ alt_text: 'Team photo', original_filename: 'team.png' }, 'Media')).toBe(
			'Team photo'
		);
		expect(mediaThumbAlt({ alt_text: '', original_filename: 'team.png' }, 'Media')).toBe(
			'team.png'
		);
		expect(mediaThumbAlt({ alt_text: null, original_filename: null }, 'Media')).toBe('Media');
	});
});
