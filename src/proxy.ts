import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server.js';
import { handleTinyTrackRequest } from './tracking';
import type { TinyTrackOptions } from './types';

/** Export as `proxy` in Next.js proxy.ts. Visitor forwarding uses standard request headers. */
export function createTinyTrackProxy(options: TinyTrackOptions = {}) {
	return async function tinyTrackProxy(request: NextRequest, event: NextFetchEvent): Promise<Response> {
		return (await handleTinyTrackRequest(request, event, options)) ?? NextResponse.next();
	};
}
