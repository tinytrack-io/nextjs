import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TinyTrack } from '../src/react';
import { TinyTrack as BrowserTinyTrack } from '../src/react-client';
import { resolveConfig } from '../src/config';

beforeEach(() => {
	for (const key of Object.keys(process.env).filter((key) => key.startsWith('TINYTRACK_'))) vi.stubEnv(key, undefined);
});

describe('Pages Router component', () => {
	it('shares the website ID with middleware and App Router when exposed through Next config', () => {
		vi.stubEnv('TINYTRACK_WEBSITE_ID', ' wid_env ');
		const browser = BrowserTinyTrack()?.props.attributes;
		expect(browser?.['data-website-id']).toBe('wid_env');
		expect(TinyTrack()?.props.attributes).toEqual(browser);
		expect(resolveConfig(new Request('https://site.example')).websiteId).toBe('wid_env');
	});

	it('uses explicit browser settings without depending on server-only environment values', () => {
		vi.stubEnv('TINYTRACK_WEBSITE_ID', 'wid_env');
		vi.stubEnv('TINYTRACK_PATH_PREFIX', '/server-only');
		vi.stubEnv('TINYTRACK_SERVER_PAGEVIEWS', 'true');
		expect(BrowserTinyTrack()?.props.attributes).toMatchObject({
			src: '/_tinytrack/tracker.js',
			'data-website-id': 'wid_env',
			'data-skip-initial': 'false',
		});
		expect(
			BrowserTinyTrack({ websiteId: 'explicit', basePath: '/docs', pathPrefix: '/stats', serverPageviews: false })?.props.attributes,
		).toMatchObject({
			src: '/docs/stats/tracker.js',
			'data-api': '/docs/stats/track',
			'data-website-id': 'explicit',
			'data-skip-initial': 'false',
		});
	});

	it('stays inactive without a website ID or when explicitly disabled', () => {
		expect(BrowserTinyTrack()).toBeNull();
		vi.stubEnv('TINYTRACK_WEBSITE_ID', 'wid_env');
		expect(BrowserTinyTrack({ enabled: false })).toBeNull();
	});

	it('prefers an explicit server option over the environment', () => {
		const request = new Request('https://site.example');
		const env = { TINYTRACK_WEBSITE_ID: 'wid_env' };
		expect(resolveConfig(request, { websiteId: 'explicit' }, env).websiteId).toBe('explicit');
		expect(resolveConfig(request, {}, env).websiteId).toBe('wid_env');
	});
});

describe('App Router component', () => {
	it('only passes public attributes to the browser and needs just a website ID', () => {
		vi.stubEnv('TINYTRACK_WEBSITE_ID', ' wid_env ');
		vi.stubEnv('TINYTRACK_TRUST_PROXY', '2');
		vi.stubEnv('TINYTRACK_GEO_HEADERS', 'country_iso:private-header');
		expect(TinyTrack()?.props).toEqual({
			attributes: {
				src: '/_tinytrack/tracker.js',
				defer: true,
				'data-website-id': 'wid_env',
				'data-api': '/_tinytrack/track',
				'data-skip-initial': 'false',
			},
		});
	});

	it('honors shared configuration and explicit component overrides', () => {
		vi.stubEnv('TINYTRACK_WEBSITE_ID', 'wid_env');
		vi.stubEnv('TINYTRACK_DOMAIN', 'site.example');
		vi.stubEnv('TINYTRACK_SERVER_PAGEVIEWS', 'false');
		vi.stubEnv('TINYTRACK_PATH_PREFIX', '/stats');
		expect(
			TinyTrack({ basePath: '/docs', websiteId: 'wid_override', allowLocalhost: true, nonce: 'request-nonce' })?.props.attributes,
		).toEqual({
			src: '/docs/stats/tracker.js',
			defer: true,
			'data-website-id': 'wid_override',
			'data-domain': 'site.example',
			'data-api': '/docs/stats/track',
			'data-skip-initial': 'false',
			'data-allow-localhost': 'true',
			nonce: 'request-nonce',
		});
	});

	it('renders nothing without a website ID or when disabled', () => {
		expect(TinyTrack()).toBeNull();
		vi.stubEnv('TINYTRACK_WEBSITE_ID', 'wid_env');
		expect(TinyTrack({ enabled: false })).toBeNull();
		vi.stubEnv('TINYTRACK_ENABLED', 'false');
		expect(TinyTrack()).toBeNull();
	});
});
