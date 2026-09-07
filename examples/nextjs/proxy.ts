import { createTinyTrackProxy } from '@tinytrack/nextjs';

export const proxy = createTinyTrackProxy();

export const config = {
	matcher: ['/((?!_next/static|_next/image).*)'],
};
