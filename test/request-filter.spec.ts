import type { NextRequest } from 'next/server.js';
import { describe, expect, it } from 'vitest';
import { shouldTrackRequest } from '../src/request-filter';
import { documentRequest, request } from './helpers';

const track = (input: NextRequest) => shouldTrackRequest(input, '/_tinytrack');

describe('document request detection', () => {
	it.each([undefined, '', '*/*', 'text/html', 'application/json', 'text/html;q=0', '*/*;q=0'])(
		'observes eligible requests regardless of Accept: %s',
		(accept) => {
			expect(track(request('/article', { headers: accept === undefined ? {} : { accept } }))).toBe(true);
		},
	);
	it('tracks document navigations and crawlers accepting HTML', () => {
		expect(track(documentRequest('/pricing?utm_source=test'))).toBe(true);
		expect(track(request('/blog', { headers: { accept: 'text/html,application/xhtml+xml' } }))).toBe(true);
		expect(track(documentRequest('/blog/release-1.2'))).toBe(true);
	});
	it.each([
		'/api',
		'/api/track',
		'/_next/data/x',
		'/_next/image',
		'/_app/immutable/x',
		'/.well-known/x',
		'/robots.txt',
		'/favicon.ico',
		'/app.js',
		'/FONT.WOFF2',
		'/file.pdf',
		'/sitemap.xml',
		'/_tinytrack',
		'/_tinytrack/track',
		'/blog/__data.json',
	])('skips %s', (path) => {
		expect(track(documentRequest(path))).toBe(false);
	});
	it.each<Record<string, string>>([
		{ rsc: '1' },
		{ 'next-router-prefetch': '1' },
		{ 'next-router-segment-prefetch': '/_tree' },
		{ 'next-router-state-tree': '[]' },
		{ 'x-nextjs-data': '1' },
		{ 'x-middleware-prefetch': '1' },
		{ 'sec-purpose': 'prefetch;prerender' },
		{ purpose: 'prefetch' },
		{ 'sec-purpose': 'navigate', purpose: 'prefetch' },
	])('skips framework navigation/prefetch headers %j', (headers) => {
		expect(track(documentRequest('/about', headers))).toBe(false);
	});
	it('skips RSC query requests and non-document fetches', () => {
		expect(track(documentRequest('/about?_rsc=abc'))).toBe(false);
		expect(track(documentRequest('/about', { 'sec-fetch-dest': 'empty' }))).toBe(false);
		expect(track(documentRequest('/about', { 'sec-fetch-dest': 'iframe' }))).toBe(false);
	});
	it.each(['HEAD', 'POST', 'OPTIONS'])('does not count %s', (method) => {
		expect(track(request('/', { method, headers: { 'sec-fetch-dest': 'document' } }))).toBe(false);
	});
});
