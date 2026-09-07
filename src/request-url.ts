/**
 * Next.js can supply an internal request URL, so rebuild the public authority
 * from Host. `X-Forwarded-Proto` is honored
 * only behind a trusted proxy; `X-Forwarded-Host` is never a second source of
 * authority, because it lets a client rewrite the site identity in events.
 */
export function getRequestUrl(request: Request, trustProxy = 0): URL {
	const url = new URL(request.url);
	if (trustProxy > 0) {
		const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
		if (protocol === 'http' || protocol === 'https') url.protocol = protocol + ':';
	}
	const host = request.headers.get('host');
	if (host && /^[a-z0-9.:[\]-]+$/i.test(host)) {
		try {
			const publicOrigin = new URL(url.protocol + '//' + host);
			url.host = publicOrigin.host;
			url.port = publicOrigin.port;
		} catch {
			/* Retain the request URL if the authority is invalid. */
		}
	}
	return url;
}
