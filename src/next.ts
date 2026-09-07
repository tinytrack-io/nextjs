import type { NextConfig } from 'next';
import { getTrackerAttributes } from './script';
import type { TinyTrackClientOptions } from './types';

const CLIENT_MODULE = '@tinytrack/nextjs/client';

/** Add the automatic browser tracker to a Next.js 16.3+ config. Settings are resolved at build time. */
export function withTinyTrack(nextConfig: NextConfig = {}, options: TinyTrackClientOptions = {}): NextConfig {
	const websiteId = (options.websiteId ?? process.env.TINYTRACK_WEBSITE_ID ?? '').trim();
	const enabled = options.enabled ?? process.env.TINYTRACK_ENABLED !== 'false';
	const attributes =
		enabled && websiteId
			? getTrackerAttributes({
					websiteId,
					domain: (options.domain ?? process.env.TINYTRACK_DOMAIN)?.trim(),
					pathPrefix: options.pathPrefix ?? process.env.TINYTRACK_PATH_PREFIX,
					serverPageviews: options.serverPageviews ?? process.env.TINYTRACK_SERVER_PAGEVIEWS !== 'false',
					allowLocalhost: options.allowLocalhost,
					nonce: options.nonce,
				})
			: null;
	if (attributes && nextConfig.basePath) {
		attributes.src = nextConfig.basePath + attributes.src;
		attributes['data-api'] = nextConfig.basePath + attributes['data-api'];
	}
	const modules = nextConfig.instrumentationClientInject ?? [];
	return {
		...nextConfig,
		instrumentationClientInject: modules.includes(CLIENT_MODULE) ? [...modules] : [...modules, CLIENT_MODULE],
		env: {
			...nextConfig.env,
			// Only public script attributes belong in the client bundle, never the server options or environment.
			TINYTRACK_CLIENT_CONFIG: JSON.stringify(attributes),
		},
	};
}

export type { TinyTrackClientOptions } from './types';
