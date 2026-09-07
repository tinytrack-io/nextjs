import { trackerCache } from './cache';
import { TRACKER_UPSTREAM_URL } from './config';
import type { BackgroundContext, TrackerCache } from './types';

const CACHE_KEY = 'tinytrack:tracker.js:v1';
const TTL = 3600;

/** One upstream fetch per process, however many requests arrive together. */
let inflight: Promise<string> | null = null;

function scriptResponse(body: string | null, status = 200): Response {
	return new Response(body, {
		status,
		headers: {
			'content-type': 'application/javascript; charset=utf-8',
			'cache-control': status === 200 ? 'public, max-age=3600' : 'no-store',
			'x-content-type-options': 'nosniff',
		},
	});
}

async function fetchTracker(): Promise<string> {
	const upstream = await fetch(TRACKER_UPSTREAM_URL, { redirect: 'error', signal: AbortSignal.timeout(10000) });
	if (!upstream.ok) {
		await upstream.body?.cancel();
		throw new Error('TinyTrack tracker.js returned HTTP ' + upstream.status);
	}
	return upstream.text();
}

export async function serveTrackerAsset(
	request: Request,
	context: BackgroundContext,
	cache: TrackerCache = trackerCache,
): Promise<Response> {
	// A cache outage must not make the tracker unavailable, and unsuccessful
	// upstream responses are never cached.
	try {
		const hit = await cache.get(CACHE_KEY);
		if (typeof hit === 'string') return scriptResponse(request.method === 'HEAD' ? null : hit);
	} catch {
		/* Fetch the public asset on a cache miss or outage. */
	}

	try {
		inflight ??= fetchTracker().finally(() => {
			inflight = null;
		});
		const body = await inflight;
		context.waitUntil(Promise.resolve(cache.set(CACHE_KEY, body, { ttl: TTL })).catch(() => {}));
		return scriptResponse(request.method === 'HEAD' ? null : body);
	} catch {
		return scriptResponse(request.method === 'HEAD' ? null : '// tracker temporarily unavailable', 502);
	}
}
