import { API_URL } from './config';
import { getRequestUrl } from './request-url';
import type { Config } from './types';
import { forwardingHeaders, getVisitorContext } from './visitor';

export async function trackPageview(request: Request, cfg: Config): Promise<void> {
	const visitor = getVisitorContext(request, cfg);
	const { ip: _ip, ...geo } = visitor;
	const response = await fetch(API_URL, {
		method: 'POST',
		headers: forwardingHeaders(request, visitor),
		body: JSON.stringify({
			events: [
				{
					domain: cfg.domain,
					websiteId: cfg.websiteId,
					event: 'page_view',
					name: 'page_view',
					url: getRequestUrl(request, cfg.trustProxy).href,
					referrer: request.headers.get('referer') ?? '',
					languages: (request.headers.get('accept-language') ?? '').split(',')[0].trim(),
					...geo,
				},
			],
		}),
		redirect: 'error',
		signal: AbortSignal.timeout(5000),
	});
	// No response data is needed; release the connection without retaining it.
	await response.body?.cancel();
	if (!response.ok) throw new Error('TinyTrack ingestion returned HTTP ' + response.status);
}
