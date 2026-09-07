import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTinyTrackHandler, handleTinyTrackRequest } from '../src/tracking';
import { API_URL } from '../src/config';
import { background, documentRequest, events, mockFetch, OPTIONS, request } from './helpers';

beforeEach(() => {
	for (const key of [
		'TINYTRACK_WEBSITE_ID',
		'TINYTRACK_DOMAIN',
		'TINYTRACK_PATH_PREFIX',
		'TINYTRACK_SERVER_PAGEVIEWS',
		'TINYTRACK_ENABLED',
		'TINYTRACK_DEBUG',
		'TINYTRACK_TRUST_PROXY',
		'TINYTRACK_GEO_HEADERS',
	])
		vi.stubEnv(key, undefined);
});

describe('request handler', () => {
	it('returns null immediately while one pageview is delivered in the background', async () => {
		let finish!: (response: Response) => void;
		const { calls } = mockFetch(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const bg = background();
		const response = await createTinyTrackHandler(OPTIONS)(
			documentRequest('/pricing', {
				referer: 'https://ref.example/',
				'accept-language': 'de-AT,de;q=0.9',
			}),
			bg.context,
		);
		expect(response).toBeNull();
		expect(bg.tasks).toHaveLength(1);
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe(API_URL);
		expect(calls[0].headers.get('x-tinytrack-ip')).toBe('203.0.113.42');
		expect(await events(calls[0])).toEqual([
			{
				domain: 'site.example',
				websiteId: 'wid_test',
				event: 'page_view',
				name: 'page_view',
				url: 'https://site.example/pricing',
				referrer: 'https://ref.example/',
				languages: 'de-AT',
				country_iso: 'AT',
				region: '9',
				city_name: 'Wien',
				latitude: '48.2082',
				longitude: '16.3738',
			},
		]);
		finish(new Response(null, { status: 204 }));
		await bg.drain();
	});
	it('returns null for composition without touching application request bodies', async () => {
		const { calls } = mockFetch();
		const bg = background();
		const post = request('/checkout', { method: 'POST', body: 'order=123' });
		expect(await handleTinyTrackRequest(post, bg.context, OPTIONS)).toBeNull();
		expect(await post.text()).toBe('order=123');
		expect(calls).toHaveLength(0);
	});
	it('reads configuration from the environment', async () => {
		vi.stubEnv('TINYTRACK_WEBSITE_ID', 'wid_environment');
		vi.stubEnv('TINYTRACK_GEO_HEADERS', 'country_iso:x-geo-country');
		const { calls } = mockFetch();
		const bg = background();
		await handleTinyTrackRequest(documentRequest(), bg.context);
		await bg.drain();
		const [event] = await events(calls[0]);
		expect(event.websiteId).toBe('wid_environment');
		expect(event.country_iso).toBe('AT');
		expect(event.city_name).toBeUndefined();
	});
	it.each([{}, { ...OPTIONS, enabled: false }, { ...OPTIONS, serverPageviews: false }])(
		'does not schedule pageviews for inactive config %j',
		async (options) => {
			const { calls } = mockFetch();
			const bg = background();
			expect(await createTinyTrackHandler(options)(documentRequest(), bg.context)).toBeNull();
			expect(bg.tasks).toHaveLength(0);
			expect(calls).toHaveLength(0);
		},
	);
	it('does not count static, prefetch, or framework data traffic', async () => {
		const { calls } = mockFetch();
		const bg = background();
		const handler = createTinyTrackHandler(OPTIONS);
		for (const input of [
			documentRequest('/app.js'),
			documentRequest('/about', { rsc: '1' }),
			documentRequest('/about', { 'next-router-prefetch': '1' }),
		]) {
			expect(await handler(input, bg.context)).toBeNull();
		}
		expect(calls).toHaveLength(0);
	});
	it.each([503, 'network'])('contains background ingestion failure %s', async (failure) => {
		mockFetch(() => {
			if (failure === 'network') throw new Error('network down');
			return new Response('unavailable', { status: 503 });
		});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const bg = background();
		expect(await createTinyTrackHandler(OPTIONS)(documentRequest(), bg.context)).toBeNull();
		await expect(bg.drain()).resolves.toBeDefined();
		expect(error).toHaveBeenCalledOnce();
	});
	it('handles browser batches without adding a server pageview', async () => {
		const { calls } = mockFetch();
		const bg = background();
		const response = await createTinyTrackHandler(OPTIONS)(
			request('/_tinytrack/track', { method: 'POST', body: '{"event":"page_view"}' }),
			bg.context,
		);
		expect(response?.status).toBe(204);
		expect(calls).toHaveLength(1);
		expect(bg.tasks).toHaveLength(0);
	});
	it.each([
		['POST', '/_tinytrack/tracker.js', 405, 'GET, HEAD'],
		['GET', '/_tinytrack/track', 405, 'POST, OPTIONS'],
		['OPTIONS', '/_tinytrack/track', 204, null],
		['GET', '/_tinytrack/unknown', 404, null],
		['GET', '/_tinytrack', 404, null],
	] as const)('guards %s %s', async (method, path, status, allow) => {
		const { calls } = mockFetch();
		const bg = background();
		const response = await createTinyTrackHandler(OPTIONS)(request(path, { method }), bg.context);
		expect(response?.status).toBe(status);
		expect(response?.headers.get('allow')).toBe(allow);
		expect(response?.headers.get('cache-control')).toBe('no-store');
		expect(calls).toHaveLength(0);
	});
	it('supports a custom prefix and discards disabled beacons', async () => {
		const { calls } = mockFetch();
		const bg = background();
		const handler = createTinyTrackHandler({ ...OPTIONS, pathPrefix: 'Analytics/', enabled: false });
		const beacon = await handler(request('/analytics/track', { method: 'POST', body: '{"event":"x"}' }), bg.context);
		expect(beacon?.status).toBe(204);
		const script = await handler(request('/analytics/tracker.js'), bg.context);
		expect(await script?.text()).toBe('');
		expect(script?.headers.get('cache-control')).toBe('no-store');
		expect(calls).toHaveLength(0);
	});
});
