// Used only by smoke-nextjs.mjs through Node's --import flag. Never deployed.
const originalFetch = globalThis.fetch;

globalThis.fetch = async function mockTinyTrack(input, init) {
	const request = new Request(input, init);
	const url = new URL(request.url);
	if (url.origin === 'https://tinytrack.io') {
		if (url.pathname === '/api/track') {
			process.send?.({ tinytrack: { headers: Object.fromEntries(request.headers), body: await request.json() } });
			return new Response(null, { status: 204 });
		}
		if (url.pathname === '/tracker.js') return new Response('window.__tinytrackSmoke = true;');
		throw new Error('Unexpected TinyTrack upstream in smoke test: ' + url.pathname);
	}
	if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost' && url.hostname !== '[::1]') {
		throw new Error('External requests are disabled in the smoke test');
	}
	return originalFetch(input, init);
};
