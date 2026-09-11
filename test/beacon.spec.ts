import { describe, expect, it } from 'vitest';
import { forwardBeacon, MAX_BATCH_EVENTS, MAX_BEACON_BYTES } from '../src/beacon';
import { API_URL, resolveConfig } from '../src/config';
import { events, mockFetch, OPTIONS, request, SITE } from './helpers';

const cfg = resolveConfig(request(), OPTIONS, {});
const beacon = (body: unknown, headers: HeadersInit = {}) =>
	request('/_tinytrack/track', {
		method: 'POST',
		body: JSON.stringify(body),
		headers,
	});

describe('first-party beacons', () => {
	it.each([{ event: 'server_request' }, { events: [{ event: 'page_view' }, { event: 'server_request' }] }])(
		'rejects browser attempts to submit reserved server observations: %j',
		async (body) => {
			const { calls } = mockFetch();
			expect((await forwardBeacon(beacon(body), cfg)).status).toBe(400);
			expect(calls).toHaveLength(0);
		},
	);
	it('normalizes single events and forwards the existing TinyTrack contract', async () => {
		const { calls } = mockFetch();
		const response = await forwardBeacon(
			beacon(
				{ event: 'external_link', properties: { href: 'https://example.com' } },
				{
					cookie: 'private=value',
					authorization: 'Bearer private',
					origin: SITE,
					'x-tinytrack-ip': '198.51.100.1',
				},
			),
			cfg,
		);
		expect(response.status).toBe(204);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(calls[0].url).toBe(API_URL);
		expect(calls[0].redirect).toBe('error');
		expect(calls[0].headers.get('x-tinytrack-ip')).toBe('203.0.113.42');
		expect(calls[0].headers.get('user-agent')).toBe('Mozilla/5.0 TinyTrackTest');
		expect(calls[0].headers.has('cookie')).toBe(false);
		expect(calls[0].headers.has('authorization')).toBe(false);
		expect(await events(calls[0])).toEqual([
			{
				event: 'external_link',
				properties: { href: 'https://example.com' },
				websiteId: 'wid_test',
				domain: 'site.example',
				country_iso: 'AT',
				region: '9',
				city_name: 'Wien',
				latitude: '48.2082',
				longitude: '16.3738',
			},
		]);
	});
	it('enriches every batched event and replaces browser-supplied geo/site identity', async () => {
		const { calls } = mockFetch();
		await forwardBeacon(
			beacon({
				events: [
					{ event: 'page_view', websiteId: 'other', domain: 'other.example', country_iso: 'US', city_name: 'New York', latitude: '0' },
					{ event: 'scroll_depth', percent: 75 },
				],
			}),
			cfg,
		);
		const batch = await events(calls[0]);
		expect(batch).toHaveLength(2);
		for (const event of batch)
			expect(event).toMatchObject({
				websiteId: 'wid_test',
				domain: 'site.example',
				country_iso: 'AT',
				city_name: 'Wien',
				latitude: '48.2082',
			});
		expect(batch[1].percent).toBe(75);
	});
	it('keeps geo absent when ingress has none, even if the browser supplies it', async () => {
		const { calls } = mockFetch();
		await forwardBeacon(
			new Request(SITE + '/_tinytrack/track', {
				method: 'POST',
				body: JSON.stringify({
					event: 'page_view',
					country_iso: 'US',
					region: 'NY',
					city_name: 'New York',
					latitude: '40',
					longitude: '-74',
				}),
			}),
			cfg,
		);
		expect(await events(calls[0])).toEqual([{ event: 'page_view', websiteId: 'wid_test', domain: 'site.example' }]);
		expect(calls[0].headers.has('x-tinytrack-ip')).toBe(false);
	});
	it.each([null, [], 1, 'string', { events: null }, { events: [] }, { events: [null] }, { events: [{ event: 'x' }, 2] }])(
		'rejects malformed shape %j without forwarding',
		async (body) => {
			const { calls } = mockFetch();
			expect((await forwardBeacon(beacon(body), cfg)).status).toBe(400);
			expect(calls).toHaveLength(0);
		},
	);
	it('rejects malformed JSON, large declared bodies, large streamed bodies and excessive batches', async () => {
		const { calls } = mockFetch();
		expect((await forwardBeacon(request('/_tinytrack/track', { method: 'POST', body: '{bad' }), cfg)).status).toBe(400);
		expect((await forwardBeacon(beacon({ event: 'x' }, { 'content-length': String(MAX_BEACON_BYTES + 1) }), cfg)).status).toBe(413);
		expect((await forwardBeacon(beacon({ event: 'x', value: 'é'.repeat(MAX_BEACON_BYTES / 2) }), cfg)).status).toBe(413);
		expect(
			(await forwardBeacon(beacon({ events: Array.from({ length: MAX_BATCH_EVENTS + 1 }, () => ({ event: 'x' })) }), cfg)).status,
		).toBe(413);
		expect(calls).toHaveLength(0);
	});
	it.each<Record<string, string>>([{ origin: 'https://evil.example' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }])(
		'rejects cross-origin browser submission %j',
		async (headers) => {
			const { calls } = mockFetch();
			expect((await forwardBeacon(beacon({ event: 'x' }, headers), cfg)).status).toBe(403);
			expect(calls).toHaveLength(0);
		},
	);
	it('preserves API errors but does not forward upstream cookies or cache policy', async () => {
		mockFetch(
			() => new Response('{"error":"invalid event"}', { status: 422, headers: { 'set-cookie': 'private=x', 'cache-control': 'public' } }),
		);
		const response = await forwardBeacon(beacon({ event: 'x' }), cfg);
		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({ error: 'invalid event' });
		expect(response.headers.has('set-cookie')).toBe(false);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
	it('returns an uncached 502 on network/timeout failures', async () => {
		mockFetch(() => {
			throw new Error('network down');
		});
		const response = await forwardBeacon(beacon({ event: 'x' }), cfg);
		expect(response.status).toBe(502);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});
