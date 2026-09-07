import { NextRequest, NextResponse, type NextFetchEvent, type NextProxy } from 'next/server.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import createTinyTrackProxy, { createMemoryCache } from '../src/index';
import { proxy as exampleProxy, config } from '../examples/nextjs/proxy';
import { unstable_doesMiddlewareMatch as doesProxyMatch } from 'next/experimental/testing/server.js';
import { background, documentRequest, events, mockFetch, OPTIONS, request } from './helpers';

vi.mock('@tinytrack/nextjs', () => import('../src/index'));

beforeEach(() => {
	for (const key of Object.keys(process.env).filter((key) => key.startsWith('TINYTRACK_'))) vi.stubEnv(key, undefined);
});

function invocation() {
	const bg = background();
	// Next owns the event; the integration only uses its public waitUntil method.
	return { ...bg, event: bg.context as NextFetchEvent };
}

describe('Next.js Proxy integration', () => {
	it('returns NextResponse.next while registering analytics with this invocation’s event', async () => {
		let finish!: (response: Response) => void;
		const { calls } = mockFetch(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const bg = invocation();
		const proxy = createTinyTrackProxy(OPTIONS) satisfies NextProxy;
		const response = await proxy(documentRequest('/pricing'), bg.event);
		expect(response).toBeInstanceOf(NextResponse);
		expect(response.headers.get('x-middleware-next')).toBe('1');
		expect(bg.tasks).toHaveLength(1);
		expect((await events(calls[0]))[0]).toMatchObject({ websiteId: 'wid_test', url: 'https://site.example/pricing' });
		finish(new Response(null, { status: 204 }));
		await bg.drain();
	});
	it('leaves route handler and server action bodies untouched', async () => {
		const { calls } = mockFetch();
		const bg = invocation();
		const proxy = createTinyTrackProxy(OPTIONS);
		for (const path of ['/api/orders', '/checkout']) {
			const incoming = request(path, { method: 'POST', headers: { 'next-action': 'action-id' }, body: 'order=123' });
			expect((await proxy(incoming, bg.event)).headers.get('x-middleware-next')).toBe('1');
			expect(await incoming.text()).toBe('order=123');
		}
		expect(calls).toHaveLength(0);
	});
	it('serves its own tracker and browser events without continuing Next routing', async () => {
		const { calls } = mockFetch((outgoing) =>
			new URL(outgoing.url).pathname === '/tracker.js' ? new Response('window.tracker = true;') : new Response(null, { status: 204 }),
		);
		const bg = invocation();
		const proxy = createTinyTrackProxy({ ...OPTIONS, cache: createMemoryCache() });
		const script = await proxy(request('/_tinytrack/tracker.js'), bg.event);
		expect(script.headers.has('x-middleware-next')).toBe(false);
		expect(await script.text()).toBe('window.tracker = true;');
		const beacon = await proxy(
			request('/_tinytrack/track', { method: 'POST', body: '{"event":"page_view","websiteId":"other"}' }),
			bg.event,
		);
		expect(beacon.status).toBe(204);
		expect(beacon.headers.has('x-middleware-next')).toBe(false);
		expect((await events(calls[1]))[0].websiteId).toBe('wid_test');
		await bg.drain();
	});
	it('uses request-time environment settings in the exported example proxy', async () => {
		vi.stubEnv('TINYTRACK_WEBSITE_ID', 'wid_environment');
		vi.stubEnv('TINYTRACK_TRUST_PROXY', '1');
		const { calls } = mockFetch();
		const bg = invocation();
		await exampleProxy(documentRequest('/'), bg.event);
		await bg.drain();
		expect((await events(calls[0]))[0].websiteId).toBe('wid_environment');
		expect(calls[0].headers.get('x-tinytrack-ip')).toBe('203.0.113.42');
	});
	it('omits visitor IP unless forwarding headers are explicitly trusted', async () => {
		const { calls } = mockFetch();
		const bg = invocation();
		await createTinyTrackProxy({ websiteId: 'wid_test' })(documentRequest('/'), bg.event);
		await bg.drain();
		expect(calls[0].headers.has('x-tinytrack-ip')).toBe(false);
	});
	it('continues RSC requests and prefetches without scheduling server pageviews', async () => {
		const { calls } = mockFetch();
		const bg = invocation();
		const proxy = createTinyTrackProxy(OPTIONS);
		for (const input of [
			documentRequest('/about?_rsc=x'),
			documentRequest('/about', { rsc: '1' }),
			documentRequest('/about', { 'next-router-prefetch': '1' }),
		]) {
			expect((await proxy(input, bg.event)).headers.get('x-middleware-next')).toBe('1');
		}
		expect(calls).toHaveLength(0);
		expect(bg.tasks).toHaveLength(0);
	});
	it('uses the Next.js pathname for endpoints and exclusions under a basePath', async () => {
		const { calls } = mockFetch();
		const bg = invocation();
		const proxy = createTinyTrackProxy({ ...OPTIONS, enabled: false });
		const input = new NextRequest('https://site.example/docs/_tinytrack/track/', {
			method: 'POST',
			body: '{}',
			nextConfig: { basePath: '/docs' },
		});
		expect((await proxy(input, bg.event)).status).toBe(204);
		const api = new NextRequest('https://site.example/docs/api/orders', {
			headers: { accept: 'text/html', 'sec-fetch-dest': 'document' },
			nextConfig: { basePath: '/docs' },
		});
		expect((await createTinyTrackProxy(OPTIONS)(api, bg.event)).headers.get('x-middleware-next')).toBe('1');
		expect(calls).toHaveLength(0);
	});
	it('keeps app routing active when analytics is disabled', async () => {
		const { calls } = mockFetch();
		const bg = invocation();
		expect((await createTinyTrackProxy({ enabled: false })(documentRequest('/'), bg.event)).headers.get('x-middleware-next')).toBe('1');
		expect(calls).toHaveLength(0);
	});
	it('uses a static matcher that includes first-party tracking and excludes Next assets', () => {
		for (const url of ['/', '/about', '/api/orders', '/_tinytrack/tracker.js', '/_tinytrack/track']) {
			expect(doesProxyMatch({ config, nextConfig: {}, url }), url).toBe(true);
		}
		for (const url of ['/_next/static/app.js', '/_next/image?url=x']) {
			expect(doesProxyMatch({ config, nextConfig: {}, url }), url).toBe(false);
		}
	});
});
