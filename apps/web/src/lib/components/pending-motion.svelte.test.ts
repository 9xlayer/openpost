import { afterEach, describe, expect, it } from 'vitest';
import { cdp } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AsyncActionButton from './async-action-button.svelte';
import DialogLoadingStatus from './dialog-loading-status.svelte';
import SettingsFormFooter from './settings-form-footer.svelte';
import '../../routes/layout.css';

async function emulateReducedMotion(value: 'reduce' | 'no-preference'): Promise<void> {
	await cdp().send('Emulation.setEmulatedMedia', {
		features: [{ name: 'prefers-reduced-motion', value }]
	});
}

afterEach(async () => {
	await emulateReducedMotion('no-preference');
});

describe('pending spinners under reduced motion', () => {
	it('shared delete-dialog indicator rests while keeping its status announcement', async () => {
		await emulateReducedMotion('reduce');
		expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);

		const screen = await render(DialogLoadingStatus);
		await expect.element(screen.getByRole('status')).toBeVisible();

		const cells = [...screen.container.querySelectorAll('[data-slot="activity-indicator"] > span')];
		expect(cells.length).toBeGreaterThan(0);
		for (const cell of cells) {
			expect(getComputedStyle(cell).animationName).toBe('none');
		}

		// The emulation genuinely toggles the animation; the assertion above is not vacuous.
		await emulateReducedMotion('no-preference');
		expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
		expect(getComputedStyle(cells[0]).animationName).toContain('activity-cell');
	});

	it('settings save keeps a busy cue without spinning', async () => {
		await emulateReducedMotion('reduce');
		expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);

		const screen = await render(SettingsFormFooter, {
			label: 'Save',
			savingLabel: 'Saving',
			saving: true
		});
		await expect.element(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');

		const spinner = screen.container.querySelector('.animate-spin');
		expect(spinner).not.toBeNull();
		expect(getComputedStyle(spinner as Element).animationName).toBe('none');
	});

	it('async pending button keeps its busy announcement without spinning', async () => {
		await emulateReducedMotion('reduce');
		expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);

		const screen = await render(AsyncActionButton, {
			label: 'Save',
			pendingLabel: 'Saving',
			state: 'pending'
		});
		await expect
			.element(screen.getByRole('button', { name: 'Saving' }))
			.toHaveAttribute('aria-busy', 'true');

		const spinner = screen.container.querySelector('.animate-spin');
		expect(spinner).not.toBeNull();
		expect(getComputedStyle(spinner as Element).animationName).toBe('none');
	});
});
