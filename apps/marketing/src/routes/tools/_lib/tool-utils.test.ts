import { describe, expect, it } from 'vitest';
import { counterPlatforms, marketingRouteManifest } from '@openpost/social-images';
import { COUNTER_PLATFORMS, platformTextCount, splitSmartThread } from './tool-utils';

describe('public text tools', () => {
	it('uses the publishing count rules for platform text', () => {
		expect(platformTextCount('é', 'threads')).toBe(2);
		expect(platformTextCount('example.com', 'x')).toBe(23);
		expect(platformTextCount('https://example.com.', 'x')).toBe(24);
		expect(platformTextCount('👨‍👩‍👧‍👦', 'bluesky')).toBe(1);
		expect(platformTextCount('👨‍👩‍👧‍👦', 'mastodon')).toBe(7);
	});

	it('splits Threads text without exceeding the platform byte limit', () => {
		const limit = COUNTER_PLATFORMS.find((item) => item.key === 'threads')!.limit;
		const parts = splitSmartThread('é'.repeat(260), 'threads', limit, true);
		expect(parts.length).toBeGreaterThan(1);
		expect(parts.every((part) => new TextEncoder().encode(part.text).length <= limit)).toBe(true);
	});

	it('advertises the number of platforms the counter renders', () => {
		const entry = marketingRouteManifest.find(
			(route) => route.path === '/tools/multi-platform-character-counter'
		);
		expect(entry).toBeDefined();
		const match = /\b(\d+) social networks\b/u.exec(entry!.description);
		expect(match?.[1]).toBe(String(COUNTER_PLATFORMS.length));
		expect(COUNTER_PLATFORMS.map((platform) => platform.key)).toEqual(
			counterPlatforms.map((platform) => platform.key)
		);
		for (const platform of COUNTER_PLATFORMS) {
			expect(Number.isFinite(platform.limit)).toBe(true);
			expect(platform.name.length).toBeGreaterThan(0);
			expect(platform.note.length).toBeGreaterThan(0);
		}
	});
});
