import type { NextRequest } from 'next/server.js';
import { forwardBeacon, isSameOrigin, jsonError } from './beacon';
import { resolveConfig } from './config';
import { trackPageview } from './pageview';
import { shouldTrackRequest } from './request-filter';
import { serveTrackerAsset } from './tracker-asset';
import type { BackgroundContext, TinyTrackOptions } from './types';

function methodNotAllowed(allow: string): Response {
	return new Response('Method not allowed', { status: 405, headers: { allow, 'cache-control': 'no-store' } });
}

/**
 * Handles the tracking endpoints and schedules pageviews. Returns null for
 * application routes, which continue through NextResponse.next().
 */
export async function handleTinyTrackRequest(
	request: NextRequest,
	context: BackgroundContext,
	options: TinyTrackOptions = {},
): Promise<Response | null> {
	const cfg = resolveConfig(request, options);
	const pathname = request.nextUrl.pathname.toLowerCase().replace(/\/$/, '') || '/';
	const active = cfg.enabled && Boolean(cfg.websiteId);
	if (pathname === cfg.scriptPath) {
		if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET, HEAD');
		if (!active) return new Response(null, { headers: { 'content-type': 'application/javascript', 'cache-control': 'no-store' } });
		return serveTrackerAsset(request, context, options.cache);
	}
	if (pathname === cfg.trackPath) {
		if (!isSameOrigin(request, cfg.trustProxy)) return jsonError('cross-origin tracking is not allowed', 403);
		if (request.method !== 'POST' && request.method !== 'OPTIONS') return methodNotAllowed('POST, OPTIONS');
		if (request.method === 'OPTIONS' || !active) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
		return forwardBeacon(request, cfg);
	}
	if (pathname === cfg.prefix || pathname.startsWith(cfg.prefix + '/')) return jsonError('not found', 404);
	if (active && cfg.serverPageviews && shouldTrackRequest(request, cfg.prefix)) {
		if (cfg.debug) console.log('[TinyTrack:debug] scheduling pageview');
		context.waitUntil(
			trackPageview(request, cfg).catch((error: unknown) => {
				// No IPs, request headers, query strings, or event payloads are logged.
				console.error('[TinyTrack] pageview failed:', error instanceof Error ? error.message : 'unknown error');
			}),
		);
	}
	return null;
}

/**
 * A configured tracking handler used by Next.js Proxy.
 */
export function createTinyTrackHandler(options: TinyTrackOptions = {}) {
	return function tinyTrackHandler(request: NextRequest, context: BackgroundContext): Promise<Response | null> {
		return handleTinyTrackRequest(request, context, options);
	};
}
