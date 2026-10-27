import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { SocialAccount } from '$lib/api/client';
import '../../routes/layout.css';
import ComposerDestinationTabs from './composer-destination-tabs.svelte';

function socialAccount(id: string, platform: string, account_username: string): SocialAccount {
	return {
		id,
		slug: id,
		platform,
		account_id: id,
		account_username,
		account_avatar_url: '',
		instance_url: '',
		is_active: true,
		thread_replies_supported: true,
		messaging_supported: false,
		messages_enabled: false,
		grant_destination_count: 1,
		shared_grant: false
	};
}

describe('Composer destination tabs', () => {
	it('marks tabs with custom content and leaves shared tabs unmarked', async () => {
		const onActivate = vi.fn();
		const screen = await render(ComposerDestinationTabs, {
			accounts: [socialAccount('acc-1', 'x', 'one'), socialAccount('acc-2', 'threads', 'one')],
			activeAccountId: null,
			onActivate,
			accountLabel: (account: SocialAccount) => `@${account.account_username}`,
			issueCountFor: () => 0,
			isCustomFor: (account: SocialAccount) => account.id === 'acc-1'
		});

		await expect.element(screen.getByTestId('composer-destination-custom')).toBeVisible();
		expect(
			screen.container.querySelectorAll('[data-testid="composer-destination-custom"]')
		).toHaveLength(1);

		const customButton = screen.getByRole('button', { name: '@one, X, custom' });
		await expect.element(customButton).toBeVisible();
		expect(customButton.element().getAttribute('aria-pressed')).toBe('false');
		await expect.element(screen.getByRole('button', { name: '@one, Threads' })).toBeVisible();

		await customButton.click();
		expect(onActivate).toHaveBeenCalledExactlyOnceWith('acc-1');
	});

	it('keeps the custom marker next to the issue count', async () => {
		const screen = await render(ComposerDestinationTabs, {
			accounts: [socialAccount('acc-1', 'x', 'one')],
			activeAccountId: 'acc-1',
			onActivate: () => {},
			accountLabel: (account: SocialAccount) => `@${account.account_username}`,
			issueCountFor: () => 2,
			isCustomFor: () => true
		});

		expect(
			screen.container.querySelectorAll('[data-testid="composer-destination-custom"]')
		).toHaveLength(1);
		await expect.element(screen.getByText('2')).toBeVisible();
	});

	it('exposes a labelled group of toggle buttons instead of a tab contract', async () => {
		const screen = await render(ComposerDestinationTabs, {
			accounts: [socialAccount('acc-1', 'x', 'one'), socialAccount('acc-2', 'threads', 'one')],
			activeAccountId: null,
			onActivate: () => {},
			accountLabel: (account: SocialAccount) => `@${account.account_username}`,
			issueCountFor: () => 0,
			isCustomFor: () => false
		});

		expect(screen.container.querySelectorAll('[role="tablist"]')).toHaveLength(0);
		expect(screen.container.querySelectorAll('[role="tab"]')).toHaveLength(0);
		const group = screen.getByRole('group', { name: 'Destinations' });
		await expect.element(group).toBeVisible();
		expect(screen.container.querySelectorAll('button[aria-pressed]')).toHaveLength(3);
	});

	it('tracks the active destination with aria-pressed and keeps every button tabbable', async () => {
		const onActivate = vi.fn();
		const screen = await render(ComposerDestinationTabs, {
			accounts: [socialAccount('acc-1', 'x', 'one'), socialAccount('acc-2', 'threads', 'one')],
			activeAccountId: 'acc-2',
			onActivate,
			accountLabel: (account: SocialAccount) => `@${account.account_username}`,
			issueCountFor: () => 0,
			isCustomFor: () => false
		});

		const allButton = screen.getByRole('button', { name: 'All' });
		expect(allButton.element().getAttribute('aria-pressed')).toBe('false');
		const activeButton = screen.getByRole('button', { name: '@one, Threads' });
		expect(activeButton.element().getAttribute('aria-pressed')).toBe('true');
		await expect.element(screen.getByRole('button', { name: '@one, X' })).toBeVisible();
		for (const button of screen.container.querySelectorAll('button')) {
			expect(button.getAttribute('tabindex')).toBe(null);
		}
		expect(screen.container.querySelector('#composer-destination-acc-1')).not.toBe(null);

		await activeButton.click();
		expect(onActivate).toHaveBeenCalledWith('acc-2');
	});
});
