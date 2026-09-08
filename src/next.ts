import type { NextConfig } from 'next';
import { getClientAttributes } from './client-settings';
import type { TinyTrackClientOptions } from './types';

const CLIENT_MODULE = '@tinytrack/nextjs/client';

/** Add the automatic browser tracker to a Next.js 16.3+ config. Settings are resolved at build time. */
export function withTinyTrack(nextConfig: NextConfig = {}, options: TinyTrackClientOptions = {}): NextConfig {
	const attributes = getClientAttributes(options, nextConfig.basePath);
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
