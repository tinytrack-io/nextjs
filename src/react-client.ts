'use client';

import { createElement, useEffect } from 'react';
import { loadTracker } from './loader';
import { getTrackerAttributes } from './script';
import type { TinyTrackProps } from './types';

export type { TinyTrackProps } from './types';

/** Render once in pages/_app. An environment website ID must be exposed through next.config's env option. */
export function TinyTrack({
	websiteId = process.env.TINYTRACK_WEBSITE_ID ?? '',
	enabled = true,
	basePath = '',
	...options
}: TinyTrackProps = {}) {
	if (!enabled || !websiteId.trim()) return null;
	const attributes = getTrackerAttributes({ ...options, websiteId: websiteId.trim() });
	if (basePath) {
		attributes.src = basePath + attributes.src;
		attributes['data-api'] = basePath + attributes['data-api'];
	}
	return createElement(TinyTrackClient, { attributes });
}

export default function TinyTrackClient({ attributes }: { attributes: ReturnType<typeof getTrackerAttributes> }) {
	useEffect(() => loadTracker(attributes), [attributes]);
	return null;
}
