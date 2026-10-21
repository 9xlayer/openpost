import { beforeEach, expect, it, vi } from 'vitest';
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
		platforms: ['bluesky', 'x'],
		metrics: ['likes', 'views'],
		onExported
	});

	await screen.getByRole('button', { name: 'Excel (with charts)' }).click();
	await screen.getByLabelText('X', { exact: true }).click();
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
					account_id: 'account-1',
					format: 'xlsx',
					group_by: 'day',
					platforms: 'x',
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
		platforms: [],
		metrics: []
	});

	await screen.getByRole('button', { name: 'Download' }).click();

	await expect.element(screen.getByText('Could not export analytics.')).toBeVisible();
	await expect.element(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
});
