import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from 'next/server.js';
import { handleTinyTrackRequest } from './tracking';
import type { TinyTrackOptions } from './types';

/** Export as `proxy` in Next.js proxy.ts. Visitor forwarding uses standard request headers. */
export function createTinyTrackProxy(options: TinyTrackOptions = {}) {
	return async function tinyTrackProxy(request: NextRequest, event: NextFetchEvent): Promise<Response> {
		return (await handleTinyTrackRequest(request, event, options)) ?? NextResponse.next();
	};
}

/** Export as `middleware` in Next.js 14 middleware.ts. */
export const createTinyTrackMiddleware = createTinyTrackProxy;

/** Handle TinyTrack endpoints first, then preserve the existing middleware's response. */
export function withTinyTrackMiddleware(middleware: NextMiddleware, options: TinyTrackOptions = {}): NextMiddleware {
	return async (request, event) => (await handleTinyTrackRequest(request, event, options)) ?? middleware(request, event);
}
