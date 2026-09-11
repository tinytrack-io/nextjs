import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config';
import { buildScriptTag, getTrackerAttributes } from '../src/script';

describe('configuration and tracker installation', () => {
	it.each([
		[{}, {}, true],
		[{}, { TINYTRACK_SERVER_REQUESTS: 'false' }, false],
		[{}, { TINYTRACK_SERVER_PAGEVIEWS: 'false' }, false],
		[{}, { TINYTRACK_SERVER_REQUESTS: 'true', TINYTRACK_SERVER_PAGEVIEWS: 'false' }, true],
		[{ serverPageviews: true }, {}, true],
		[{ serverRequests: false, serverPageviews: true }, {}, false],
		[{ serverRequests: true }, { TINYTRACK_SERVER_REQUESTS: 'false' }, true],
	] as const)('resolves server observations from options %j and env %j', (options, env, expected) => {
		expect(resolveConfig(new Request('https://example.com'), options, env).serverRequests).toBe(expected);
	});
	it('preserves www in the site domain and applies options before env values', () => {
		const cfg = resolveConfig(
			new Request('https://www.example.com/'),
			{ websiteId: 'explicit', serverRequests: false },
			{
				TINYTRACK_WEBSITE_ID: 'env',
				TINYTRACK_PATH_PREFIX: 'Analytics/',
				TINYTRACK_SERVER_REQUESTS: 'true',
			},
		);
		expect(cfg).toMatchObject({
			websiteId: 'explicit',
			domain: 'www.example.com',
			prefix: '/analytics',
			scriptPath: '/analytics/tracker.js',
			trackPath: '/analytics/track',
			serverRequests: false,
		});
	});
	it.each(['https://evil.example', '//evil.example/path', '/a?b=1', '/a#b', '/a/../b', '/a\\b'])(
		'rejects nonlocal/ambiguous prefix %s',
		(pathPrefix) => {
			expect(() => resolveConfig(new Request('https://example.com'), { pathPrefix }, {})).toThrow('local path');
		},
	);
	it.each([
		[{}, undefined, 1],
		[{}, 'true', 1],
		[{}, 'false', 0],
		[{}, '3', 3],
		[{ trustProxy: true }, 'false', 1],
		[{ trustProxy: 2 }, undefined, 2],
	] as const)('resolves trusted proxy hops from %j and %s', (options, env, hops) => {
		expect(resolveConfig(new Request('https://example.com'), options, { TINYTRACK_TRUST_PROXY: env }).trustProxy).toBe(hops);
	});
	it.each(['-1', '1.5', 'yes'])('rejects the trusted proxy hop count %s', (TINYTRACK_TRUST_PROXY) => {
		expect(() => resolveConfig(new Request('https://example.com'), {}, { TINYTRACK_TRUST_PROXY })).toThrow('hop count');
	});
	it('reads geo header names from options or the environment, lowercased', () => {
		const fromEnv = resolveConfig(
			new Request('https://example.com'),
			{},
			{ TINYTRACK_GEO_HEADERS: ' country_iso:CF-IPCountry , city_name:x-geo-city ' },
		);
		expect(fromEnv.geoHeaders).toEqual({ country_iso: 'cf-ipcountry', city_name: 'x-geo-city' });
		expect(resolveConfig(new Request('https://example.com'), { geoHeaders: { region: 'X-Geo-Region' } }, {}).geoHeaders).toEqual({
			region: 'x-geo-region',
		});
		expect(resolveConfig(new Request('https://example.com'), {}, {}).geoHeaders).toEqual({});
	});
	it.each(['country', 'country_iso', 'country_iso:bad header', 'x:y'])('rejects the geo header mapping %s', (TINYTRACK_GEO_HEADERS) => {
		expect(() => resolveConfig(new Request('https://example.com'), {}, { TINYTRACK_GEO_HEADERS })).toThrow('TINYTRACK_GEO_HEADERS');
	});
	it('uses standard proxy defaults without host-specific configuration', () => {
		expect(resolveConfig(new Request('https://example.com'), {}, {})).toMatchObject({
			trustProxy: 1,
			geoHeaders: {},
			serverRequests: true,
		});
	});
	it('lets explicit options override environment settings, including disabling IP forwarding', () => {
		const env = { TINYTRACK_TRUST_PROXY: '2', TINYTRACK_GEO_HEADERS: 'country_iso:x-country' };
		expect(resolveConfig(new Request('https://example.com'), { trustProxy: false, geoHeaders: {} }, env)).toMatchObject({
			trustProxy: 0,
			geoHeaders: {},
		});
	});
	it('always enables browser initial pageviews, including legacy server options', () => {
		expect(getTrackerAttributes({ websiteId: 'wid' })['data-skip-initial']).toBe('false');
		expect(getTrackerAttributes({ websiteId: 'wid', serverPageviews: true })['data-skip-initial']).toBe('false');
		expect(getTrackerAttributes({ websiteId: 'wid', serverRequests: false })['data-skip-initial']).toBe('false');
		expect(getTrackerAttributes({ websiteId: 'wid' })).not.toHaveProperty('data-allow-localhost');
	});
	it('escapes HTML attributes including CSP nonces and emits just one script', () => {
		const tag = buildScriptTag({
			websiteId: 'a"<script>&',
			domain: 'example.com',
			nonce: 'nonce"x',
			pathPrefix: '/analytics',
			allowLocalhost: true,
		});
		expect(tag).toContain('src="/analytics/tracker.js"');
		expect(tag).toContain('data-api="/analytics/track"');
		expect(tag).toContain('data-website-id="a&quot;&lt;script&gt;&amp;"');
		expect(tag).toContain('nonce="nonce&quot;x"');
		expect(tag.match(/<script/g)).toHaveLength(1);
	});
	it('does not generate a script for a missing site or disabled integration', () => {
		expect(buildScriptTag({})).toBe('');
		expect(buildScriptTag({ websiteId: 'wid', enabled: false })).toBe('');
	});
});
