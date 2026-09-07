import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config';
import { buildScriptTag, getTrackerAttributes } from '../src/script';

describe('configuration and tracker installation', () => {
	it('derives the site domain and applies options before env values', () => {
		const cfg = resolveConfig(
			new Request('https://www.example.com/'),
			{ websiteId: 'explicit', serverPageviews: false },
			{
				TINYTRACK_WEBSITE_ID: 'env',
				TINYTRACK_PATH_PREFIX: 'Analytics/',
				TINYTRACK_SERVER_PAGEVIEWS: 'true',
			},
		);
		expect(cfg).toMatchObject({
			websiteId: 'explicit',
			domain: 'example.com',
			prefix: '/analytics',
			scriptPath: '/analytics/tracker.js',
			trackPath: '/analytics/track',
			serverPageviews: false,
		});
	});
	it.each(['https://evil.example', '//evil.example/path', '/a?b=1', '/a#b', '/a/../b', '/a\\b'])(
		'rejects nonlocal/ambiguous prefix %s',
		(pathPrefix) => {
			expect(() => resolveConfig(new Request('https://example.com'), { pathPrefix }, {})).toThrow('local path');
		},
	);
	it.each([
		[{}, undefined, 0],
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
	it('pairs browser initial-pageview suppression with server tracking', () => {
		expect(getTrackerAttributes({ websiteId: 'wid' })['data-skip-initial']).toBe('true');
		expect(getTrackerAttributes({ websiteId: 'wid', serverPageviews: false })['data-skip-initial']).toBe('false');
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
