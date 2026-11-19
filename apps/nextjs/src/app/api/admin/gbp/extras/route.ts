import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { gbpAdmin, readLocation, target } from '@/lib/gbpAdmin';
import { attributesOf, everything, get, serviceTypesOf } from '@/lib/gbpExtras';
import { postproxy, gbpPath } from '@/lib/postproxy';
import { attributePatch, attributeProblem, buildServices, linkProblem, readServices, serviceProblem, type AttrValue, type ServiceWant } from '@stakeout/core/gbpExtras';

export const maxDuration = 60;

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
