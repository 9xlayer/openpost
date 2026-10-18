import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SettingsFormFooter from './settings-form-footer.svelte';
import '../../routes/layout.css';

describe('settings form footer', () => {
	it('announces busy state while saving without owning its own pending path', async () => {
		const screen = await render(SettingsFormFooter, {
			label: 'Save changes',
			savingLabel: 'Saving changes',
			saving: true
		});
		await expect
			.element(screen.getByRole('button', { name: 'Saving changes' }))
			.toHaveAttribute('aria-busy', 'true');
	});

	it('fires one save for two rapid clicks on a slow save', async () => {
		let finish!: () => void;
		const onSave = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		const screen = await render(SettingsFormFooter, {
			label: 'Save changes',
			savingLabel: 'Saving changes',
			onSave
		});
		const button = screen.getByRole('button', { name: 'Save changes' });
		const element = button.element();
		if (!(element instanceof HTMLButtonElement)) throw new Error('Expected a native button');
		await button.click();
		element.click();
		expect(onSave).toHaveBeenCalledOnce();
		finish();
		await expect
			.element(screen.getByRole('button', { name: 'Save changes' }))
			.toHaveAttribute('aria-busy', 'false');
	});
});
