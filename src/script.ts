import { normalizePrefix } from './config';
import type { TrackerOptions } from './types';

/** Framework-neutral, with no `node:` imports. Render once in your layout. */
export function getTrackerAttributes(options: TrackerOptions) {
	const prefix = normalizePrefix(options.pathPrefix ?? '/_tinytrack');
	return {
		src: prefix + '/tracker.js',
		defer: true,
		'data-website-id': options.websiteId ?? '',
		...(options.domain ? { 'data-domain': options.domain } : {}),
		'data-api': prefix + '/track',
		'data-skip-initial': 'false',
		...(options.allowLocalhost ? { 'data-allow-localhost': 'true' } : {}),
		...(options.nonce ? { nonce: options.nonce } : {}),
	};
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** For non-JSX templates. Use getTrackerAttributes for React/Vue/Svelte. */
export function buildScriptTag(options: TrackerOptions): string {
	if (options.enabled === false || !options.websiteId?.trim()) return '';
	const attributes = Object.entries(getTrackerAttributes(options)).map(([key, value]) =>
		value === true ? key : key + '="' + escapeAttribute(String(value)) + '"',
	);
	return '<script ' + attributes.join(' ') + '></script>';
}

export type { TrackerOptions } from './types';
