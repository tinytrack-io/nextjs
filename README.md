# @tinytrack/nextjs

[TinyTrack](https://tinytrack.io) analytics with the tracker and events served through your own domain.

Requirements:

- [tinytrack websiteId](https://docs.tinytrack.io/website-id)
- nextjs 14+

## Install

### 1. Install tinytrack package

```sh
npm install @tinytrack/nextjs
```

## 2. Add the proxy

Create `proxy.ts` at the root of `src/`:

```ts
// src/proxy.ts
import withTinyTrack from '@tinytrack/nextjs';

export const proxy = withTinyTrack({ websiteId: 'your_website_id' });

export const config = {
	matcher: ['/((?!_next/static|_next/image).*)'],
};
```

**Next.js 14+:** use `middleware.ts` at root of `src/` with a `middleware` export instead:

```ts
// src/middleware.ts
import withTinyTrack from '@tinytrack/nextjs';

export const middleware = withTinyTrack({ websiteId: 'your_website_id' });

export const config = {
	matcher: ['/((?!_next/static|_next/image).*)'],
};
```

## 3. Add the tracker

Choose your router and add the component once.

### App Router

Add the tracker inside your existing server layout's `<body>`:

```tsx
// app/layout.tsx
import type { ReactNode } from 'react';
import { TinyTrack } from '@tinytrack/nextjs/react';

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>
				{children}
				<TinyTrack websiteId="your_website_id" />
			</body>
		</html>
	);
}
```

### Pages Router

Add the tracker alongside your page component:

```tsx
// pages/_app.tsx
import type { AppProps } from 'next/app';
import { TinyTrack } from '@tinytrack/nextjs/react/client';

export default function App({ Component, pageProps }: AppProps) {
	return (
		<>
			<Component {...pageProps} />
			<TinyTrack websiteId="your_website_id" />
		</>
	);
}
```

### Optional: environment variable

Omit `websiteId` from both the middleware and tracker, and set this in `.env.local` and your hosting environment **before building**:

```dotenv
TINYTRACK_WEBSITE_ID=your_website_id
```

**Pages Router only:** also add this `env` entry to your Next.js config so the tracker can read the ID in the browser:

```js
// next.config.mjs
export default {
	env: { TINYTRACK_WEBSITE_ID: process.env.TINYTRACK_WEBSITE_ID },
};
```
