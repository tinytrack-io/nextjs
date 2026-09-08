import { loadTracker } from './loader';
import type { getTrackerAttributes } from './script';

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
