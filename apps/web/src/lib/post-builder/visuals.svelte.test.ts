import { expect, it, vi } from 'vitest';
import type { ScreenshotDocument } from '@openpost/query-catalog';
const calls = vi.hoisted(() => ({
	upload: vi.fn(),
	create: vi.fn(),
	save: vi.fn(),
	render: vi.fn()
}));
vi.mock('$lib/media-upload-client', () => ({ uploadMediaFile: calls.upload }));
vi.mock('$lib/screenshot-templates/api', () => ({
	createScreenshotDesign: calls.create,
	saveScreenshotExport: calls.save
}));
vi.mock('$lib/meme-generator/api', () => ({
	memeGeneratorAPI: { render: calls.render },
	memePreviewDataURL: vi.fn()
}));
vi.mock('$lib/stores/workspace.svelte', () => ({
	workspaceCtx: { currentWorkspace: { id: 'workspace-1' } }
}));
import { savePostVisual } from './visuals';
it('saves the displayed meme PNG as a screenshot export with its editable recipe', async () => {
	const document: ScreenshotDocument = {
		schema_version: 1,
		template_id: 'meme',
		title: 'The preference',
		appearance: 'light',
		frame: 'natural',
		text_size: 'normal',
		meme: {
			template_id: 'drake',
			name: 'Drake',
			captions: ['more code', 'more features'],
			overlay_slots: 0,
			overlay_media_ids: [],
			format: 'png'
		}
	};
	const blob = new Blob(['rendered preview'], { type: 'image/png' });
	calls.create.mockResolvedValue({ id: 'design-1', revision: 1 });
	calls.upload.mockResolvedValue({ id: 'media-1' });
	calls.render.mockResolvedValue({ media: { id: 'legacy-meme-media' } });
	calls.save.mockResolvedValue({});
	const media = await savePostVisual(
		'workspace-1',
		{ url: 'blob:preview', blob, document },
		'Prefer fewer lines.'
	);
	expect(media.id).toBe('media-1');
	expect(calls.upload).toHaveBeenCalledWith(
		expect.objectContaining({
			workspaceId: 'workspace-1',
			source: 'screenshot_template',
			altText: 'Prefer fewer lines.'
		})
	);
	const uploaded = calls.upload.mock.calls[0][0].file;
	expect(uploaded.type).toBe('image/png');
	expect(await uploaded.text()).toBe('rendered preview');
	expect(calls.save).toHaveBeenCalledWith('design-1', 1, 'media-1');
	expect(calls.render).not.toHaveBeenCalled();
});
