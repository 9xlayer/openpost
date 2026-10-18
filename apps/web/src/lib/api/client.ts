import createClient from 'openapi-fetch';
import type { paths, components } from './types';
import { feedbackDiagnostics } from '$lib/feedback-diagnostics';
import {
	captureQueryAuthorizationIdentity,
	settleQueryUnauthorized
} from '$lib/query/authorization-boundary';
import { applyTelemetryRequestHeaders } from '@openpost/telemetry';

// Re-export schema types for convenience
export type User = components['schemas']['UserProfile'];
export type Workspace = components['schemas']['WorkspaceResponse'];
export type SocialAccount = components['schemas']['AccountResponse'];
export type ProviderInfo = components['schemas']['ProviderInfo'];
export type AuthConfiguration = components['schemas']['AuthConfigurationOutputBody'];
export type AccountDeletionImpact = components['schemas']['AccountDeletionImpact'];
export type OIDCProvider = components['schemas']['OIDCProviderSummary'];
export type PublicProfile = components['schemas']['PublicProfileOutputBody'];

export function applyAPIRequestHeaders(headers: Headers): Headers {
	applyTelemetryRequestHeaders(headers);
	return headers;
}

function createApiClient(baseUrl = '/api/v1', fetchImpl?: typeof fetch) {
	const c = createClient<paths>({
		baseUrl,
		credentials: 'include',
		...(fetchImpl ? { fetch: fetchImpl } : {})
	});
	c.use({
		async onRequest({ request }) {
			feedbackDiagnostics.recordRequestStart(request);
			applyAPIRequestHeaders(request.headers);
			return request;
		},
		async onResponse({ request, response }) {
			feedbackDiagnostics.recordResponse(request, response);
			return response;
		}
	});
	return c;
}

type APIClient = ReturnType<typeof createApiClient>;
type APIClientMethods = Pick<APIClient, 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;

// Settlement is a property of the API client: every request captures the query
// authorization identity before dispatch and settles a 401 against it, so direct
// mutations cannot leave the app on a stale authenticated shell. The boundary
// keeps the "identity captured before the request" guard, so a 401 for a
// superseded identity is a no-op.
function withQueryAuthorizationSettlement<TMethod>(invoke: TMethod): TMethod {
	return (async (...args: unknown[]) => {
		const authorizationIdentity = captureQueryAuthorizationIdentity();
		const result = await (invoke as (...args: unknown[]) => Promise<{ response: Response }>)(
			...args
		);
		if (result.response?.status === 401) settleQueryUnauthorized(authorizationIdentity);
		return result;
	}) as unknown as TMethod;
}

function settleClientMethods(raw: APIClient): APIClientMethods {
	return {
		GET: withQueryAuthorizationSettlement(raw.GET.bind(raw)),
		POST: withQueryAuthorizationSettlement(raw.POST.bind(raw)),
		PUT: withQueryAuthorizationSettlement(raw.PUT.bind(raw)),
		PATCH: withQueryAuthorizationSettlement(raw.PATCH.bind(raw)),
		DELETE: withQueryAuthorizationSettlement(raw.DELETE.bind(raw))
	};
}

const rawClient = createApiClient();

export const client: APIClientMethods = settleClientMethods(rawClient);

// Test seam with the same settling wiring and an injectable transport, so tests
// can drive a mockserved 401 through a real client method.
export function createSettlingApiClient(
	fetchImpl: typeof fetch,
	baseUrl = 'https://openpost.test/api/v1'
): APIClientMethods {
	return settleClientMethods(createApiClient(baseUrl, fetchImpl));
}
