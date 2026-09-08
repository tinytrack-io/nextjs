import { createElement } from 'react';
import { getClientAttributes } from './client-settings';
import TinyTrackClient from './react-client.js';
import type { TinyTrackProps } from './types';

export type { TinyTrackProps } from './types';

/** Render once in the App Router's server layout. Reads TINYTRACK_* on the server. */
export function TinyTrack({ basePath, ...options }: TinyTrackProps = {}) {
	const attributes = getClientAttributes(options, basePath);
	return attributes ? createElement(TinyTrackClient, { attributes }) : null;
}
