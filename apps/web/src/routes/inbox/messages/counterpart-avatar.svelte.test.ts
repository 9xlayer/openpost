import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { QueryClientProvider } from '@tanstack/svelte-query';
import { client, type User, type Workspace } from '$lib/api/client';
import { queryClient } from '$lib/query/client';
import { auth } from '$lib/stores/auth';
import { workspaceCtx } from '$lib/stores/workspace.svelte';
import { userProfileDefaults } from '$lib/test-fixtures/user-profile';
import MessagesPage from './+page.svelte';
import '../../layout.css';

// Component tests do not populate the SvelteKit page store, so provide its public readable contract.
// oxlint-disable-next-line anti-slop/no-module-mocking
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return { page: readable({ url: new URL('http://localhost/inbox/messages') }) };
});

const getMock = vi.spyOn(client, 'GET');
const postMock = vi.spyOn(client, 'POST');
const putMock = vi.spyOn(client, 'PUT');
const initializeMock = vi.spyOn(workspaceCtx, 'initialize');

function renderMessages() {
	return render(
		MessagesPage,
		{},
		{
			wrapper: QueryClientProvider,
			wrapperProps: { client: queryClient }
		}
	);
}

function mockInbox(items: ReturnType<typeof conversation>) {
	getMock.mockImplementation(async (path) => {
		if (path === '/messages') {
			return { data: { items, total: items.length, sync_states: [], next_cursor: '' } };
		}
		if (path === '/messages/{conversation_id}') {
			return { data: { items: [], next_cursor: '' }, response: new Response() };
		}
		if (path === '/accounts') return { data: [] };
		return { data: [] };
	});
}

function rowByName(container: Element, name: string): HTMLElement {
	const rows = [...container.querySelectorAll('button[data-unread]')];
	const row = rows.find((candidate) => candidate.textContent?.includes(name));
	if (!row) throw new Error(`Expected a conversation row for ${name}.`);
	// SAFETY: Conversation rows are <button> elements, which are always HTMLElements.
	return row as HTMLElement;
}

describe('messages counterpart avatar', () => {
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
		putMock.mockReset();
	});

	it('loads the counterpart photo lazily without sending a referrer', async () => {
		mockInbox([conversation('Ava Stone', 1, 'https://example.com/avatars/ava.png')]);
		const screen = await renderMessages();
		let image: HTMLImageElement | null = null;
		await vi.waitFor(() => {
			image = rowByName(screen.container, 'Ava Stone').querySelector('img');
			expect(image).not.toBeNull();
		});
		expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer');
		expect(image?.getAttribute('loading')).toBe('lazy');
	});

	it('uses the shared monogram rule for the counterpart fallback', async () => {
		mockInbox([conversation('Ada King Lovelace', 0)]);
		const screen = await renderMessages();
		await vi.waitFor(() => {
			const fallback = rowByName(screen.container, 'Ada King Lovelace').querySelector(
				'[data-slot="avatar-fallback"]'
			);
			// Shared rule: first + last word initials. The route-local rule used the first two words ("AK").
			expect(fallback?.textContent?.trim()).toBe('AL');
		});
	});

	it('uses the shared badge geometry on the counterpart avatar', async () => {
		mockInbox([conversation('Ava Stone', 1, 'https://example.com/avatars/ava.png')]);
		const screen = await renderMessages();
		await vi.waitFor(() => {
			const row = rowByName(screen.container, 'Ava Stone');
			expect(row.querySelector('.ring-background')).not.toBeNull();
			expect(row.querySelector('.border-card')).toBeNull();
		});
	});

	it('keeps the row unread state and hit target', async () => {
		mockInbox([conversation('Ava Stone', 1, 'https://example.com/avatars/ava.png')]);
		const screen = await renderMessages();
		await vi.waitFor(() => {
			const row = rowByName(screen.container, 'Ava Stone');
			expect(row).toHaveAttribute('data-unread', 'true');
			expect(row).toHaveClass('min-h-20');
		});
	});
});

function conversation(name: string, unreadCount: number, avatarUrl = '') {
	return {
		id: 'conversation-1',
		workspace_id: workspace.id,
		social_account_id: 'account-a',
		platform: 'bluesky',
		remote_conversation_id: 'remote-conversation-1',
		counterpart_remote_id: 'person-1',
		counterpart_name: name,
		counterpart_handle: `@${name.toLowerCase().replace(/\s+/g, '')}`,
		counterpart_avatar_url: avatarUrl,
		last_message_preview: `Message from ${name}`,
		last_remote_message_id: 'remote-message-1',
		unread_count: unreadCount,
		last_message_at: '2026-09-01T10:00:00Z',
		created_at: '2026-09-01T10:00:00Z',
		updated_at: '2026-09-01T10:00:00Z'
	};
}

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
