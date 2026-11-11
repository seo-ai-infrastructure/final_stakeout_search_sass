// Free preview scans are closed: this endpoint spent real phone time and proxy bandwidth for
// anyone with an email address. It answers "gone" and starts nothing.
export async function POST() {
  return Response.json({ error: 'Free previews are closed.' }, { status: 410 });
}
