import type { Config, Env, GeoField, GeoHeaderMap, TinyTrackOptions } from './types';
import { getRequestUrl } from './request-url';

export const API_URL = 'https://tinytrack.io/api/track';
export const TRACKER_UPSTREAM_URL = 'https://tinytrack.io/tracker.js';
export const GEO_FIELDS: readonly GeoField[] = ['country_iso', 'region', 'city_name', 'latitude', 'longitude'];

export function normalizePrefix(value: string): string {
	let prefix = value.trim().replace(/\/+$/, '');
	if (!prefix) return '/_tinytrack';
	if (!prefix.startsWith('/')) prefix = '/' + prefix;
	// These paths are a local namespace, never a URL or a query string.
	if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/.test(prefix)) {
		throw new Error('TINYTRACK_PATH_PREFIX must be a local path such as /_tinytrack or /analytics/tinytrack');
	}
	return prefix.toLowerCase();
}

/** Number of trusted rightmost forwarding hops in the incoming headers. */
export function resolveTrustProxy(option: boolean | number | undefined, value: string | undefined): number {
	if (typeof option === 'boolean') return option ? 1 : 0;
	if (typeof option === 'number') {
		if (!Number.isInteger(option) || option < 0) throw new Error('trustProxy must be a non-negative integer or a boolean');
		return option;
	}
	const raw = value?.trim().toLowerCase();
	if (!raw) return 1;
	if (raw === 'false') return 0;
	if (raw === 'true') return 1;
	const hops = Number(raw);
	if (!Number.isInteger(hops) || hops < 0) throw new Error('TINYTRACK_TRUST_PROXY must be true, false, or a hop count');
	return hops;
}

/** `country_iso:cf-ipcountry,city_name:x-geo-city`. Unknown fields are rejected. */
export function parseGeoHeaders(value: string | undefined): GeoHeaderMap {
	const map: GeoHeaderMap = {};
	for (const entry of (value ?? '').split(',')) {
		const pair = entry.trim();
		if (!pair) continue;
		const separator = pair.indexOf(':');
		const field = pair.slice(0, separator).trim() as GeoField;
		const header = pair.slice(separator + 1).trim();
		if (separator < 0 || !GEO_FIELDS.includes(field) || !/^[a-zA-Z0-9!#$%&'*+.^_`|~-]+$/.test(header)) {
			throw new Error('TINYTRACK_GEO_HEADERS entries must be <' + GEO_FIELDS.join('|') + '>:<header-name>');
		}
		map[field] = header.toLowerCase();
	}
	return map;
}

function geoHeaderMap(option: GeoHeaderMap | undefined, value: string | undefined): GeoHeaderMap {
	if (!option) return parseGeoHeaders(value);
	const map: GeoHeaderMap = {};
	for (const field of GEO_FIELDS) {
		const header = option[field]?.trim();
		if (header) map[field] = header.toLowerCase();
	}
	return map;
}

export function resolveConfig(request: Request, options: TinyTrackOptions = {}, env: Env = process.env as Env): Config {
	const prefix = normalizePrefix(options.pathPrefix ?? env.TINYTRACK_PATH_PREFIX ?? '/_tinytrack');
	const trustProxy = resolveTrustProxy(options.trustProxy, env.TINYTRACK_TRUST_PROXY);
	return {
		websiteId: (options.websiteId ?? env.TINYTRACK_WEBSITE_ID ?? '').trim(),
		domain: (options.domain ?? env.TINYTRACK_DOMAIN ?? getRequestUrl(request, trustProxy).hostname.replace(/^www\./, '')).trim(),
		prefix,
		scriptPath: prefix + '/tracker.js',
		trackPath: prefix + '/track',
		serverPageviews: options.serverPageviews ?? env.TINYTRACK_SERVER_PAGEVIEWS !== 'false',
		enabled: options.enabled ?? env.TINYTRACK_ENABLED !== 'false',
		debug: options.debug ?? env.TINYTRACK_DEBUG === 'true',
		trustProxy,
		geoHeaders: geoHeaderMap(options.geoHeaders, env.TINYTRACK_GEO_HEADERS),
	};
}
