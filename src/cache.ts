import type { TrackerCache } from './types';

interface Entry {
	value: string;
	expires: number;
}

/**
 * Per-process cache for the tracker asset. Each Node instance fetches the script
 * at most once per TTL; there is no shared cache tier to depend on or to fail.
 */
export function createMemoryCache(): TrackerCache {
	const entries = new Map<string, Entry>();
	return {
		get(key: string): string | undefined {
			const entry = entries.get(key);
			if (!entry) return undefined;
			if (entry.expires <= Date.now()) {
				entries.delete(key);
				return undefined;
			}
			return entry.value;
		},
		set(key: string, value: string, options: { ttl: number }): void {
			entries.set(key, { value, expires: Date.now() + options.ttl * 1000 });
		},
	};
}

export const trackerCache: TrackerCache = createMemoryCache();
