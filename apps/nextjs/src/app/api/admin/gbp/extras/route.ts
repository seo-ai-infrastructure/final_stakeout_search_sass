import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { gbpAdmin, readLocation, target } from '@/lib/gbpAdmin';
import { postproxy, gbpPath } from '@/lib/postproxy';
import {
  attributePatch, attributeProblem, buildServices, linkProblem, readAttributes, readLinks, readServices, serviceProblem,
  type AttrValue, type ServiceWant,
} from '@stakeout/core/gbpExtras';
import type { GbpLocation } from '@stakeout/core/gbp';

export const maxDuration = 60;

type T = { profile: string; location: string };
const said = (e: unknown) => (e instanceof Error ? e.message : 'Not available.');
const get = <R,>(t: T, what: string, query: Record<string, string | undefined> = {}) => postproxy<R>(gbpPath(t.profile, what), { query: { location_id: t.location, ...query } });

/** Every attribute the listing may set (Google pages them), and what is set now. */
async function attributesOf(t: T) {
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
async function serviceTypesOf(t: T, loc: GbpLocation) {
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

async function everything(t: T) {
  const loc = await readLocation(t.profile, t.location);
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

/**
 * GET /api/admin/gbp/extras?profile=&location= (admins only): the listing's attributes, services
 * and action links as Google has them now. Each part is read on its own, so one Google refuses
 * (a category with no services, say) does not hide the others.
 */
export async function GET(req: Request) {
  try {
    await gbpAdmin();
    const q = new URL(req.url).searchParams;
    return NextResponse.json(await everything(target(q.get('profile'), q.get('location'))));
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/admin/gbp/extras (admins only) { profile, location, kind, … }. Each edit is built on
 * what Google has at this moment, never on what the browser last saw, and sends the smallest request.
 *   kind "attributes"  { want: { "attributes/…": true | false | null | [values] } }
 *   kind "services"    { want: [{ key?, name?, typeId?, description }] }  (the whole list, in order)
 *   kind "link-add"    { uri, type, preferred }
 *   kind "link-update" { name, uri, preferred }
 *   kind "link-delete" { name }
 * Answers with what changed and the listing's extras as they are afterwards.
 */
export async function POST(req: Request) {
  try {
    await gbpAdmin();
    const b = (await req.json()) as Record<string, unknown>;
    const t = target(b.profile, b.location);
    let changed: string[] = [];

    if (b.kind === 'attributes') {
      const want = (b.want && typeof b.want === 'object' ? b.want : {}) as Record<string, AttrValue>;
      const attrs = await attributesOf(t);
      const problem = attributeProblem(attrs, want);
      if (problem) throw new InputError(problem);
      const patch = attributePatch(attrs, want);
      if (!patch) throw new InputError('Nothing to change: the listing already has these values.');
      await postproxy(gbpPath(t.profile, 'update_attributes'), { method: 'PATCH', body: { location_id: t.location, attributes: patch.attributes, attribute_mask: patch.attribute_mask } });
      changed = patch.changed.map((c) => `${c.label}: ${c.from} → ${c.to}`);
    } else if (b.kind === 'services') {
      const want = (Array.isArray(b.want) ? b.want : []).map((w) => {
        const x = (w && typeof w === 'object' ? w : {}) as Record<string, unknown>;
        const s = (k: string) => (typeof x[k] === 'string' ? (x[k] as string) : undefined);
        return { key: s('key'), name: s('name'), typeId: s('typeId'), description: s('description') ?? '' } as ServiceWant;
      });
      const problem = serviceProblem(want);
      if (problem) throw new InputError(problem);
      const [loc, live] = await Promise.all([readLocation(t.profile, t.location), get<{ serviceItems?: unknown[] }>(t, 'service_list')]);
      if (loc.metadata?.canModifyServiceList !== true) throw new InputError('Google does not let this listing’s services be edited (its category has no service list).', 409);
      const category = loc.categories?.primaryCategory?.name;
      if (!category) throw new InputError('This listing has no primary category to file a service under.', 409);
      // A structured service must be one Google offers for the listing's categories.
      const offered = new Set((await serviceTypesOf(t, loc)).map((x) => x.typeId));
      const have = new Set(readServices(live.serviceItems ?? []).map((s) => s.key));
      const stray = want.find((w) => w.typeId && !have.has('s:' + w.typeId) && !offered.has(w.typeId));
      if (stray) throw new InputError('“' + (stray.name ?? stray.typeId) + '” is not a service Google offers for this listing’s categories.');
      const built = buildServices(live.serviceItems ?? [], want, category);
      if (!built.changed.length) throw new InputError('Nothing to change: the listing already has these services.');
      await postproxy(gbpPath(t.profile, 'update_service_list'), { method: 'PATCH', body: { location_id: t.location, serviceItems: built.serviceItems } });
      changed = built.changed;
    } else if (b.kind === 'link-add') {
      const types = await get<{ placeActionTypeMetadata?: { placeActionType?: string }[] }>(t, 'available_place_action_types', { language_code: 'en' }).then((r) => (r.placeActionTypeMetadata ?? []).map((x) => String(x.placeActionType ?? ''))).catch(() => []);
      const problem = linkProblem(b.uri, b.type, types);
      if (problem) throw new InputError(problem);
      await postproxy(gbpPath(t.profile, 'create_place_action_link'), { method: 'POST', body: { location_id: t.location, uri: String(b.uri).trim(), place_action_type: b.type, is_preferred: b.preferred === true } });
      changed = ['Link added'];
    } else if (b.kind === 'link-update' || b.kind === 'link-delete') {
      // The link must be one of this listing's own.
      const name = String(b.name ?? '');
      if (!new RegExp('^locations/' + t.location.split('/')[3] + '/placeActionLinks/[A-Za-z0-9_-]+$').test(name)) throw new InputError('Unknown link.');
      if (b.kind === 'link-delete') {
        await postproxy(gbpPath(t.profile, 'delete_place_action_link'), { method: 'DELETE', query: { location_id: t.location, name } });
        changed = ['Link removed'];
      } else {
        const problem = linkProblem(b.uri, 'APPOINTMENT', []);
        if (problem) throw new InputError(problem);
        await postproxy(gbpPath(t.profile, 'update_place_action_link'), { method: 'PATCH', body: { location_id: t.location, name, fields: ['uri', 'isPreferred'], uri: String(b.uri).trim(), is_preferred: b.preferred === true } });
        changed = ['Link changed'];
      }
    } else throw new InputError('Unknown edit.');

    return NextResponse.json({ changed, ...(await everything(t)) });
  } catch (e) {
    return errorResponse(e);
  }
}
