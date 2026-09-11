import { getTrackerAttributes } from './script';
import type { TinyTrackClientOptions } from './types';

/** Resolve only public browser settings on the server or at build time. */
export function getClientAttributes(options: TinyTrackClientOptions = {}, basePath = '') {
	const websiteId = (options.websiteId ?? process.env.TINYTRACK_WEBSITE_ID ?? '').trim();
	const enabled = options.enabled ?? process.env.TINYTRACK_ENABLED !== 'false';
	if (!enabled || !websiteId) return null;
	const attributes = getTrackerAttributes({
		websiteId,
		domain: (options.domain ?? process.env.TINYTRACK_DOMAIN)?.trim(),
		pathPrefix: options.pathPrefix ?? process.env.TINYTRACK_PATH_PREFIX,
		serverPageviews: options.serverPageviews ?? process.env.TINYTRACK_SERVER_PAGEVIEWS === 'true',
		allowLocalhost: options.allowLocalhost,
		nonce: options.nonce,
	});
	if (basePath) {
		attributes.src = basePath + attributes.src;
		attributes['data-api'] = basePath + attributes['data-api'];
	}
	return attributes;
}
