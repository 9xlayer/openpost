import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SaveIndicator from './save-indicator.svelte';

describe('semantic status icons', () => {
	it('keeps save progress and success glyphs independent of the selected icon pack', async () => {
		const screen = await render(SaveIndicator, {
			saving: true,
			saved: false,
			savingLabel: 'Saving',
			savedLabel: 'Saved'
		});

		expect(
			screen.container.querySelector('[data-protected-icon]')?.getAttribute('data-protected-icon')
		).toBe('loading');
		await screen.rerender({
			saving: false,
			saved: true,
			savingLabel: 'Saving',
			savedLabel: 'Saved'
		});
		expect(
			screen.container.querySelector('[data-protected-icon]')?.getAttribute('data-protected-icon')
		).toBe('success');
	});
});
