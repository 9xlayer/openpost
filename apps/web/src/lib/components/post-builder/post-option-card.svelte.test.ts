import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { SocialAccount } from '$lib/api/client';
import type { PublicationPostOption } from '$lib/post-builder/client';
import PostOptionCard from './post-option-card.svelte';
import '../../../routes/layout.css';

const visualMocks = vi.hoisted(() => ({ render: vi.fn(), release: vi.fn() }));
vi.mock('$lib/post-builder/visuals', () => ({
	renderPostVisual: visualMocks.render,
	releasePostVisual: visualMocks.release
}));

const account: SocialAccount = {
	id: 'x-main',
	slug: 'x-main',
	platform: 'x',
	account_id: '123',
	account_username: 'founder',
	account_avatar_url: '',
	instance_url: '',
	is_active: true,
	grant_destination_count: 1,
	shared_grant: false,
	messaging_supported: false,
	messages_enabled: false,
	thread_replies_supported: true
};
const option: PublicationPostOption = {
	id: 'option-1',
	label: 'The preference',
	canonical_text: '',
	direction: {
		thesis: 'Fewer lines, more features.',
		outcome: 'shares',
		audience: 'engineers',
		angle: 'prefer simplicity',
		route: 'artifact_led',
		media: { treatment: 'meme', role: 'punchline', brief: 'Prefer fewer lines.' }
	},
	destinations: [
		{
			account_id: account.id,
			platform: 'x',
			objective: 'shares',
			archetype: 'artifact_joke',
			output_profile: 'x.short_text',
			preview: '',
			segments: [{ body: '' }],
			media: {
				treatment: 'meme',
				role: 'punchline',
				brief: 'Prefer fewer lines.',
				document: {
					schema_version: 1,
					template_id: 'meme',
					title: 'Less code',
					appearance: 'light',
					frame: 'natural',
					text_size: 'normal',
					meme: {
						template_id: 'drake',
						name: 'Drake',
						captions: ['more code', 'more features'],
						format: 'png',
						overlay_slots: 0,
						overlay_media_ids: []
					}
				}
			}
		}
	]
};
afterEach(() => vi.clearAllMocks());
it('retains a rendered visual while caption edits update the native preview', async () => {
	visualMocks.render.mockImplementation(async (_workspace, document) => ({
		url: 'data:image/png;base64,iVBORw0KGgo=',
		document
	}));
	const use = vi.fn();
	const props = {
		option,
		account,
		workspaceId: 'workspace-1',
		onUse: use,
		onChange: vi.fn()
	};
	const screen = render(PostOptionCard, props);
	await expect.poll(() => visualMocks.render.mock.calls.length).toBe(1);
	const edited = structuredClone(option);
	edited.destinations[0].segments[0].body = 'apparently the delete key is a product feature';
	await screen.rerender({ ...props, option: edited });
	await expect.element(screen.getByText(edited.destinations[0].segments[0].body)).toBeVisible();
	expect(visualMocks.render).toHaveBeenCalledTimes(1);
	await screen.getByRole('button', { name: 'Use this post' }).click();
	expect(use).toHaveBeenCalledWith(edited);
	await screen.unmount();
	expect(visualMocks.release).toHaveBeenCalledTimes(1);
});

it('discards late visual renders after recipe and Workspace changes or unmount', async () => {
	const completions: Array<(value: { url: string; document: unknown }) => void> = [];
	visualMocks.render.mockImplementation(() => new Promise((resolve) => completions.push(resolve)));
	const props = { option, account, workspaceId: 'workspace-1', onUse: vi.fn(), onChange: vi.fn() };
	const screen = render(PostOptionCard, props);
	await expect.poll(() => completions.length).toBe(1);
	const next = structuredClone(option);
	next.destinations[0].media.document!.title = 'A new recipe';
	await screen.rerender({ ...props, option: next, workspaceId: 'workspace-2' });
	await expect.poll(() => completions.length).toBe(2);
	const obsolete = { url: 'blob:obsolete', document: option.destinations[0].media.document };
	completions[0](obsolete);
	await expect.poll(() => visualMocks.release.mock.calls.length).toBe(1);
	expect(visualMocks.release).toHaveBeenCalledWith(obsolete);
	await expect.element(screen.getByText('Rendering the visual…')).toBeVisible();
	await screen.unmount();
	const detached = { url: 'blob:detached', document: next.destinations[0].media.document };
	completions[1](detached);
	await expect.poll(() => visualMocks.release.mock.calls.length).toBe(2);
	expect(visualMocks.release).toHaveBeenCalledWith(detached);
});
