export function GET() {
	return Response.json({ ok: true });
}

export async function POST(request: Request) {
	return Response.json({ ok: true, body: await request.text() });
}
