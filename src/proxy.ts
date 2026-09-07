import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server.js';
import { handleTinyTrackRequest } from './tracking';
import type { TinyTrackOptions } from './types';

/** Use the returned function as the `proxy` export in your Next.js proxy.ts. */
export function createTinyTrackProxy(options: TinyTrackOptions = {}) {
	return async function tinyTrackProxy(request: NextRequest, event: NextFetchEvent): Promise<Response> {
		return (await handleTinyTrackRequest(request, event, options)) ?? NextResponse.next();
	};
}
