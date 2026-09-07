# @tinytrack/nextjs

[TinyTrack](https://tinytrack.io) analytics for Next.js based deployments.

A proxy that counts pageviews server-side, auto-injects the TinyTrack script, and serves the tracker and beacons first-party.

## Install

### 1. Install the tinytrack module
```sh
npm install @tinytrack/nextjs
```

### 2. Set `TINYTRACK_WEBSITE_ID=your_website_id` in the app's `.env`

### 3. Configure Proxy

Create `proxy.ts` alongside `app` or `pages` (inside `src` if used):

```ts
import { createTinyTrackProxy } from '@tinytrack/nextjs';

export const proxy = createTinyTrackProxy();

export const config = {
	matcher: ['/((?!_next/static|_next/image).*)'],
};
```

### 4. Browser tracker

For **Next.js 16.3+**, wrap `next.config.ts` with `withTinyTrack()`:

```ts
import type { NextConfig } from 'next';
import { withTinyTrack } from '@tinytrack/nextjs/next';

const nextConfig: NextConfig = {};

export default withTinyTrack(nextConfig);
```

This appends the client loader to [`instrumentationClientInject`](https://nextjs.org/docs/app/api-reference/config/next-config-js/instrumentationClientInject).

Also accepts `domain`, `enabled`, `allowLocalhost`, and `nonce`.

For **Next.js 16.0–16.2**, use the generated browser settings with an explicit client import:

```ts
// next.config.ts
import type { NextConfig } from 'next';
import { withTinyTrack } from '@tinytrack/nextjs/next';

const nextConfig: NextConfig = {};

export default {
	...nextConfig,
	env: withTinyTrack(nextConfig).env,
};
```

```ts
// instrumentation-client.ts — alongside app/ or inside src/
import '@tinytrack/nextjs/client';
```

## Manual installation

To render browser settings per request, add a `next/script` to your root layout instead. Set `TINYTRACK_DOMAIN` to your site's public hostname for this manual setup; the tracker requires `data-domain`:

```tsx
import Script from 'next/script';

<Script
	src="/_tinytrack/tracker.js"
	data-website-id={process.env.TINYTRACK_WEBSITE_ID}
	data-domain={process.env.TINYTRACK_DOMAIN}
	data-api="/_tinytrack/track"
	data-skip-initial="true"
	strategy="afterInteractive"
/>;
```

Install it once. `getTrackerAttributes()` from `@tinytrack/nextjs/script` builds these attributes from the same options.

## Configuration

Pass options to `createTinyTrackProxy()`, or use environment variables. Options take precedence.

| Option              | Environment variable         | Default                        |
| ------------------- | ---------------------------- | ------------------------------ |
| `websiteId` †       | `TINYTRACK_WEBSITE_ID`       | Required for analytics         |
| `domain` †          | `TINYTRACK_DOMAIN`           | Public hostname without `www.` |
| `pathPrefix` †      | `TINYTRACK_PATH_PREFIX`      | `/_tinytrack`                  |
| `serverPageviews` † | `TINYTRACK_SERVER_PAGEVIEWS` | `true`                         |
| `enabled` †         | `TINYTRACK_ENABLED`          | `true`                         |
| `trustProxy`        | `TINYTRACK_TRUST_PROXY`      | `1`                            |
| `geoHeaders`        | `TINYTRACK_GEO_HEADERS`      | None                           |
| `debug`             | `TINYTRACK_DEBUG`            | `false`                        |

† also read by `withTinyTrack()` at build time.

Browser and Proxy settings must agree on website ID, paths, and pageview mode. For browser-only pageviews, set `serverPageviews: false` and `data-skip-initial="false"`.
