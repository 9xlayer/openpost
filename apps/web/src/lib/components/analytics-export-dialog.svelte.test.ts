import { beforeEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import '../../routes/layout.css';
import { render } from 'vitest-browser-svelte';
import AnalyticsExportDialog from './analytics-export-dialog.svelte';

const get = vi.hoisted(() => vi.fn());
vi.mock('$lib/api/client', () => ({ client: { GET: get } }));

beforeEach(() => {
	get.mockReset();
	URL.createObjectURL = vi.fn(() => 'blob:analytics-export');
	URL.revokeObjectURL = vi.fn();
});

it('requests the chosen format, grouping and filters, then closes', async () => {
	get.mockResolvedValue({
		data: new Blob(['a,b']),
		response: new Response(null, {
			headers: { 'content-disposition': 'attachment; filename="export.xlsx"' }
		})
	});
	const onExported = vi.fn();
	const screen = await render(AnalyticsExportDialog, {
		open: true,
		workspaceId: 'ws-1',
		days: 90,
		accountId: 'account-1',
		accounts: [
			{ id: 'account-1', username: 'founder', platform: 'x' },
			{ id: 'account-2', username: 'studio', platform: 'x' },
			{ id: 'account-3', username: 'founder', platform: 'bluesky' }
		],
		metrics: ['likes', 'views'],
		onExported
	});

	await screen.getByRole('button', { name: 'Excel (with charts)' }).click();
	await expect
		.element(screen.getByRole('checkbox', { name: '@founder, X', exact: true }))
		.toBeChecked();
	await screen.getByRole('checkbox', { name: '@studio, X', exact: true }).click();
	await screen.getByRole('checkbox', { name: '@founder, X', exact: true }).click();
	await screen.getByLabelText('Views', { exact: true }).click();
	await screen.getByRole('button', { name: 'Download' }).click();

	await vi.waitFor(() => expect(onExported).toHaveBeenCalledOnce());
	expect(get).toHaveBeenCalledWith(
		'/analytics/export',
		expect.objectContaining({
			parseAs: 'blob',
			params: {
				query: expect.objectContaining({
					workspace_id: 'ws-1',
					days: 90,
					account_ids: 'account-2',
					format: 'xlsx',
					group_by: 'day',
					metrics: 'views'
				})
			}
		})
	);
});

it('keeps the dialog open and explains a failed export', async () => {
	get.mockResolvedValue({ error: { detail: 'nope' }, response: new Response(null) });
	const screen = await render(AnalyticsExportDialog, {
		open: true,
		workspaceId: 'ws-1',
		days: 30,
		accounts: [],
		metrics: []
	});

	await screen.getByRole('button', { name: 'Download' }).click();

	await expect.element(screen.getByText('Could not export analytics.')).toBeVisible();
	await expect.element(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
});

it.each([390, 320])('keeps long account identities inside the form at %ipx', async (width) => {
	await page.viewport(width, 680);
	try {
		const screen = await render(AnalyticsExportDialog, {
			open: true,
			workspaceId: 'ws-1',
			days: 30,
			accounts: [
				{ id: 'studio', username: 'A company with a longer account name', platform: 'linkedin' }
			],
			metrics: ['views']
		});
		const checkbox = screen
			.getByRole('checkbox', { name: 'A company with a longer account name, LinkedIn' })
			.element();
		const row = checkbox.closest('label');
		if (!row) throw new Error('Expected an account selection row');
		const form = screen.getByTestId('analytics-export-form').element().getBoundingClientRect();
		expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(form.right);
		expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
	} finally {
		await page.viewport(1280, 900);
	}
});
