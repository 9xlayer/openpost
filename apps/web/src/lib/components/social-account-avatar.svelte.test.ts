import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SocialAccountAvatar from './social-account-avatar.svelte';

describe('social account avatar', () => {
	it('renders the shared monogram fallback when no photo is available', async () => {
		const screen = await render(SocialAccountAvatar, {
			name: 'Rodrigo',
			platform: 'linkedin'
		});
		const fallback = screen.container.querySelector('[data-slot="avatar-fallback"]');
		expect(fallback?.textContent).toContain('RO');
	});

	it('falls back to the handle monogram when the name is blank', async () => {
		const screen = await render(SocialAccountAvatar, {
			name: '   ',
			handle: '@ada',
			platform: 'linkedin'
		});
		const fallback = screen.container.querySelector('[data-slot="avatar-fallback"]');
		expect(fallback?.textContent).toContain('AD');
	});

	it('loads the provider photo lazily without sending a referrer', async () => {
		const screen = await render(SocialAccountAvatar, {
			name: 'Rodrigo',
			platform: 'linkedin',
			avatarUrl:
				'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="10" height="10"%3E%3Crect width="10" height="10" fill="red"/%3E%3C/svg%3E'
		});
		const image = screen.container.querySelector('img');
		if (!image) throw new Error('Expected a provider avatar image.');
		expect(image.getAttribute('loading')).toBe('lazy');
		expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
	});
	it('reveals the native loaded image and hides its fallback', async () => {
		const screen = await render(SocialAccountAvatar, {
			name: 'Rodrigo',
			platform: 'linkedin',
			avatarUrl:
				'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="10" height="10"%3E%3Crect width="10" height="10" fill="red"/%3E%3C/svg%3E'
		});
		const image = screen.container.querySelector('img');
		if (!image) throw new Error('Expected a provider avatar image.');

		await vi.waitFor(() => expect(getComputedStyle(image).opacity).toBe('1'));
		await vi.waitFor(() =>
			expect(screen.container.querySelector('[data-slot="avatar-fallback"]')).toHaveClass(
				'invisible'
			)
		);
	});
});
