import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EmptyState from './empty-state.svelte';

describe('EmptyState', () => {
	it('renders the title in an h2 by default', async () => {
		const screen = render(EmptyState, {
			themeIconRole: 'search',
			title: 'No results'
		});

		const heading = screen.getByRole('heading', { name: 'No results' });
		await expect.element(heading).toBeVisible();
		expect(heading.element().tagName).toBe('H2');
	});

	it('reaches the h3 tag when headingLevel is 3', async () => {
		const screen = render(EmptyState, {
			themeIconRole: 'search',
			title: 'No stock items matched that search.',
			size: 'sm',
			headingLevel: 3
		});

		const heading = screen.getByRole('heading', {
			name: 'No stock items matched that search.'
		});
		await expect.element(heading).toBeVisible();
		expect(heading.element().tagName).toBe('H3');
	});

	it('reaches the h4 tag when headingLevel is 4', async () => {
		const screen = render(EmptyState, {
			themeIconRole: 'media',
			title: 'Upload files to build your media library.',
			size: 'sm',
			headingLevel: 4
		});

		const heading = screen.getByRole('heading', {
			name: 'Upload files to build your media library.'
		});
		await expect.element(heading).toBeVisible();
		expect(heading.element().tagName).toBe('H4');
	});
});
