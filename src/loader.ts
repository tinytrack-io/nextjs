import type { getTrackerAttributes } from './script';

export function loadTracker(attributes: ReturnType<typeof getTrackerAttributes>) {
	const src = new URL(attributes.src, document.baseURI).href;
	// Re-imports (including development refreshes) and existing manual installations must not load a second tracker.
	if (Array.from(document.scripts).some((script) => script.src === src)) return;

	const script = document.createElement('script');
	for (const [name, value] of Object.entries(attributes)) {
		script.setAttribute(name, value === true ? '' : String(value));
	}
	// tracker.js requires data-domain; resolve the default in the browser when
	// no public hostname was supplied at build time.
	if (!attributes['data-domain']) script.setAttribute('data-domain', document.location.hostname);
	script.async = true;
	// Next.js propagates a request's CSP nonce to its own scripts. Reuse it when no explicit nonce was supplied.
	const nonce = attributes.nonce || document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
	if (nonce) script.nonce = nonce;
	document.head.appendChild(script);
}
