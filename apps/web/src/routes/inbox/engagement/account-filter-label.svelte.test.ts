import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { QueryClientProvider } from '@tanstack/svelte-query';
import { client, type User, type Workspace } from '$lib/api/client';
import type { components } from '$lib/api/types';
import { queryClient } from '$lib/query/client';
import { auth } from '$lib/stores/auth';
import { workspaceCtx } from '$lib/stores/workspace.svelte';
import { userProfileDefaults } from '$lib/test-fixtures/user-profile';
import { pendingInboxChanges } from '$lib/test-fixtures/inbox';
import EngagementPage from './+page.svelte';
import '../../layout.css';

// Component tests do not populate the SvelteKit page store, so provide its public readable contract.
// oxlint-disable-next-line anti-slop/no-module-mocking
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return { page: readable({ url: new URL('http://localhost/inbox/engagement') }) };
});

const getMock = vi.spyOn(client, 'GET');
const postMock = vi.spyOn(client, 'POST');
const putMock = vi.spyOn(client, 'PUT');
const initializeMock = vi.spyOn(workspaceCtx, 'initialize');

type SocialAccount = components['schemas']['AccountResponse'];

const account: SocialAccount = {
	id: 'account-1',
	platform: 'x',
	account_id: 'launch-id',
	account_username: 'launch',
	account_avatar_url: '',
	instance_url: '',
	is_active: true,
	messages_enabled: true,
	messaging_supported: true,
	grant_destination_count: 0,
	shared_grant: false,
	slug: 'launch',
	thread_replies_supported: true
};

function mockEngagement() {
	getMock.mockImplementation(async (path, options?: { signal?: AbortSignal | null }) => {
		if (path === '/inbox/changes') return pendingInboxChanges(options?.signal);
		if (path === '/engagement') {
			return { data: { items: [], total: 0, sync_states: [], next_cursor: '' } };
		}
		if (path === '/accounts') return { data: [account] };
		if (path === '/account-features') return { data: [] };
		if (path === '/publications') {
			return { data: [], response: new Response(null, { headers: { 'X-Next-Cursor': '' } }) };
		}
		return { data: [] };
	});
}

describe('engagement account filter accessible name', () => {
	beforeEach(() => {
		queryClient.clear();
		auth.setUser(user('user-a'));
		workspaceCtx.currentWorkspace = workspace;
		workspaceCtx.workspaces = [workspace];
		workspaceCtx.settingsWorkspaceID = workspace.id;
		initializeMock.mockReset();
		initializeMock.mockResolvedValue();
		getMock.mockReset();
		postMock.mockReset();
		postMock.mockResolvedValue({ response: new Response(null, { status: 204 }) });
		putMock.mockReset();
	});

	it('announces "All accounts" with nothing selected and the selected account otherwise', async () => {
		mockEngagement();
		const screen = await render(
			EngagementPage,
			{},
			{
				wrapper: QueryClientProvider,
				wrapperProps: { client: queryClient }
			}
		);
		const trigger = screen.getByRole('button', { name: 'All accounts' });
		await expect.element(trigger).toHaveAttribute('aria-label', 'All accounts');
		await trigger.click();
		await page.getByRole('option', { name: /launch/ }).click();
		const selected = screen.getByRole('button', { name: 'Account filter' });
		await expect.element(selected).toHaveAttribute('aria-label', 'Account filter: @launch, X');
		await expect
			.element(screen.getByRole('button', { name: 'All accounts' }))
			.not.toBeInTheDocument();
	});
});

const workspace = {
	id: 'workspace-a',
	name: 'Workspace A',
	avatar_url: '',
	color: '#f97316',
	created_at: '2026-09-01T10:00:00Z',
	organization_id: '',
	organization_name: '',
	role: 'admin',
	can_edit: true,
	can_connect: true,
	can_approve: true,
	sso_required: false,
	sso_authenticated: true,
	sso_identity_linked: true
} satisfies Workspace;

function user(id: string): User {
	return {
		...userProfileDefaults,
		id,
		email: `${id}@example.com`,
		username: id,
		public_profile_enabled: false,
		is_admin: false,
		is_managed: false,
		has_password: true,
		legal_acceptance_required: false,
		email_verified: true,
		created_at: '2026-09-01T10:00:00Z'
	};
}
