import Link from 'next/link';

export default function Home() {
	return (
		<main>
			<h1>TinyTrack on Next.js</h1>
			<Link href="/about">About</Link>
		</main>
	);
}
