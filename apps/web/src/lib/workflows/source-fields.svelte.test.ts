import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { SocialAccount } from '@openpost/query-catalog';
import SourceFields from './source-fields.svelte';
import type { Source } from './api';

function sourceAccount(id: string, username: string): SocialAccount {
	return {
		id,
		slug: id,
		platform: 'x',
		account_id: id,
		account_username: username,
		account_avatar_url: '',
		instance_url: '',
		is_active: true,
		thread_replies_supported: false,
		messaging_supported: false,
		messages_enabled: false,
		grant_destination_count: 0,
		shared_grant: false
	};
}

const accounts: SocialAccount[] = [
	sourceAccount('account-a', 'alice'),
	sourceAccount('account-b', 'bob')
];

function publishedSource(account_ids: string[]): Source {
	return { kind: 'rendition_published', account_ids };
}

describe('workflow repost source picker', () => {
	it('unchecking any-source selects the first account and rechecking clears the list', async () => {
		const onchange = vi.fn();
		const screen = await render(SourceFields, {
			source: publishedSource([]),
			connections: [],
			accounts,
			onchange
		});

		const anySource = screen.getByRole('checkbox', { name: 'Any compatible source account' });
		await expect.element(anySource).toBeChecked();

		await anySource.click();
		expect(onchange).toHaveBeenLastCalledWith(
			expect.objectContaining({ account_ids: ['account-a'] })
		);

		await screen.rerender({
			source: publishedSource(['account-a']),
			connections: [],
			accounts,
			onchange
		});
		await expect.element(anySource).not.toBeChecked();

		await anySource.click();
		expect(onchange).toHaveBeenLastCalledWith(expect.objectContaining({ account_ids: [] }));
	});

	it('shows the account photo in the source picker when an avatar URL is set', async () => {
		const avatarUrl = 'https://example.com/avatar-alice.png';
		const avatarAccounts: SocialAccount[] = [
			{ ...sourceAccount('account-a', 'alice'), account_avatar_url: avatarUrl },
			sourceAccount('account-b', 'bob')
		];
		const screen = await render(SourceFields, {
			source: publishedSource([]),
			connections: [],
			accounts: avatarAccounts,
			onchange: vi.fn()
		});

		const image = screen.container.querySelector(`img[src="${avatarUrl}"]`);
		expect(image?.getAttribute('src')).toBe(avatarUrl);
	});
});
