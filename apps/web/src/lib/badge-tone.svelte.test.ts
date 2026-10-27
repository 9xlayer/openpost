import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import Badge from '@openpost/ui/components/badge/badge.svelte';

function textSnippet(text: string) {
	return createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));
}

const tones = [
	{ tone: 'neutral', token: /bg-muted/ },
	{ tone: 'info', token: /bg-info/ },
	{ tone: 'success', token: /bg-success/ },
	{ tone: 'warning', token: /bg-warning/ },
	{ tone: 'destructive', token: /bg-action-destructive/ }
] as const;

describe('Badge tone', () => {
	it.each(tones)('tone $tone renders its theme token classes', async ({ tone, token }) => {
		const screen = await render(Badge, {
			tone,
			children: textSnippet(`Badge tone ${tone}`)
		});
		const badge = screen.container.querySelector<HTMLElement>('[data-slot="badge"]');

		expect(badge).not.toBeNull();
		expect(badge?.getAttribute('data-tone')).toBe(tone);
		await expect.element(badge!).toHaveClass(token);
		// Each tone keeps its own class set: no other tone's background token is present.
		for (const other of tones) {
			if (other.tone === tone) continue;
			await expect.element(badge!).not.toHaveClass(other.token);
		}
	});

	it('keeps the default muted appearance without a tone', async () => {
		const screen = await render(Badge, {
			children: textSnippet('Badge default appearance')
		});
		const badge = screen.container.querySelector<HTMLElement>('[data-slot="badge"]');

		expect(badge).not.toBeNull();
		expect(badge?.getAttribute('data-tone')).toBe('neutral');
		await expect.element(badge!).toHaveClass(/bg-muted/);
		await expect.element(badge!).not.toHaveClass(/bg-info/);
		await expect.element(badge!).not.toHaveClass(/bg-success/);
		await expect.element(badge!).not.toHaveClass(/bg-warning/);
		await expect.element(badge!).not.toHaveClass(/bg-action-destructive/);
	});
});
