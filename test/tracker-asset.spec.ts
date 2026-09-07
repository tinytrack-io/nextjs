import { describe, expect, it, vi } from 'vitest';
import { serveTrackerAsset } from '../src/tracker-asset';
import { createMemoryCache } from '../src/cache';
import { TRACKER_UPSTREAM_URL } from '../src/config';
import type { TrackerCache } from '../src/types';
import { background, mockFetch, request } from './helpers';

function spyCache(overrides: Partial<TrackerCache> = {}) {
	const memory = createMemoryCache();
	return {
		get: vi.fn(overrides.get ?? memory.get),
		set: vi.fn(overrides.set ?? memory.set),
	} satisfies TrackerCache;
}

describe('first-party tracker asset', () => {
	it('fetches and caches successful scripts with a one-hour TTL', async () => {
		const { calls } = mockFetch(() => new Response('window.tracker = true;'));
		const cache = spyCache();
		const bg = background();
		const response = await serveTrackerAsset(request('/_tinytrack/tracker.js'), bg.context, cache);
		await bg.drain();
		expect(calls[0].url).toBe(TRACKER_UPSTREAM_URL);
		expect(await response.text()).toBe('window.tracker = true;');
		expect(response.headers.get('content-type')).toContain('application/javascript');
		expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
		expect(cache.set).toHaveBeenCalledWith(expect.any(String), 'window.tracker = true;', { ttl: 3600 });
	});
	it.each(['GET', 'HEAD'])('serves a cached %s without fetching the upstream', async (method) => {
		const cache = spyCache({ get: () => 'window.cached = true;' });
		const { calls } = mockFetch();
		const response = await serveTrackerAsset(request('/_tinytrack/tracker.js', { method }), background().context, cache);
		expect(await response.text()).toBe(method === 'HEAD' ? '' : 'window.cached = true;');
		expect(calls).toHaveLength(0);
	});
	it('serves HEAD with no body on a cache miss', async () => {
		mockFetch(() => new Response('window.tracker = true;'));
		const cache = spyCache();
		const bg = background();
		const response = await serveTrackerAsset(request('/_tinytrack/tracker.js', { method: 'HEAD' }), bg.context, cache);
		await bg.drain();
		expect(await response.text()).toBe('');
		expect(cache.set).toHaveBeenCalledOnce();
	});
	it.each([500, 'network'])('does not cache failures: %s', async (failure) => {
		mockFetch(() => {
			if (failure === 'network') throw new Error('offline');
			return new Response('bad', { status: 500 });
		});
		const cache = spyCache();
		const response = await serveTrackerAsset(request('/_tinytrack/tracker.js'), background().context, cache);
		expect(response.status).toBe(502);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(cache.set).not.toHaveBeenCalled();
	});
	it('serves the tracker despite cache read and write failures', async () => {
		const cache = spyCache({
			get: () => {
				throw new Error('cache offline');
			},
			set: () => Promise.reject(new Error('cache offline')),
		});
		mockFetch(() => new Response('window.tracker = true;'));
		const bg = background();
		const response = await serveTrackerAsset(request('/_tinytrack/tracker.js'), bg.context, cache);
		await expect(bg.drain()).resolves.toBeDefined();
		expect(response.status).toBe(200);
	});
	it('reuses one upstream fetch for concurrent requests and honors the TTL', async () => {
		const { calls } = mockFetch(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			return new Response('window.tracker = true;');
		});
		const cache = createMemoryCache();
		const bg = background();
		const responses = await Promise.all([
			serveTrackerAsset(request('/_tinytrack/tracker.js'), bg.context, cache),
			serveTrackerAsset(request('/_tinytrack/tracker.js'), bg.context, cache),
		]);
		await bg.drain();
		expect(calls).toHaveLength(1);
		expect(await responses[1].text()).toBe('window.tracker = true;');
		expect(await cache.get('tinytrack:tracker.js:v1')).toBe('window.tracker = true;');
	});
});
