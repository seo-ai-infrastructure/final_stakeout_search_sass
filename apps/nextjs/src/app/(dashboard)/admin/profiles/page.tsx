import { redirect } from 'next/navigation';

/** The page moved to /profiles, where customers reach it too. Old links (and alert emails) still land. */
export default async function Profiles({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === 'string') q.set(k, v);
  redirect('/profiles' + (q.size ? '?' + q : ''));
}
