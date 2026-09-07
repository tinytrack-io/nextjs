import { API_URL, GEO_FIELDS } from './config';
import { getRequestUrl } from './request-url';
import type { Config } from './types';
import { forwardingHeaders, getVisitorContext } from './visitor';

export const MAX_BEACON_BYTES = 256 * 1024;
export const MAX_BATCH_EVENTS = 100;

export function jsonError(error: string, status: number): Response {
	return Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } });
}

export function isSameOrigin(request: Request, trustProxy = 0): boolean {
	if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
	const origin = request.headers.get('origin');
	return origin === null || origin === getRequestUrl(request, trustProxy).origin;
}

async function readBoundedBody(request: Request): Promise<string> {
	if (Number(request.headers.get('content-length')) > MAX_BEACON_BYTES) throw new RangeError('body too large');
	const reader = request.body?.getReader();
	if (!reader) return '';
	const decoder = new TextDecoder();
	let bytes = 0;
	let body = '';
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > MAX_BEACON_BYTES) {
				await reader.cancel();
				throw new RangeError('body too large');
			}
			body += decoder.decode(value, { stream: true });
		}
		return body + decoder.decode();
	} finally {
		reader.releaseLock();
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Single-browser batches only: every event inherits this request's visitor. */
export async function forwardBeacon(request: Request, cfg: Config): Promise<Response> {
	if (!isSameOrigin(request, cfg.trustProxy)) return jsonError('cross-origin tracking is not allowed', 403);
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readBoundedBody(request));
	} catch (error) {
		return error instanceof RangeError ? jsonError('event payload is too large', 413) : jsonError('invalid JSON', 400);
	}
	if (!isRecord(parsed)) return jsonError('expected an event or an events array wrapper', 400);
	const events = 'events' in parsed ? parsed.events : [parsed];
	if (!Array.isArray(events) || !events.length || !events.every(isRecord)) return jsonError('invalid events batch', 400);
	if (events.length > MAX_BATCH_EVENTS) return jsonError('too many events', 413);

	const visitor = getVisitorContext(request, cfg);
	const { ip: _ip, ...geo } = visitor;
	const enriched = events.map((event: Record<string, unknown>) => {
		const copy = { ...event };
		// The browser cannot override server-resolved geo or turn this endpoint
		// into a relay for another site. Missing geo remains absent.
		for (const key of GEO_FIELDS) delete copy[key];
		return { ...copy, ...geo, websiteId: cfg.websiteId, domain: cfg.domain };
	});

	try {
		const upstream = await fetch(API_URL, {
			method: 'POST',
			headers: forwardingHeaders(request, visitor),
			body: JSON.stringify({ events: enriched }),
			redirect: 'error',
			signal: AbortSignal.timeout(10000),
		});
		return new Response(upstream.body, {
			status: upstream.status,
			headers: {
				'content-type': upstream.headers.get('content-type') ?? 'application/json',
				'cache-control': 'no-store',
				'x-content-type-options': 'nosniff',
			},
		});
	} catch {
		return jsonError('upstream unavailable', 502);
	}
}
