import { API_URL } from './config';
import { getRequestUrl } from './request-url';
import type { Config } from './types';
import { clientAddress, forwardingHeaders } from './visitor';

export async function trackServerRequest(request: Request, cfg: Config): Promise<void> {
	const ip = clientAddress(request, cfg.trustProxy);
	const response = await fetch(API_URL, {
		method: 'POST',
		headers: forwardingHeaders(request, { ip }),
		body: JSON.stringify({
			events: [
				{
					domain: cfg.domain,
					websiteId: cfg.websiteId,
					event: 'server_request',
					name: 'server_request',
					url: getRequestUrl(request, cfg.trustProxy).href,
					referrer: request.headers.get('referer') ?? '',
					languages: (request.headers.get('accept-language') ?? '').split(',')[0].trim(),
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
