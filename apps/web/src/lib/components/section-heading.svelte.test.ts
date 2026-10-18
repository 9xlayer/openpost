import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import SectionHeading from './section-heading.svelte';

function textSnippet(text: string) {
	return createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));
}

describe('SectionHeading', () => {
	it('renders the requested level with the default section size', async () => {
		const screen = await render(SectionHeading, {
			level: 2,
			children: textSnippet('Audience')
		});

		const heading = screen.getByRole('heading', { name: 'Audience' });
		await expect.element(heading).toBeVisible();
		expect(heading.element().tagName).toBe('H2');
		await expect.element(heading).toHaveClass(/text-base/);
		await expect.element(heading).toHaveClass(/font-semibold/);
	});

	it('renders an h3 when asked without flattening the hierarchy', async () => {
		const screen = await render(SectionHeading, {
			level: 3,
			children: textSnippet('Workspace templates')
		});

		const heading = screen.getByRole('heading', { name: 'Workspace templates' });
		expect(heading.element().tagName).toBe('H3');
		await expect.element(heading).toHaveClass(/text-base/);
	});

	it('forwards id so section aria-labelledby wiring keeps working', async () => {
		const screen = await render(SectionHeading, {
			level: 2,
			size: 'section',
			id: 'workspace-templates-heading',
			children: textSnippet('Workspace templates')
		});

		await expect
			.element(screen.getByRole('heading', { name: 'Workspace templates' }))
			.toHaveAttribute('id', 'workspace-templates-heading');
	});

	it('renders the compact uppercase size for dense editor panels', async () => {
		const screen = await render(SectionHeading, {
			level: 2,
			size: 'compact',
			children: textSnippet('Ideas')
		});

		const heading = screen.getByRole('heading', { name: 'Ideas' });
		expect(heading.element().tagName).toBe('H2');
		await expect.element(heading).toHaveClass(/text-xs/);
		await expect.element(heading).toHaveClass(/uppercase/);
		await expect.element(heading).toHaveClass(/tracking-wider/);
		await expect.element(heading).not.toHaveClass(/text-base/);
	});
});
