import { vi } from 'vitest';
import { NextRequest } from 'next/server.js';
import type { BackgroundContext } from '../src/types';

export const SITE = 'https://site.example';
export const VISITOR_IP = '203.0.113.42';
export const GEO_HEADERS = {
	'x-geo-country': 'AT',
	'x-geo-region': '9',
	'x-geo-city': 'Wien',
	'x-geo-latitude': '48.2082',
	'x-geo-longitude': '16.3738',
	'user-agent': 'Mozilla/5.0 TinyTrackTest',
};
export const GEO_CONFIG = {
	country_iso: 'x-geo-country',
	region: 'x-geo-region',
	city_name: 'x-geo-city',
	latitude: 'x-geo-latitude',
	longitude: 'x-geo-longitude',
};
export const OPTIONS = { websiteId: 'wid_test', domain: 'site.example', trustProxy: 1, geoHeaders: GEO_CONFIG };

/** A Next.js request with headers supplied by the deployment's trusted ingress. */
export function request(path = '/', init: RequestInit = {}, forwardedIp: string | null = VISITOR_IP) {
	return new NextRequest(SITE + path, {
		...init,
		signal: init.signal ?? undefined,
		headers: {
			...GEO_HEADERS,
			...(forwardedIp ? { 'x-forwarded-for': forwardedIp } : {}),
			...Object.fromEntries(new Headers(init.headers)),
		},
	});
}

export function documentRequest(path = '/', headers: HeadersInit = {}) {
	return request(path, { headers: { accept: 'text/html', 'sec-fetch-dest': 'document', ...Object.fromEntries(new Headers(headers)) } });
}

export function background() {
	const tasks: Promise<unknown>[] = [];
	const context: BackgroundContext = {
		waitUntil: (promise) => {
			tasks.push(promise);
		},
	};
	return { context, tasks, drain: () => Promise.all(tasks) };
}

export function mockFetch(handler: (request: Request) => Response | Promise<Response> = () => new Response(null, { status: 204 })) {
	const calls: Request[] = [];
	const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const outgoing = new Request(input, init);
		calls.push(outgoing);
		return handler(outgoing);
	});
	vi.stubGlobal('fetch', mock);
	return { calls, mock };
}

export async function events(outgoing: Request): Promise<Record<string, unknown>[]> {
	return (await outgoing.clone().json()).events;
}
