/** Only these environment variables are read by the integration. */
export interface Env {
	TINYTRACK_WEBSITE_ID?: string;
	TINYTRACK_DOMAIN?: string;
	TINYTRACK_PATH_PREFIX?: string;
	TINYTRACK_SERVER_REQUESTS?: string;
	/** @deprecated Use TINYTRACK_SERVER_REQUESTS. */
	TINYTRACK_SERVER_PAGEVIEWS?: string;
	TINYTRACK_ENABLED?: string;
	TINYTRACK_DEBUG?: string;
	TINYTRACK_TRUST_PROXY?: string;
	TINYTRACK_GEO_HEADERS?: string;
}

/** Event fields a reverse proxy or GeoIP module can supply through headers. */
export type GeoField = 'country_iso' | 'region' | 'city_name' | 'latitude' | 'longitude';
export type GeoHeaderMap = Partial<Record<GeoField, string>>;

export interface TinyTrackOptions {
	websiteId?: string;
	domain?: string;
	pathPrefix?: string;
	/** Default true. Send server_request observations for ingestion to classify as crawler/AI bot traffic. */
	serverRequests?: boolean;
	/** @deprecated Alias for serverRequests. Never counts pageviews or suppresses tracker.js. */
	serverPageviews?: boolean;
	enabled?: boolean;
	debug?: boolean;
	/**
	 * Number of trusted rightmost entries in X-Forwarded-For. `true` means one.
	 * Default 1. Set to the number of trusted ingress hops, or 0 to omit the IP.
	 * NextRequest exposes no socket address.
	 */
	trustProxy?: boolean | number;
	/** Optional custom location headers for browser events. Default none. Server observations never include geo fields. */
	geoHeaders?: GeoHeaderMap;
	/** Server-side only: storage for the tracker asset. Defaults to a per-process cache. */
	cache?: TrackerCache;
}

export interface Config {
	websiteId: string;
	domain: string;
	prefix: string;
	scriptPath: string;
	trackPath: string;
	serverRequests: boolean;
	enabled: boolean;
	debug: boolean;
	trustProxy: number;
	geoHeaders: GeoHeaderMap;
}

/**
 * Deferred work registered with NextFetchEvent.waitUntil().
 */
export interface BackgroundContext {
	waitUntil(promise: Promise<unknown>): void;
}

export interface VisitorContext {
	ip?: string;
	country_iso?: string;
	/** Whatever the configured header supplies: a subdivision code or a name. */
	region?: string;
	city_name?: string;
	latitude?: string;
	longitude?: string;
}

/** Storage for the fetched tracker asset. The default is an in-process cache. */
export interface TrackerCache {
	get(key: string): Promise<string | undefined> | string | undefined;
	set(key: string, value: string, options: { ttl: number }): Promise<unknown> | unknown;
}

export interface TrackerOptions extends TinyTrackOptions {
	/** Pass the nonce from your application's CSP when required. */
	nonce?: string;
	allowLocalhost?: boolean;
}

/** Public browser settings for withTinyTrack(); share matching options with createTinyTrackProxy(). */
export type TinyTrackClientOptions = Pick<
	TrackerOptions,
	'websiteId' | 'domain' | 'pathPrefix' | 'serverPageviews' | 'enabled' | 'nonce' | 'allowLocalhost'
>;

export type TinyTrackProps = TinyTrackClientOptions & {
	/** Match next.config's basePath when the app is deployed under a subpath. */
	basePath?: string;
};
