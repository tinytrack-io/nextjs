import type { Config, VisitorContext } from './types';

type VisitorSource = Pick<Config, 'trustProxy' | 'geoHeaders'>;

const DEFAULT_SOURCE: VisitorSource = { trustProxy: 0, geoHeaders: {} };

function header(request: Request, name: string | undefined): string | undefined {
	return name ? (request.headers.get(name)?.trim() ?? undefined) : undefined;
}

function decodedHeader(request: Request, name: string | undefined): string | undefined {
	const value = header(request, name);
	if (!value) return undefined;
	try {
		return decodeURIComponent(value) || undefined;
	} catch {
		return undefined;
	}
}

function coordinate(value: string | undefined, limit: number): string | undefined {
	if (!value) return undefined;
	const number = Number(value);
	return Number.isFinite(number) && Math.abs(number) <= limit ? String(number) : undefined;
}

/** Drop a `host:port` wrapper so `1.2.3.4:9000` and `[::1]:9000` still parse. */
function withoutPort(value: string): string {
	const bracketed = /^\[(.+)\](?::\d+)?$/.exec(value);
	if (bracketed) return bracketed[1];
	const parts = value.split(':');
	return parts.length === 2 ? parts[0] : value;
}

export function validAddress(value: string | undefined): string | undefined {
	const ip = withoutPort(value?.trim() ?? '');
	if (!ip) return undefined;
	if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
		return ip.split('.').every((part) => Number(part) <= 255) ? ip : undefined;
	}
	// A link-local zone index is meaningful only on this host, never to ingestion.
	const address = ip.split('%')[0];
	if (!/^[0-9a-f:.]+$/i.test(address) || !address.includes(':')) return undefined;
	try {
		new URL('http://[' + address + ']/');
		return address;
	} catch {
		return undefined;
	}
}

/** Read only the configured trusted hop. NextRequest has no socket address. */
export function clientAddress(request: Request, trustProxy = 0): string | undefined {
	if (trustProxy < 1) return undefined;
	const chain = (request.headers.get('x-forwarded-for') ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
	if (chain.length < trustProxy) return undefined;
	// Entries left of the trusted hops are client-controlled and unusable.
	return validAddress(chain[chain.length - trustProxy]);
}

/**
 * Call on the request as received by this server, before any outgoing fetch.
 * Location is read only from headers the deployment explicitly configures, so an
 * unconfigured deployment omits location metadata.
 */
export function getVisitorContext(request: Request, source: VisitorSource = DEFAULT_SOURCE): VisitorContext {
	const { geoHeaders } = source;
	const country = header(request, geoHeaders.country_iso)?.toUpperCase();
	return {
		ip: clientAddress(request, source.trustProxy),
		country_iso: country && /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : undefined,
		region: decodedHeader(request, geoHeaders.region),
		city_name: decodedHeader(request, geoHeaders.city_name),
		latitude: coordinate(header(request, geoHeaders.latitude), 90),
		longitude: coordinate(header(request, geoHeaders.longitude), 180),
	};
}

export function forwardingHeaders(request: Request, visitor: VisitorContext): Headers {
	const headers = new Headers({
		'content-type': 'application/json',
		'user-agent': request.headers.get('user-agent') ?? '',
		'X-TinyTrack-Proxy': 'nextjs',
	});
	if (visitor.ip) headers.set('X-TinyTrack-IP', visitor.ip);
	return headers;
}
