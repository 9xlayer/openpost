import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GridAltEditor from './grid-alt-editor.svelte';

describe('shared alt editor', () => {
	it('inline fires onChange per keystroke and shows the generating note', async () => {
		const onChange = vi.fn();
		const onDone = vi.fn();
		const screen = await render(GridAltEditor, {
			props: {
				open: true,
				value: '',
				mediaId: 'media-inline-1',
				captioning: true,
				variant: 'inline',
				onChange,
				onDone
			}
		});

		await screen.getByRole('textbox', { name: 'Alt text' }).fill('A red launch poster');
		expect(onChange).toHaveBeenCalledWith('A red launch poster');
		await expect.element(screen.getByText('Generating alt text...')).toBeVisible();
		await screen.getByRole('button', { name: 'Done' }).click();
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	it('panel fires onCommit only when dirty', async () => {
		const onChange = vi.fn();
		const onCommit = vi.fn();
		const screen = await render(GridAltEditor, {
			props: {
				value: 'Draft caption',
				mediaId: 'media-panel-1',
				savedValue: 'Saved caption',
				canEdit: true,
				variant: 'panel',
				onChange,
				onCommit
			}
		});

		await screen.getByRole('textbox', { name: 'Alt text' }).fill('Edited caption');
		expect(onChange).toHaveBeenCalledWith('Edited caption');
		await screen.getByRole('button', { name: 'Save alt text' }).click();
		expect(onCommit).toHaveBeenCalledTimes(1);
	});

	it('panel hides Save when clean, shows the generating note, and disables without permission', async () => {
		const onCommit = vi.fn();
		const screen = await render(GridAltEditor, {
			props: {
				value: 'Saved caption',
				mediaId: 'media-panel-2',
				savedValue: 'Saved caption',
				canEdit: false,
				captioning: true,
				variant: 'panel',
				onChange: vi.fn(),
				onCommit
			}
		});

		await expect.element(screen.getByRole('textbox', { name: 'Alt text' })).toBeDisabled();
		await expect.element(screen.getByText('Generating alt text...')).toBeVisible();
		expect(document.querySelector('button')).toBeNull();
		expect(onCommit).not.toHaveBeenCalled();
	});
});
