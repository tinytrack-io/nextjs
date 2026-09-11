import type { NextRequest } from 'next/server.js';

const STATIC_EXTENSION =
	/\.(?:css|js|mjs|cjs|map|gif|jpe?g|png|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|wav|ogg|pdf|zip|gz|br|rar|7z|tar|json|xml|txt|webmanifest|wasm)$/i;
const SKIP_PREFIXES = ['/api', '/_next', '/_app', '/.well-known', '/cdn-cgi'];

/** Eligible page requests for bot observations; tracker.js counts visitor pageviews. */
export function shouldTrackRequest(request: NextRequest, prefix: string): boolean {
	if (request.method !== 'GET') return false;
	const url = new URL(request.url);
	const pathname = request.nextUrl.pathname.toLowerCase();
	if (STATIC_EXTENSION.test(pathname)) return false;
	if ([...SKIP_PREFIXES, prefix].some((p) => pathname === p || pathname.startsWith(p + '/'))) return false;
	if (pathname.includes('__data.json')) return false;

	// SPA navigations are counted by tracker.js; framework data fetches are not
	// documents. These headers cover Next.js, Remix, and SvelteKit navigations.
	if (request.headers.get('rsc') === '1' || url.searchParams.has('_rsc')) return false;
	if (request.headers.has('next-router-prefetch') || request.headers.has('next-router-segment-prefetch')) return false;
	if (request.headers.has('x-middleware-prefetch') || request.headers.has('x-nextjs-data')) return false;
	if (request.headers.has('next-router-state-tree') || request.headers.has('next-action')) return false;
	const purpose = [request.headers.get('sec-purpose'), request.headers.get('purpose')].join(' ');
	if (/prefetch|prerender/i.test(purpose)) return false;

	const dest = request.headers.get('sec-fetch-dest');
	// Crawlers may omit Fetch Metadata.
	return dest === null || dest === 'document';
}
