import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Fixture from './overflow-menu.fixture.svelte';
import '../../routes/layout.css';

describe('OverflowMenu trigger contract', () => {
	it('exposes the caller label as the trigger accessible name with a uniform target', async () => {
		const screen = await render(Fixture, { label: 'Post actions', onAction: vi.fn() });
		const trigger = screen.getByRole('button', { name: 'Post actions' });
		await expect.element(trigger).toBeVisible();
		// Uniform field: 44px base with the coarse-pointer 44px rule from Button size="icon".
		const className = (await trigger.element()).getAttribute('class') ?? '';
		expect(className).toContain('size-11');
		const icon = (await trigger.element()).querySelector('svg');
		if (!icon) throw new Error('Expected the overflow trigger icon');
		expect(icon.getAttribute('class') ?? '').toContain('size-4');
	});

	it('opens with the keyboard and returns focus to the trigger on Escape', async () => {
		const screen = await render(Fixture, { label: 'Post actions', onAction: vi.fn() });
		const trigger = screen.getByRole('button', { name: 'Post actions' });
		(await trigger.element()).focus();
		await userEvent.keyboard('{Enter}');
		await expect.element(screen.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(screen.getByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument();
		await expect.element(trigger).toHaveFocus();
	});

	it('returns focus to the trigger after an action', async () => {
		const onAction = vi.fn();
		const screen = await render(Fixture, { label: 'Post actions', onAction });
		await screen.getByRole('button', { name: 'Post actions' }).click();
		await screen.getByRole('menuitem', { name: 'Delete' }).click();
		expect(onAction).toHaveBeenCalledOnce();
		await expect.element(screen.getByRole('button', { name: 'Post actions' })).toHaveFocus();
	});
});
