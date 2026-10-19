import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSettlingApiClient } from './client';
import { registerQueryAuthorizationBoundary } from '$lib/query/authorization-boundary';

beforeEach(() => {
	// feedbackDiagnostics.recordResponse resolves request URLs against window.location.
	vi.stubGlobal('window', { location: { origin: 'https://openpost.test' } });
});

afterEach(() => {
	registerQueryAuthorizationBoundary(undefined);
	vi.unstubAllGlobals();
});

function mockserved(status: number, body: Record<string, string> = { detail: 'Session expired' }) {
	const fetchMock: typeof fetch = vi.fn(
		async () =>
			new Response(JSON.stringify(body), {
				status,
				headers: { 'Content-Type': 'application/json' }
			})
	);
	return fetchMock;
}

describe('api client authorization settlement', () => {
	it('settles a direct mutation 401 against the identity captured before the request', async () => {
		const beforeRequest = { userID: 'user-a', epoch: 4 };
		const captureIdentity = vi
			.fn()
			.mockReturnValueOnce(beforeRequest)
			.mockReturnValue({ userID: 'user-a', epoch: 5 });
		const settleUnauthorized = vi.fn();
		registerQueryAuthorizationBoundary({ captureIdentity, settleUnauthorized });

		const testClient = createSettlingApiClient(mockserved(401));
		const { response } = await testClient.POST('/prompts', {
			body: { category: 'launch', example: 'We shipped it.', text: 'Write a launch post.' }
		});

		expect(response.status).toBe(401);
		expect(captureIdentity).toHaveBeenCalled();
		expect(settleUnauthorized).toHaveBeenCalledTimes(1);
		expect(settleUnauthorized).toHaveBeenCalledWith(beforeRequest);
	});

	it('settles a direct read 401 against the identity captured before the request', async () => {
		const capturedIdentity = { userID: 'user-a', epoch: 4 };
		const settleUnauthorized = vi.fn();
		registerQueryAuthorizationBoundary({
			captureIdentity: () => capturedIdentity,
			settleUnauthorized
		});

		const testClient = createSettlingApiClient(mockserved(401));
		const { response } = await testClient.GET('/prompts/categories', {});

		expect(response.status).toBe(401);
		expect(settleUnauthorized).toHaveBeenCalledWith(capturedIdentity);
	});

	it('does not settle a successful direct mutation', async () => {
		const settleUnauthorized = vi.fn();
		registerQueryAuthorizationBoundary({
			captureIdentity: () => ({ userID: 'user-a', epoch: 4 }),
			settleUnauthorized
		});

		const testClient = createSettlingApiClient(mockserved(200, { id: 'prompt-1' }));
		const { data, response } = await testClient.POST('/prompts', {
			body: { category: 'launch', example: 'We shipped it.', text: 'Write a launch post.' }
		});

		expect(response.status).toBe(200);
		expect(data).toEqual({ id: 'prompt-1' });
		expect(settleUnauthorized).not.toHaveBeenCalled();
	});
});
