import type { getTrackerAttributes } from './script';

function loadTracker(attributes: ReturnType<typeof getTrackerAttributes>) {
	const src = new URL(attributes.src, document.baseURI).href;
	// Re-imports (including development refreshes) and existing manual installations must not load a second tracker.
	if (Array.from(document.scripts).some((script) => script.src === src)) return;

	const script = document.createElement('script');
	for (const [name, value] of Object.entries(attributes)) {
		script.setAttribute(name, value === true ? '' : String(value));
	}
	script.async = true;
	// Next.js propagates a request's CSP nonce to its own scripts. Reuse it when no explicit nonce was supplied.
	const nonce = attributes.nonce || document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
	if (nonce) script.nonce = nonce;
	document.head.appendChild(script);
}

// Keep this access static so Next.js replaces it with the public settings from withTinyTrack().
if (typeof document !== 'undefined' && process.env.TINYTRACK_CLIENT_CONFIG) {
	const attributes: ReturnType<typeof getTrackerAttributes> | null = JSON.parse(process.env.TINYTRACK_CLIENT_CONFIG);
	if (attributes) {
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', () => loadTracker(attributes), { once: true });
		} else {
			loadTracker(attributes);
		}
	}
}
