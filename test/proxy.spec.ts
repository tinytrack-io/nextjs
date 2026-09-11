import { NextRequest, NextResponse, type NextFetchEvent, type NextProxy } from 'next/server.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import createTinyTrackProxy, { createMemoryCache, createTinyTrackMiddleware, withTinyTrackMiddleware } from '../src/index';
import { unstable_doesMiddlewareMatch as doesProxyMatch } from 'next/experimental/testing/server.js';
import { background, documentRequest, events, mockFetch, OPTIONS, request } from './helpers';

const defaultProxy = createTinyTrackProxy();

beforeEach(() => {
	for (const key of Object.keys(process.env).filter((key) => key.startsWith('TINYTRACK_'))) vi.stubEnv(key, undefined);
});

function invocation() {
	const bg = background();
	// Next owns the event; the integration only uses its public waitUntil method.
	return { ...bg, event: bg.context as NextFetchEvent };
}

describe('Next.js Proxy integration', () => {
	it('can be exported as Next.js 14 middleware', async () => {
		const bg = invocation();
		const response = await createTinyTrackMiddleware({ enabled: false })(documentRequest(), bg.event);
		expect(response.headers.get('x-middleware-next')).toBe('1');
	});

	it('preserves existing middleware redirects, cookies, and request bodies', async () => {
		const { calls } = mockFetch();
		const bg = invocation();
		const redirect = NextResponse.redirect(new URL('/login', 'https://site.example'));
		redirect.cookies.set('session', 'existing');
		const existing = vi.fn(async (incoming: NextRequest) => {
			expect(await incoming.text()).toBe('order=123');
			return redirect;
		});
		const incoming = request('/checkout', { method: 'POST', body: 'order=123' });
		expect(await withTinyTrackMiddleware(existing, OPTIONS)(incoming, bg.event)).toBe(redirect);
		expect(existing).toHaveBeenCalledExactlyOnceWith(incoming, bg.event);
		expect(calls).toHaveLength(0);
	});

	it('serves tracking endpoints before existing middleware and observes ordinary pages', async () => {
		const { calls } = mockFetch((outgoing) =>
			new URL(outgoing.url).pathname === '/tracker.js' ? new Response('window.tracker = true;') : new Response(null, { status: 204 }),
		);
		const bg = invocation();
		const existing = vi.fn(() => NextResponse.next());
		const middleware = withTinyTrackMiddleware(existing, { ...OPTIONS, cache: createMemoryCache() });
		const script = await middleware(request('/_tinytrack/tracker.js'), bg.event);
		expect(await script?.text()).toBe('window.tracker = true;');
		const beacon = await middleware(request('/_tinytrack/track', { method: 'POST', body: '{"event":"scroll_depth"}' }), bg.event);
		expect(beacon?.status).toBe(204);
		expect(existing).not.toHaveBeenCalled();
		await middleware(documentRequest('/about'), bg.event);
		await bg.drain();
		expect(existing).toHaveBeenCalledOnce();
		expect(calls).toHaveLength(3);
		expect((await events(calls[1]))[0].event).toBe('scroll_depth');
		expect((await events(calls[2]))[0].event).toBe('server_request');
	});

	it('returns NextResponse.next while registering explicitly enabled server analytics with this invocation’s event', async () => {
		let finish!: (response: Response) => void;
		const { calls } = mockFetch(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const bg = invocation();
		const proxy = createTinyTrackProxy({ ...OPTIONS, serverRequests: true }) satisfies NextProxy;
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
	it('reads environment settings at request time in a proxy created without options', async () => {
		vi.stubEnv('TINYTRACK_WEBSITE_ID', 'wid_environment');
		vi.stubEnv('TINYTRACK_SERVER_REQUESTS', 'true');
		vi.stubEnv('TINYTRACK_TRUST_PROXY', '1');
		const { calls } = mockFetch();
		const bg = invocation();
		await defaultProxy(documentRequest('/'), bg.event);
		await bg.drain();
		expect((await events(calls[0]))[0].websiteId).toBe('wid_environment');
		expect(calls[0].headers.get('x-tinytrack-ip')).toBe('203.0.113.42');
	});
	it('omits visitor IP when forwarding headers are explicitly untrusted', async () => {
		const { calls } = mockFetch();
		const bg = invocation();
		await createTinyTrackProxy({ websiteId: 'wid_test', trustProxy: 0, serverRequests: true })(documentRequest('/'), bg.event);
		await bg.drain();
		expect(calls[0].headers.has('x-tinytrack-ip')).toBe(false);
	});
	it('forwards distinct visitors from standard headers on server observations and browser events', async () => {
		vi.stubEnv('TINYTRACK_WEBSITE_ID', 'wid_environment');
		vi.stubEnv('TINYTRACK_SERVER_REQUESTS', 'true');
		const { calls } = mockFetch();
		const bg = invocation();
		const visitors = ['203.0.113.42', '198.51.100.7'];
		for (const ip of visitors) {
			const headers = { 'x-forwarded-for': ip };
			await defaultProxy(documentRequest('/', headers), bg.event);
			await defaultProxy(
				request('/_tinytrack/track', { method: 'POST', headers, body: '{"event":"page_view","city_name":"wrong city"}' }),
				bg.event,
			);
		}
		await bg.drain();
		expect(calls).toHaveLength(4);
		for (const [index, outgoing] of calls.entries()) {
			expect(outgoing.headers.get('x-tinytrack-ip')).toBe(visitors[Math.floor(index / 2)]);
			expect(outgoing.headers.get('user-agent')).toBe('Mozilla/5.0 TinyTrackTest');
			expect(outgoing.headers.get('x-tinytrack-proxy')).toBe('nextjs');
			const [event] = await events(outgoing);
			expect(event.websiteId).toBe('wid_environment');
			for (const field of ['country_iso', 'region', 'city_name', 'latitude', 'longitude']) expect(event).not.toHaveProperty(field);
		}
	});
	it('marks forwarded events even when the visitor IP is missing', async () => {
		vi.stubEnv('TINYTRACK_WEBSITE_ID', 'wid_environment');
		vi.stubEnv('TINYTRACK_SERVER_REQUESTS', 'true');
		const { calls } = mockFetch();
		const bg = invocation();
		const incoming = documentRequest('/');
		incoming.headers.delete('x-forwarded-for');
		await defaultProxy(incoming, bg.event);
		await bg.drain();
		expect(calls[0].headers.get('x-tinytrack-proxy')).toBe('nextjs');
		expect(calls[0].headers.has('x-tinytrack-ip')).toBe(false);
	});
	it('continues RSC requests and prefetches without scheduling server observations', async () => {
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
		const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
		for (const url of ['/', '/about', '/api/orders', '/_tinytrack/tracker.js', '/_tinytrack/track']) {
			expect(doesProxyMatch({ config, nextConfig: {}, url }), url).toBe(true);
		}
		for (const url of ['/_next/static/app.js', '/_next/image?url=x']) {
			expect(doesProxyMatch({ config, nextConfig: {}, url }), url).toBe(false);
		}
	});
});
