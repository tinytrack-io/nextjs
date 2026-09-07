import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withTinyTrack } from '../src/next';
import { resolveConfig } from '../src/config';

beforeEach(() => {
	for (const key of [
		'TINYTRACK_WEBSITE_ID',
		'TINYTRACK_DOMAIN',
		'TINYTRACK_PATH_PREFIX',
		'TINYTRACK_SERVER_PAGEVIEWS',
		'TINYTRACK_ENABLED',
	])
		vi.stubEnv(key, undefined);
});

function attributes(config: ReturnType<typeof withTinyTrack>) {
	return JSON.parse(config.env!.TINYTRACK_CLIENT_CONFIG!);
}

describe('Next.js config wrapper', () => {
	it('preserves app settings and other instrumentation without mutating the input or registering twice', () => {
		const input = {
			reactStrictMode: true,
			env: { PUBLIC_VALUE: 'keep' },
			instrumentationClientInject: ['other-analytics/client'],
		};
		const config = withTinyTrack(input, { websiteId: 'wid' });
		expect(config).toMatchObject({
			reactStrictMode: true,
			env: { PUBLIC_VALUE: 'keep' },
			instrumentationClientInject: ['other-analytics/client', '@tinytrack/nextjs/client'],
		});
		expect(input.env).toEqual({ PUBLIC_VALUE: 'keep' });
		expect(input.instrumentationClientInject).toEqual(['other-analytics/client']);
		expect(withTinyTrack(config, { websiteId: 'wid' })).toEqual(config);
	});

	it('uses the same environment configuration as Proxy for paths and initial pageviews', () => {
		vi.stubEnv('TINYTRACK_WEBSITE_ID', ' wid_env ');
		vi.stubEnv('TINYTRACK_DOMAIN', ' site.example ');
		vi.stubEnv('TINYTRACK_PATH_PREFIX', 'Analytics/');
		vi.stubEnv('TINYTRACK_SERVER_PAGEVIEWS', 'false');
		const server = resolveConfig(new Request('https://site.example'));
		expect(attributes(withTinyTrack())).toEqual({
			src: server.scriptPath,
			defer: true,
			'data-api': server.trackPath,
			'data-website-id': server.websiteId,
			'data-domain': server.domain,
			'data-skip-initial': String(server.serverPageviews),
		});
	});

	it('lets explicit options override the environment, including false and empty values', () => {
		vi.stubEnv('TINYTRACK_WEBSITE_ID', 'env');
		vi.stubEnv('TINYTRACK_DOMAIN', 'env.example');
		vi.stubEnv('TINYTRACK_PATH_PREFIX', '/env');
		vi.stubEnv('TINYTRACK_ENABLED', 'false');
		const config = withTinyTrack(
			{},
			{
				websiteId: 'explicit',
				domain: '',
				pathPrefix: '/events',
				enabled: true,
				serverPageviews: false,
				allowLocalhost: true,
				nonce: 'explicit-nonce',
			},
		);
		expect(attributes(config)).toEqual({
			src: '/events/tracker.js',
			defer: true,
			'data-api': '/events/track',
			'data-website-id': 'explicit',
			'data-skip-initial': 'false',
			'data-allow-localhost': 'true',
			nonce: 'explicit-nonce',
		});
	});

	it('suppresses the initial browser pageview by default and lets the tracker infer the domain', () => {
		const client = attributes(withTinyTrack({}, { websiteId: 'wid' }));
		expect(client['data-skip-initial']).toBe('true');
		expect(client).not.toHaveProperty('data-domain');
	});

	it.each([{}, { websiteId: ' ' }, { websiteId: 'wid', enabled: false }])('disables loading for %j', (options) => {
		expect(attributes(withTinyTrack({}, options))).toBeNull();
	});

	it('honors the environment kill switch even when the website ID is supplied explicitly', () => {
		vi.stubEnv('TINYTRACK_ENABLED', 'false');
		expect(attributes(withTinyTrack({}, { websiteId: 'wid' }))).toBeNull();
	});

	it('prefixes browser URLs with the Next.js basePath', () => {
		expect(attributes(withTinyTrack({ basePath: '/docs' }, { websiteId: 'wid', pathPrefix: '/stats' }))).toMatchObject({
			src: '/docs/stats/tracker.js',
			'data-api': '/docs/stats/track',
		});
	});

	it('serializes only public attributes even when shared options contain server settings', () => {
		vi.stubEnv('TINYTRACK_GEO_HEADERS', 'country_iso:private-geo-header');
		vi.stubEnv('DATABASE_PASSWORD', 'secret-password');
		const options = { websiteId: 'wid', trustProxy: 2, cache: { get: () => 'private-cache', set: () => {} } };
		const config = withTinyTrack({}, options);
		expect(config.env).toEqual({
			TINYTRACK_CLIENT_CONFIG: JSON.stringify({
				src: '/_tinytrack/tracker.js',
				defer: true,
				'data-website-id': 'wid',
				'data-api': '/_tinytrack/track',
				'data-skip-initial': 'true',
			}),
		});
	});
});
