import { afterEach, expect, it, vi } from 'vitest';

const configure = vi.hoisted(() => vi.fn());
vi.mock('@openpost/telemetry', () => ({ configureTelemetry: configure }));

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.resetModules();
	configure.mockClear();
});

const config = {
	enabled: true,
	project_token: 'phc_fixture',
	api_host: 'https://analytics.example.test',
	environment: 'test',
	edition: 'cloud'
};

it('recovers configuration after a temporary HTTP failure without duplicate initialization', async () => {
	vi.useFakeTimers();
	const fetch = vi
		.fn()
		.mockResolvedValueOnce(new Response(null, { status: 503 }))
		.mockResolvedValue(Response.json(config));
	vi.stubGlobal('fetch', fetch);
	const { initializeAppTelemetry } = await import('./telemetry');
	const first = initializeAppTelemetry();
	const concurrent = initializeAppTelemetry();
	await vi.runAllTimersAsync();
	await Promise.all([first, concurrent]);
	expect(fetch).toHaveBeenCalledTimes(2);
	expect(configure).toHaveBeenCalledTimes(1);
	expect(configure).toHaveBeenCalledWith(
		expect.objectContaining({
			enabled: true,
			surface: 'app',
			projectToken: 'phc_fixture'
		})
	);
});

it('bounds offline attempts and recovers when the browser returns online', async () => {
	vi.useFakeTimers();
	const window = new EventTarget();
	vi.stubGlobal('window', window);
	const fetch = vi.fn().mockRejectedValue(new TypeError('Network unavailable'));
	vi.stubGlobal('fetch', fetch);
	const { initializeAppTelemetry } = await import('./telemetry');
	const initial = initializeAppTelemetry();
	await vi.runAllTimersAsync();
	await initial;
	expect(fetch).toHaveBeenCalledTimes(3);
	expect(configure).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
	fetch.mockResolvedValue(Response.json(config));
	window.dispatchEvent(new Event('online'));
	await vi.runAllTimersAsync();
	expect(fetch).toHaveBeenCalledTimes(4);
	expect(configure).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
});
