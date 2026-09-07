import { describe, expect, it } from 'vitest';
import { getRequestUrl } from '../src/request-url';
import { resolveConfig } from '../src/config';
import { isSameOrigin } from '../src/beacon';

describe('public origin behind a reverse proxy', () => {
	it('preserves the public authority, protocol, path, and query', () => {
		const request = new Request('http://localhost:3000/pricing?utm_source=x', {
			headers: {
				host: 'www.site.example',
				'x-forwarded-proto': 'https',
				origin: 'https://www.site.example',
			},
		});
		expect(getRequestUrl(request, 1).href).toBe('https://www.site.example/pricing?utm_source=x');
		expect(resolveConfig(request, { trustProxy: 1 }, {}).domain).toBe('site.example');
		expect(isSameOrigin(request, 1)).toBe(true);
	});
	it('rejects an unrelated origin even if the request URL is internal', () => {
		const request = new Request('http://localhost:3000/_tinytrack/track', {
			headers: {
				host: 'site.example',
				'x-forwarded-proto': 'https',
				origin: 'https://unrelated.example',
			},
		});
		expect(isSameOrigin(request, 1)).toBe(false);
	});
	it('ignores X-Forwarded-Proto until a proxy hop is trusted', () => {
		const request = new Request('http://localhost:3000/pricing', {
			headers: { host: 'site.example', 'x-forwarded-proto': 'https', origin: 'http://site.example' },
		});
		expect(getRequestUrl(request).href).toBe('http://site.example/pricing');
		expect(isSameOrigin(request)).toBe(true);
	});
	it('supports IPv6 authorities and never consults X-Forwarded-Host', () => {
		const request = new Request('http://localhost:3000/', {
			headers: {
				host: '[::1]:8080',
				'x-forwarded-host': 'unrelated.example',
				origin: 'http://[::1]:8080',
			},
		});
		expect(getRequestUrl(request).origin).toBe('http://[::1]:8080');
		expect(isSameOrigin(request)).toBe(true);
	});
	it.each(['evil.example/path', 'user@evil.example', 'evil.example?x=1', '[invalid]'])('ignores malformed Host %s', (host) => {
		expect(getRequestUrl(new Request('https://site.example/path', { headers: { host } })).href).toBe('https://site.example/path');
	});
});
