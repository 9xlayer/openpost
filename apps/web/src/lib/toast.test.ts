import { beforeEach, expect, it, vi } from 'vitest';

// Unit tests assert the sonner store directly, so they observe through the
// real module contract instead of the app wrapper.
// oxlint-disable-next-line anti-slop/no-module-mocking
vi.mock('svelte-sonner', () => {
	const callable = vi.fn();
	Object.assign(callable, {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warning: vi.fn(),
		dismiss: vi.fn()
	});
	return { toast: callable };
});

import { toast } from 'svelte-sonner';
import { dismissToast, showToast } from './toast';

const callable = vi.mocked(toast);
const success = vi.mocked(toast.success);
const error = vi.mocked(toast.error);
const info = vi.mocked(toast.info);
const warning = vi.mocked(toast.warning);
const dismiss = vi.mocked(toast.dismiss);

beforeEach(() => {
	callable.mockClear();
	callable.mockReturnValue('neutral-id');
	for (const variant of [success, error, info, warning]) {
		variant.mockClear();
		variant.mockReturnValue('variant-id');
	}
	dismiss.mockClear();
});

it('maps each tone to exactly one sonner variant', () => {
	success.mockReturnValue('success-id');
	error.mockReturnValue('error-id');
	info.mockReturnValue('info-id');
	warning.mockReturnValue('warning-id');
	expect(showToast('ok', 'success')).toBe('success-id');
	expect(success).toHaveBeenCalledWith('ok', {});
	expect(showToast('bad', 'error')).toBe('error-id');
	expect(error).toHaveBeenCalledWith('bad', {});
	expect(showToast('note', 'info')).toBe('info-id');
	expect(info).toHaveBeenCalledWith('note', {});
	expect(showToast('careful', 'warning')).toBe('warning-id');
	expect(warning).toHaveBeenCalledWith('careful', {});
	expect(showToast('plain', 'neutral')).toBe('neutral-id');
	expect(showToast('default')).toBe('neutral-id');
	expect(callable).toHaveBeenCalledWith('plain', {});
	expect(callable).toHaveBeenCalledWith('default', {});
	expect(success).toHaveBeenCalledTimes(1);
	expect(error).toHaveBeenCalledTimes(1);
	expect(info).toHaveBeenCalledTimes(1);
	expect(warning).toHaveBeenCalledTimes(1);
	expect(callable).toHaveBeenCalledTimes(2);
});

it('passes duration and id through to sonner', () => {
	showToast('exporting', 'success', { duration: 8000, id: 'export-progress' });
	expect(success).toHaveBeenCalledWith('exporting', {
		duration: 8000,
		id: 'export-progress'
	});
	expect(callable).not.toHaveBeenCalled();
});

it('keeps default sonner timing when duration is omitted', () => {
	showToast('saved', 'success');
	expect(success).toHaveBeenCalledWith('saved', {});
	expect(showToast('failed', 'error')).toBe('variant-id');
	expect(error).toHaveBeenCalledWith('failed', {});
});

it('maps the action shorthand to a sonner action', () => {
	const onAction = vi.fn();
	showToast('removed', 'neutral', { actionLabel: 'Undo', onAction });
	expect(callable).toHaveBeenCalledWith('removed', {
		action: { label: 'Undo', onClick: onAction }
	});
});

it('omits the sonner action without both an action label and handler', () => {
	showToast('removed', 'neutral', { actionLabel: 'Undo' });
	expect(callable).toHaveBeenCalledWith('removed', {});
});

it('passes position through to sonner', () => {
	showToast('failed', 'error', { position: 'top-right' });
	expect(error).toHaveBeenCalledWith('failed', { position: 'top-right' });
});

it('dismisses by id through the shared owner', () => {
	dismissToast('export-progress');
	expect(dismiss).toHaveBeenCalledWith('export-progress');
	dismissToast();
	expect(dismiss).toHaveBeenCalledWith(undefined);
});
