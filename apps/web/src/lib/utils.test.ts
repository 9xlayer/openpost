import { describe, expect, it } from 'vitest';
import {
	formatAccountHandle,
	getPlatformKey,
	getPlatformName,
	formatSocialAccountName
} from './utils';

describe('formatAccountHandle', () => {
	it('adds a handle prefix when it is missing', () => {
		expect(formatAccountHandle('rodgds')).toBe('@rodgds');
	});

	it('does not duplicate an existing handle prefix', () => {
		expect(formatAccountHandle('@rodgds')).toBe('@rodgds');
	});

	it('normalizes whitespace and repeated prefixes', () => {
		expect(formatAccountHandle('  @@rodgds  ')).toBe('@rodgds');
	});

	it('returns an empty string when no username is available', () => {
		expect(formatAccountHandle(undefined)).toBe('');
		expect(formatAccountHandle('@@')).toBe('');
	});
});

describe('formatSocialAccountName', () => {
	it('adds a handle prefix for handle-first platforms', () => {
		expect(formatSocialAccountName('rodgds', 'bluesky')).toBe('@rodgds');
		expect(formatSocialAccountName('rodgds', 'twitter')).toBe('@rodgds');
		expect(formatSocialAccountName('rodgds@masto.pt', 'mastodon:https://masto.pt')).toBe(
			'@rodgds@masto.pt'
		);
	});

	it('keeps display-name platforms unprefixed', () => {
		expect(formatSocialAccountName('Rodrigo', 'linkedin')).toBe('Rodrigo');
		expect(formatSocialAccountName('OpenPost Studio', 'youtube')).toBe('OpenPost Studio');
	});
});

describe('getPlatformName', () => {
	it('labels Google Business instead of the raw slug', () => {
		expect(getPlatformName('googlebusiness')).toBe('Google Business');
		expect(getPlatformName('gmb')).toBe('Google Business');
	});

	it('labels fediverse software and reddit instead of the raw slug', () => {
		expect(getPlatformName('gotosocial')).toBe('GoToSocial');
		expect(getPlatformName('akkoma')).toBe('Akkoma');
		expect(getPlatformName('pleroma')).toBe('Pleroma');
		expect(getPlatformName('friendica')).toBe('Friendica');
		expect(getPlatformName('reddit')).toBe('Reddit');
	});

	it('resolves every canonical platform key to a name different from the raw key', () => {
		const expected: Record<string, string> = {
			x: 'X',
			twitter: 'X',
			mastodon: 'Mastodon',
			pixelfed: 'Pixelfed',
			peertube: 'PeerTube',
			lemmy: 'Lemmy',
			piefed: 'PieFed',
			gotosocial: 'GoToSocial',
			akkoma: 'Akkoma',
			pleroma: 'Pleroma',
			friendica: 'Friendica',
			threads: 'Threads',
			bluesky: 'Bluesky',
			discord: 'Discord',
			linkedin: 'LinkedIn',
			instagram: 'Instagram',
			facebook: 'Facebook',
			youtube: 'YouTube',
			tiktok: 'TikTok',
			pinterest: 'Pinterest',
			telegram: 'Telegram',
			reddit: 'Reddit',
			gmb: 'Google Business',
			googlebusiness: 'Google Business'
		};
		for (const [key, name] of Object.entries(expected)) {
			expect(getPlatformName(key)).toBe(name);
			expect(getPlatformName(`${key}:suffix`)).toBe(name);
		}
	});
});

describe('getPlatformKey', () => {
	it('canonicalizes the Google Business alias', () => {
		expect(getPlatformKey('gmb')).toBe('googlebusiness');
		expect(getPlatformKey('googlebusiness')).toBe('googlebusiness');
	});
});
