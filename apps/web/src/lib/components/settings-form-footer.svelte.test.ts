import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SettingsFormFooter from './settings-form-footer.svelte';
import '../../routes/layout.css';

describe('settings form footer', () => {
	it('announces busy state while saving without owning its own pending path', async () => {
		const onSave = vi.fn();
		const props = { label: 'Save changes', savingLabel: 'Saving changes', onSave };
		const screen = await render(SettingsFormFooter, props);
		await screen.getByRole('button', { name: 'Save changes' }).click();
		expect(onSave).toHaveBeenCalledOnce();
		await screen.rerender({ ...props, saving: true });
		await expect
			.element(screen.getByRole('button', { name: 'Saving changes' }))
			.toHaveAttribute('aria-busy', 'true');
	});
});
