import { afterEach, expect, it } from 'vitest';
import { blankImageEditorDocument } from './document';
import {
	listGuestImageEditorDesigns,
	openImageEditorDatabase,
	type LocalImageEditorDesign
} from './local-persistence';

async function replaceDesigns(records: LocalImageEditorDesign[]): Promise<void> {
	const db = await openImageEditorDatabase();
	try {
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction('guest-designs', 'readwrite');
			const store = transaction.objectStore('guest-designs');
			store.clear();
			for (const record of records) store.put(record);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
	} finally {
		db.close();
	}
}

afterEach(() => replaceDesigns([]));

it('lists recent local designs with stable timestamp ties and load-more ordering', async () => {
	const document = blankImageEditorDocument({
		key: 'custom',
		name: 'Custom',
		width_px: 800,
		height_px: 600,
		default_format: 'png',
		profiles: []
	});
	const records = [
		...Array.from({ length: 8 }, (_, index) => ({
			id: `new-${index}`,
			updated_at: `2026-10-${20 + index}T00:00:00.000Z`
		})),
		...['f', 'b', 'd', 'a', 'e', 'c'].map((id) => ({
			id: `tied-${id}`,
			updated_at: '2026-10-10T00:00:00.000Z'
		})),
		{ id: 'old', updated_at: '2026-01-01T00:00:00.000Z' }
	].map((record) => ({ ...record, revision: 1, created_at: record.updated_at, document }));
	await replaceDesigns(records);
	const latest = ['new-7', 'new-6', 'new-5', 'new-4', 'new-3', 'new-2', 'new-1', 'new-0'];
	const first = await listGuestImageEditorDesigns();
	expect(first.map((record) => record.id)).toEqual([
		...latest,
		'tied-a',
		'tied-b',
		'tied-c',
		'tied-d'
	]);
	expect(first[0].document.width_px).toBe(800);
	expect((await listGuestImageEditorDesigns(24)).map((record) => record.id)).toEqual([
		...latest,
		'tied-a',
		'tied-b',
		'tied-c',
		'tied-d',
		'tied-e',
		'tied-f',
		'old'
	]);
	expect((await listGuestImageEditorDesigns(1)).map((record) => record.id)).toEqual(['new-7']);
	expect(await listGuestImageEditorDesigns(0)).toEqual([]);
	await replaceDesigns([]);
	expect(await listGuestImageEditorDesigns()).toEqual([]);
});
