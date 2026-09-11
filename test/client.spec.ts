import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTinyTrack } from '../src/next';
import type { TinyTrackClientOptions } from '../src/types';

let dom: JSDOM;

beforeEach(() => {
	vi.stubEnv('TINYTRACK_WEBSITE_ID', undefined);
	dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://site.example/about' });
	vi.stubGlobal('document', dom.window.document);
	vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
	for (const key of ['TINYTRACK_DOMAIN', 'TINYTRACK_PATH_PREFIX', 'TINYTRACK_SERVER_PAGEVIEWS', 'TINYTRACK_ENABLED']) {
		vi.stubEnv(key, undefined);
	}
});

afterEach(() => dom.window.close());

async function inject(options: TinyTrackClientOptions = {}) {
	vi.stubEnv('TINYTRACK_CLIENT_CONFIG', withTinyTrack({}, { websiteId: 'wid', ...options }).env!.TINYTRACK_CLIENT_CONFIG!);
	vi.resetModules();
	await import('../src/client');
}

describe('automatic client loader', () => {
	it('inserts the configured first-party tracker with the existing tracker protocol', async () => {
		await inject({ domain: 'site.example', pathPrefix: 'Stats/', serverPageviews: false, allowLocalhost: true });
		const script = document.head.querySelector('script')!;
		expect(script.src).toBe('https://site.example/stats/tracker.js');
		expect(script.async).toBe(true);
		expect(script.defer).toBe(true);
		expect(script.dataset).toMatchObject({
			websiteId: 'wid',
			domain: 'site.example',
			api: '/stats/track',
			skipInitial: 'false',
			allowLocalhost: 'true',
		});
	});

	it('preserves www in the page hostname supplied to tracker.js when no domain is configured', async () => {
		dom.reconfigure({ url: 'https://www.site.example/about' });
		await inject();
		expect(document.scripts[0].dataset.domain).toBe('www.site.example');
	});

	it('waits for the document to be parsed and loads once across repeated initialization', async () => {
		vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
		await inject();
		await inject();
		expect(document.scripts).toHaveLength(0);
		document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
		document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
		expect(document.scripts).toHaveLength(1);
		expect(document.scripts[0].dataset.skipInitial).toBe('false');
		vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
		await inject();
		expect(document.scripts).toHaveLength(1);
	});

	it('recognizes an existing manual script by its absolute URL', async () => {
		document.head.innerHTML = '<script src="https://site.example/_tinytrack/tracker.js" data-website-id="wid"></script>';
		await inject();
		expect(document.scripts).toHaveLength(1);
	});

	it('inherits the Next.js CSP nonce, with an explicit nonce taking precedence', async () => {
		document.head.innerHTML = '<script nonce="request-nonce" src="/_next/static/app.js"></script>';
		await inject();
		expect(document.scripts[1].nonce).toBe('request-nonce');
		document.scripts[1].remove();
		await inject({ nonce: 'custom-nonce' });
		expect(document.scripts[1].nonce).toBe('custom-nonce');
	});

	it.each([{ enabled: false }, { websiteId: '' }])('does not load for inactive settings %j', async (options) => {
		await inject(options);
		expect(document.scripts).toHaveLength(0);
	});

	it('does nothing outside the browser or without injected settings', async () => {
		vi.stubGlobal('document', undefined);
		await expect(inject()).resolves.toBeUndefined();
		vi.stubGlobal('document', dom.window.document);
		vi.stubEnv('TINYTRACK_CLIENT_CONFIG', undefined);
		vi.resetModules();
		await import('../src/client');
		expect(document.scripts).toHaveLength(0);
	});
});
