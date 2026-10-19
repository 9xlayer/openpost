import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userProfileDefaults } from '$lib/test-fixtures/user-profile';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { CalendarDate } from '@internationalized/date';
import { client, type User, type Workspace } from '$lib/api/client';
import type { components } from '$lib/api/types';
import { queryClient } from '$lib/query/client';
import { auth } from '$lib/stores/auth';
import { ui } from '$lib/stores/ui.svelte';
import { workspaceCtx } from '$lib/stores/workspace.svelte';
import DayPostsModal from './day-posts-modal.svelte';

type Publication = components['schemas']['PublicationResponse'];

const getMock = vi.spyOn(client, 'GET');
const deleteMock = vi.spyOn(client, 'DELETE');
const publicationReadDays: string[] = [];

describe('day posts deletion ownership', () => {
	beforeEach(() => {
		queryClient.clear();
		getMock.mockReset();
		deleteMock.mockReset();
		publicationReadDays.length = 0;
		auth.setUser(user('user-a'));
		selectWorkspace('workspace-a');
		ui.closeDayPosts();
		ui.dayPostsDate = undefined;
		getMock.mockImplementation(
			async (path, request: { params?: { query?: { calendar_from?: string } } }) => {
				if (path !== '/publications') throw new Error(`Unexpected GET ${path}`);
				const day = request?.params?.query?.calendar_from?.slice(0, 10) ?? '';
				publicationReadDays.push(day);
				// SAFETY: The fixture contains every response field consumed by the component.
				return {
					data: [publication(day)],
					error: undefined,
					response: new Response(null, { status: 200 })
				} as never;
			}
		);
	});

	it('does not refresh a new day when an old day deletion completes', async () => {
		const deletion = deferred<{ error: undefined; response: Response }>();
		// SAFETY: The deferred value matches the endpoint response used by this test.
		deleteMock.mockReturnValue(deletion.promise as never);
		await render(DayPostsModal);

		ui.openDayPosts(new CalendarDate(2026, 9, 1));
		await expect.element(page.getByText('Post for 2026-09-01')).toBeVisible();
		await page.getByRole('button', { name: 'Post actions' }).click();
		await page.getByRole('menuitem', { name: 'Delete post' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
		expect(deleteMock).toHaveBeenCalledWith('/publications/{id}', {
			params: {
				path: { id: 'post-2026-09-01' },
				query: { confirm: true, expected_revision: 1 }
			}
		});

		ui.openDayPosts(new CalendarDate(2026, 9, 2));
		await expect.element(page.getByText('Post for 2026-09-02')).toBeVisible();
		const newDayReads = publicationReadCount('2026-09-02');

		deletion.resolve({ error: undefined, response: new Response(null, { status: 204 }) });
		await new Promise((resolve) => setTimeout(resolve, 20));

		await expect.element(page.getByText('Post for 2026-09-02')).toBeVisible();
		expect(publicationReadCount('2026-09-02')).toBe(newDayReads);
	});

	function publicationReadCount(day: string) {
		return publicationReadDays.filter((readDay) => readDay === day).length;
	}
});

describe('day posts account avatars', () => {
	const AVATAR_URL = 'https://cdn.example/founder.jpg';

	beforeEach(() => {
		queryClient.clear();
		getMock.mockReset();
		deleteMock.mockReset();
		auth.setUser(user('user-a'));
		selectWorkspace('workspace-a');
		ui.closeDayPosts();
		ui.dayPostsDate = undefined;
		getMock.mockImplementation(async (path) => {
			if (path === '/publications') {
				// SAFETY: The fixture contains every response field consumed by the component.
				return {
					data: [publicationWithDestination()],
					error: undefined,
					response: new Response(null, { status: 200 })
				} as never;
			}
			if (path === '/accounts') {
				// SAFETY: The fixture contains every account field consumed by the component.
				return {
					data: [
						{
							id: 'account-1',
							platform: 'x',
							alias: 'Launch account',
							account_username: 'founder',
							account_avatar_url: AVATAR_URL,
							is_active: true
						}
					],
					error: undefined,
					response: new Response(null, { status: 200 })
				} as never;
			}
			throw new Error(`Unexpected GET ${path}`);
		});
	});

	it('renders the account photo for a photo-bearing destination', async () => {
		await render(DayPostsModal);
		ui.openDayPosts(new CalendarDate(2026, 9, 1));
		await expect.element(page.getByText('Post for 2026-09-01')).toBeVisible();
		// Fails without the fix: destinations render a platform icon with no avatar image.
		const images = Array.from(document.querySelectorAll('img')).filter(
			(image) => image.getAttribute('src') === AVATAR_URL
		);
		expect(images.length).toBeGreaterThan(0);
	});

	function publicationWithDestination(): Publication {
		const post = publication('2026-09-01');
		// SAFETY: The fixture carries every rendition field the modal renders.
		return {
			...post,
			renditions: [
				{
					id: 'rendition-1',
					platform: 'x',
					status: 'scheduled',
					social_account_id: 'account-1',
					target_key: 'profile'
				} as never
			]
		};
	}
});

function selectWorkspace(id: string) {
	workspaceCtx.currentWorkspace = workspace(id);
	workspaceCtx.settingsWorkspaceID = id;
	workspaceCtx.settings = {
		name: id,
		avatar_url: '',
		color: '#f97316',
		timezone: 'UTC',
		week_start: 1,
		random_delay_minutes: 0,
		slot_start_hour: 5,
		slot_end_hour: 23,
		slot_interval_minutes: 15
	};
}

function workspace(id: string): Workspace {
	return {
		id,
		name: id,
		avatar_url: '',
		can_edit: true,
		can_connect: true,
		can_approve: true,
		color: '#f97316',
		created_at: '2026-09-01T10:00:00Z',
		organization_id: 'organization-1',
		organization_name: 'Organization',
		role: 'admin',
		sso_authenticated: true,
		sso_identity_linked: true,
		sso_required: false
	};
}

function publication(day: string): Publication {
	return {
		id: `post-${day}`,
		workspace_id: 'workspace-a',
		revision: 1,
		status: 'scheduled',
		content_profile: 'default',
		created_at: `${day}T09:00:00Z`,
		created_by: 'user-a',
		creation_preset: 'post',
		creation_source: 'web',
		intent: 'post',
		media: [],
		metadata: {},
		random_delay_inherited: true,
		random_delay_minutes: 0,
		renditions: [],
		repost_override: { mode: 'off' },
		scheduled_at: `${day}T09:00:00Z`,
		segments: [],
		source_text: `Post for ${day}`,
		title: '',
		updated_at: `${day}T09:00:00Z`
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((next) => {
		resolve = next;
	});
	return { promise, resolve };
}

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
