import { postproxy, gbpPath } from '@/lib/postproxy';
import { readLocation } from '@/lib/gbpAdmin';
import { readAttributes, readLinks, readServices } from '@stakeout/core/gbpExtras';
import type { GbpLocation } from '@stakeout/core/gbp';

/** Reading a listing's attributes, services and action links as Google has them now (admin routes only). */
export type T = { profile: string; location: string };
export const said = (e: unknown) => (e instanceof Error ? e.message : 'Not available.');
export const get = <R,>(t: T, what: string, query: Record<string, string | undefined> = {}) => postproxy<R>(gbpPath(t.profile, what), { query: { location_id: t.location, ...query } });

/** Every attribute the listing may set (Google pages them), and what is set now. */
export async function attributesOf(t: T) {
  const available: unknown[] = [];
  let token: string | undefined;
  for (let i = 0; i < 6; i++) {
    const r = await get<{ attributeMetadata?: unknown[]; nextPageToken?: string }>(t, 'available_attributes', { page_size: '200', page_token: token });
    available.push(...(r.attributeMetadata ?? []));
    token = r.nextPageToken;
    if (!token) break;
  }
  const now = await get<{ attributes?: unknown[] }>(t, 'attributes');
  return readAttributes(available, now.attributes ?? []);
}

/** Google's own service types for the listing's categories: names for the ones it has, and the ones it could add. */
export async function serviceTypesOf(t: T, loc: GbpLocation) {
  const cats = [loc.categories?.primaryCategory, ...(loc.categories?.additionalCategories ?? [])].filter((c): c is { name: string; displayName?: string } => Boolean(c?.name && c.displayName)).slice(0, 4);
  const region = String(loc.storefrontAddress?.regionCode ?? 'US');
  const types: { typeId: string; name: string }[] = [];
  for (const c of cats) {
    const r = await get<{ categories?: { name: string; serviceTypes?: { serviceTypeId?: string; displayName?: string }[] }[] }>(t, 'available_location_categories', { region_code: region, language_code: 'en', filter: 'displayName=' + c.displayName, view: 'FULL', page_size: '20' }).catch(() => null);
    for (const s of r?.categories?.find((x) => x.name === c.name)?.serviceTypes ?? [])
      if (s.serviceTypeId && s.displayName && !types.some((x) => x.typeId === s.serviceTypeId)) types.push({ typeId: s.serviceTypeId, name: s.displayName });
  }
  return types;
}

export async function everything(t: T, known?: GbpLocation) {
  const loc = known ?? (await readLocation(t.profile, t.location));
  const [attributes, services, links, linkTypes] = await Promise.all([
    attributesOf(t).then((list) => ({ list, problem: null as string | null })).catch((e) => ({ list: [], problem: said(e) })),
    (async () => {
      const [r, types] = await Promise.all([get<{ serviceItems?: unknown[] }>(t, 'service_list'), serviceTypesOf(t, loc)]);
      const list = readServices(r.serviceItems ?? [], Object.fromEntries(types.map((x) => [x.typeId, x.name])));
      return { list, suggested: types.filter((x) => !list.some((s) => s.key === 's:' + x.typeId)), canEdit: loc.metadata?.canModifyServiceList === true, problem: null as string | null };
    })().catch((e) => ({ list: [], suggested: [], canEdit: false, problem: said(e) })),
    get<{ placeActionLinks?: unknown[] }>(t, 'place_action_links', { page_size: '100' }).then((r) => ({ list: readLinks(r.placeActionLinks ?? []), problem: null as string | null })).catch((e) => ({ list: [], problem: said(e) })),
    get<{ placeActionTypeMetadata?: { placeActionType?: string }[] }>(t, 'available_place_action_types', { language_code: 'en' }).then((r) => (r.placeActionTypeMetadata ?? []).map((x) => String(x.placeActionType ?? '')).filter(Boolean)).catch(() => [] as string[]),
  ]);
  return { attributes, services, links: { ...links, types: linkTypes } };
}

