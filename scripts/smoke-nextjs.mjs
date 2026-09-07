import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = new URL('../', import.meta.url);
const records = [];
let output = '';
let origin;
let browser;
const child = spawn(
	process.execPath,
	[
		'--import',
		fileURLToPath(new URL('./mock-upstreams.mjs', import.meta.url)),
		fileURLToPath(new URL('node_modules/next/dist/bin/next', root)),
		'start',
		'--hostname',
		'127.0.0.1',
		'--port',
		'0',
	],
	{
		cwd: fileURLToPath(new URL('examples/nextjs/', root)),
		env: {
			...process.env,
			NEXT_TELEMETRY_DISABLED: '1',
			NODE_ENV: 'production',
			NO_COLOR: '1',
			TINYTRACK_WEBSITE_ID: 'wid_smoke',
			TINYTRACK_DOMAIN: 'site.example',
			TINYTRACK_ENABLED: 'true',
			TINYTRACK_SERVER_PAGEVIEWS: 'true',
			TINYTRACK_PATH_PREFIX: '/_tinytrack',
			TINYTRACK_TRUST_PROXY: '1',
			TINYTRACK_GEO_HEADERS:
				'country_iso:x-geo-country,region:x-geo-region,city_name:x-geo-city,latitude:x-geo-latitude,longitude:x-geo-longitude',
		},
		stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
	},
);
const exited = once(child, 'exit');
process.once('exit', () => child.kill('SIGTERM'));
child.stdout.on('data', (chunk) => {
	output += chunk;
});
child.stderr.on('data', (chunk) => {
	output += chunk;
});
child.on('message', (message) => {
	if (message.tinytrack) records.push(message.tinytrack);
});

// One proxy hop supplies the visitor address and location.
const proxied = {
	'x-forwarded-for': '203.0.113.42',
	'x-geo-country': 'AT',
	'x-geo-region': '9',
	'x-geo-city': 'Wien',
	'x-geo-latitude': '48.2082',
	'x-geo-longitude': '16.3738',
};

async function waitFor(predicate, message) {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (predicate()) return;
		if (child.exitCode !== null) throw new Error('The example server exited early: ' + output);
		await delay(100);
	}
	throw new Error(message + '\n' + output);
}

try {
	await waitFor(() => /Ready in/.test(output), 'The Next.js server did not become ready');
	origin = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
	assert.ok(origin, 'Next.js must report its listening address');
	const response = await fetch(origin, { headers: { ...proxied, accept: 'text/html', 'sec-fetch-dest': 'document' } });
	assert.equal(response.status, 200);
	const html = await response.text();
	assert.match(html, /TinyTrack on Next\.js/);
	assert.doesNotMatch(html, /<script[^>]+src="\/_tinytrack\/tracker\.js"/);
	await waitFor(() => records.length === 1, 'Server pageview was not forwarded');
	assert.equal(records[0].headers['x-tinytrack-ip'], '203.0.113.42');
	assert.equal(records[0].body.events[0].country_iso, 'AT');
	assert.equal(records[0].body.events[0].region, '9');
	assert.equal(records[0].body.events[0].city_name, 'Wien');
	assert.equal(records[0].body.events[0].websiteId, 'wid_smoke');
	assert.equal(records[0].body.events[0].url, origin + '/');

	// Run the production client bundles so tree shaking or missing build-time settings cannot silently disable the loader.
	const browserErrors = [];
	const virtualConsole = new VirtualConsole();
	virtualConsole.on('jsdomError', (error) => browserErrors.push(error.message));
	browser = new JSDOM(html, {
		url: origin,
		runScripts: 'dangerously',
		resources: 'usable',
		pretendToBeVisual: true,
		virtualConsole,
		beforeParse(window) {
			window.TextEncoder = TextEncoder;
			window.TextDecoder = TextDecoder;
			window.ReadableStream = ReadableStream;
			window.fetch = (input, init) => fetch(new URL(input, origin), init);
		},
	});
	await waitFor(() => browser.window.__tinytrackSmoke, 'The automatic tracker did not run: ' + browserErrors.join('\n'));
	const trackers = browser.window.document.querySelectorAll('script[src="/_tinytrack/tracker.js"]');
	assert.equal(trackers.length, 1, 'The loader must insert exactly one tracker');
	assert.equal(trackers[0].dataset.websiteId, 'wid_smoke');
	assert.equal(trackers[0].dataset.domain, 'site.example');
	assert.equal(trackers[0].dataset.api, '/_tinytrack/track');
	assert.equal(trackers[0].dataset.skipInitial, 'true');
	assert.equal(trackers[0].dataset.allowLocalhost, 'true');
	assert.deepEqual(browserErrors, [], 'The production browser bundles must execute without errors');

	const script = await fetch(origin + '/_tinytrack/tracker.js');
	assert.equal(script.status, 200);
	assert.equal(await script.text(), 'window.__tinytrackSmoke = true;');
	assert.equal((await fetch(origin + '/_tinytrack/tracker.js', { method: 'HEAD' })).status, 200);
	assert.equal((await fetch(origin + '/_tinytrack/track')).status, 405);
	assert.equal((await fetch(origin + '/_tinytrack/missing')).status, 404);
	assert.equal((await fetch(origin + '/api/health')).status, 200);
	await fetch(origin + '/about?_rsc=smoke', { headers: { ...proxied, rsc: '1', accept: 'text/x-component', 'sec-fetch-dest': 'empty' } });
	await fetch(origin + '/about', { headers: { ...proxied, accept: 'text/html', purpose: 'prefetch' } });
	await delay(200);
	assert.equal(records.length, 1, 'Non-document requests must not add server pageviews');

	const beacon = await fetch(origin + '/_tinytrack/track', {
		method: 'POST',
		headers: { ...proxied, origin, 'content-type': 'text/plain;charset=UTF-8' },
		body: JSON.stringify({ event: 'external_link', country_iso: 'US', websiteId: 'other-site' }),
	});
	assert.equal(beacon.status, 204);
	await waitFor(() => records.length === 2, 'Browser event was not forwarded');
	assert.equal(records[1].body.events[0].country_iso, 'AT');
	assert.equal(records[1].body.events[0].websiteId, 'wid_smoke');
	assert.equal(records[1].headers['x-tinytrack-ip'], records[0].headers['x-tinytrack-ip']);
	assert.equal(
		(
			await fetch(origin + '/_tinytrack/track', {
				method: 'POST',
				headers: { origin: 'https://unrelated.example' },
				body: '{"event":"x"}',
			})
		).status,
		403,
	);

	// Next.js route handlers retain their complete request bodies.
	const posted = await fetch(origin + '/api/health', { method: 'POST', headers: { ...proxied }, body: 'order=123' });
	assert.equal(posted.status, 200);
	assert.deepEqual(await posted.json(), { ok: true, body: 'order=123' });
	console.log(
		'Next.js smoke checks passed: automatic browser loader, pageviews, IP/geo forwarding, first-party routes, filtering, and browser batches.',
	);
} finally {
	browser?.window.close();
	child.kill('SIGTERM');
	const force = setTimeout(() => child.kill('SIGKILL'), 5000);
	force.unref();
	await exited;
	clearTimeout(force);
}
