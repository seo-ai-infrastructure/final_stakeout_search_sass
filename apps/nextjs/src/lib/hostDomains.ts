/**
 * Tells the host (Vercel) to serve a customer's domain, when an API token is configured
 * (VERCEL_API_TOKEN and VERCEL_PROJECT_ID, with VERCEL_TEAM_ID for a team project). Without one,
 * the domain is added by hand in the Vercel project's Domains settings.
 */
export async function addDomainToHost(domain: string): Promise<{ added: boolean; note: string }> {
  const token = process.env.VERCEL_API_TOKEN, project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project) return { added: false, note: 'Add this domain to the Vercel project (Settings → Domains) so it is served with a certificate.' };
  try {
    const team = process.env.VERCEL_TEAM_ID ? '?teamId=' + encodeURIComponent(process.env.VERCEL_TEAM_ID) : '';
    const r = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(project)}/domains${team}`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: domain }),
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok || r.status === 409) return { added: true, note: 'The domain is added to the Vercel project.' };
    return { added: false, note: `Vercel did not accept the domain (${r.status}). Add it by hand in the project's Domains settings.` };
  } catch {
    return { added: false, note: 'Vercel could not be reached. Add the domain by hand in the project\'s Domains settings.' };
  }
}
