/**
 * Runs the search step with the account's own DuoPlus RPA template (SEARCH_MODE=rpa).
 *
 * DuoPlus automation API (help.duoplus.net/docs/api-reference):
 *   automation/userTemplateList, userTemplateInfo   find the template and its variables
 *   automation/addTask                              run it on one phone (returns no id)
 *   automation/taskList                             one shared list of the newest tasks (every running
 *                                                   search reads its own status from it); by name as a fallback
 *   automation/updateTaskTime                       reschedule (server clock correction)
 *   automation/taskLogList                          per-step errors when a run fails
 *   automation/setTaskStatus                        status 5 = cancel
 * Task times are "YYYY-MM-DD HH:mm" on DuoPlus's own clock (no zone), so the worker
 * learns that clock's offset from the first task's created_at.
 */
import { duoplusPost } from '@stakeout/core/redis';
import { asTaskRow, createTaskWatcher, type TaskRow, type TaskWatch } from '@stakeout/core/taskWatcher';
import {
  buildTaskConfig,
  extractTemplateVars,
  formatServerTime,
  learnServerOffset,
  pickKeywordKey,
  pickTemplate,
  type RpaSurface,
  type TemplateVar,
} from '@stakeout/core/rpaRules';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let serverOffsetMin = Number(process.env.DUOPLUS_TZ_OFFSET_MINUTES ?? 480); // DuoPlus default: UTC+8
let offsetLearned = false;

type Template = { id: string; name: string; vars: TemplateVar[]; keywordKey: string | null };
const templateCache = new Map<RpaSurface, Template>();
/** Forgets the templates read from DuoPlus, so the next search reads them again (after an import). */
export const clearTemplateCache = () => templateCache.clear();

async function listUserTemplates(): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await duoplusPost('/api/v1/automation/userTemplateList', { page, pagesize: 100 });
    const list: any[] = res?.data?.list ?? [];
    out.push(...list.map((t) => ({ id: String(t.id), name: String(t.name ?? '') })));
    if (list.length < 100) break;
  }
  return out;
}

async function templateVars(id: string): Promise<TemplateVar[]> {
  const res = await duoplusPost('/api/v1/automation/userTemplateInfo', { id });
  const vars = extractTemplateVars(res?.data);
  if (!vars.length)
    console.warn('[rpa] template', id, 'returned no variables; response fields:', Object.keys(res?.data ?? {}).join(', ').slice(0, 200));
  return vars;
}

/** The template for a surface (env id, else by name), with the variable that takes the keyword. */
export async function rpaTemplate(surface: RpaSurface): Promise<Template> {
  const cached = templateCache.get(surface);
  if (cached) return cached;
  const all = await listUserTemplates();
  const envId = process.env['DUOPLUS_RPA_TEMPLATE_' + surface.toUpperCase()]?.trim();
  const chosen = pickTemplate(all, surface, envId);
  if (!chosen) throw new Error('RPA_TEMPLATE_NOT_FOUND ' + surface + ' (templates: ' + all.map((t) => t.name).join(', ').slice(0, 160) + ')');
  const vars = await templateVars(chosen.id);
  const keywordKey = process.env.DUOPLUS_RPA_KEYWORD_KEY?.trim() || pickKeywordKey(vars);
  const t = { ...chosen, vars, keywordKey };
  templateCache.set(surface, t);
  return t;
}

/** Logged at startup so the template and its keyword variable can be confirmed. */
export async function describeRpaTemplates() {
  for (const surface of ['chrome', 'maps', 'google'] as RpaSurface[]) {
    try {
      const t = await rpaTemplate(surface);
      console.log(
        `[rpa] ${surface}: template "${t.name}" (${t.id}) · keyword variable: ${t.keywordKey ?? 'NONE FOUND'} · variables: ` +
          t.vars.map((v) => v.key + ':' + v.type + (v.required ? '*' : '')).join(', '),
      );
    } catch (e) {
      console.warn(`[rpa] ${surface}:`, e instanceof Error ? e.message : e);
    }
  }
}

async function findTask(name: string): Promise<TaskRow | null> {
  const now = Date.now();
  const res = await duoplusPost('/api/v1/automation/taskList', {
    name,
    issue_at_start: formatServerTime(now - 2 * 86400000, serverOffsetMin, true),
    issue_at_end: formatServerTime(now + 2 * 86400000, serverOffsetMin, true),
    sort_by: 'created_at',
    order: 'desc',
    page: 1,
    pagesize: 10,
  });
  const list: any[] = res?.data?.list ?? [];
  const row = list.find((t) => String(t.name) === name);
  return row ? asTaskRow(row) : null;
}

// ---------------------------------------------------------------------------
// One task-list request for the whole fleet
// ---------------------------------------------------------------------------
/**
 * DuoPlus allows about one API request a second for the whole account. Asking about each running
 * search's task separately (one request per phone every 4 s) queued every other request (proxy
 * changes, starting templates, phone checks) behind those questions once more than a few phones
 * ran at once. Now one request lists the newest tasks every few seconds and each waiting search
 * reads its own task from it; the template's own "done" file is read over ADB, which costs no
 * API request at all.
 */
let listWarnedAt = 0;
const tasks = createTaskWatcher({
  pollMs: Math.max(2000, Number(process.env.DUOPLUS_TASK_POLL_MS ?? 5000)),
  list: async () => {
    const now = Date.now();
    const res = await duoplusPost('/api/v1/automation/taskList', {
      issue_at_start: formatServerTime(now - 2 * 86400000, serverOffsetMin, true),
      issue_at_end: formatServerTime(now + 2 * 86400000, serverOffsetMin, true),
      sort_by: 'created_at',
      order: 'desc',
      page: 1,
      pagesize: 50,
    });
    return res?.data?.list ?? [];
  },
  byName: (name) => findTask(name),
  // Each task is then asked for by name instead (slower, never wrong); said once a minute at most.
  onListError: (e) => {
    if (Date.now() - listWarnedAt < 60000) return;
    listWarnedAt = Date.now();
    console.warn('[rpa] shared task list not read, asking task by task:', (e instanceof Error ? e.message : String(e)).slice(0, 160));
  },
  afterPoll: (watching) => learnClock(watching),
});

/**
 * Learns DuoPlus's clock from the first task seen, and starts any task that was scheduled on the
 * wrong clock (it would otherwise wait hours).
 */
async function learnClock(watching: ReadonlyMap<string, TaskWatch>) {
  if (offsetLearned) return;
  const w = [...watching.values()].find((x) => x.task?.created_at);
  if (!w?.task?.created_at) return;
  const learned = learnServerOffset(w.task.created_at, Date.now());
  if (learned === null) return;
  offsetLearned = true;
  if (learned === serverOffsetMin) return;
  console.log('[rpa] DuoPlus clock is UTC' + (learned >= 0 ? '+' : '') + learned / 60 + 'h; adjusting (was ' + serverOffsetMin / 60 + 'h)');
  serverOffsetMin = learned;
  for (const x of watching.values())
    if (x.task && x.task.status === 0)
      await duoplusPost('/api/v1/automation/updateTaskTime', { id: x.task.id, issue_at: formatServerTime(Date.now(), serverOffsetMin) }).catch(() => {});
}

async function failureDetail(taskId: string) {
  const res = await duoplusPost('/api/v1/automation/taskLogList', { task_id: taskId }).catch(() => null);
  const logs: any[] = res?.data?.list ?? [];
  const bad = logs.find((l) => l?.result_info && l.result_info.result === false);
  return bad ? String(bad.result_info.action ?? '') + ': ' + String(bad.result_info.error_message ?? '') : '';
}

export async function cancelRpaTask(taskId: string) {
  await duoplusPost('/api/v1/automation/setTaskStatus', { ids: [taskId], status: 5 }).catch(() => {});
}

/**
 * Runs the template on one phone and waits for it to finish. Resolves with the task id;
 * throws RPA_TASK_FAILED / RPA_TASK_TIMEOUT (the task is cancelled on timeout).
 */
export async function runRpaSearch(opts: {
  imageId: string;
  surface: RpaSurface;
  keyword: string;
  /** Names the template's files on the phone (/sdcard/stakeout/<pinId>_*.xml, <pinId>.done). */
  pinId: string;
  /** The scan's tracked business, for the template's "business visible" screenshots. */
  businessName?: string;
  /** Per-run values for template variables (only those the template declares are sent). */
  vars?: Record<string, string>;
  name: string;
  timeoutMs: number;
  /** DuoPlus accepted the task. */
  onAdded?: () => void;
  /** DuoPlus reports the task running. */
  onStarted?: () => void;
  /** True once the template's own "done" file exists: finish without waiting for DuoPlus's status. */
  doneCheck?: () => Promise<boolean>;
  /** True when the point was stopped (the user stopped the scan): the phone's task is cancelled. */
  stopCheck?: () => Promise<boolean>;
}) {
  const t = await rpaTemplate(opts.surface);
  // DuoPlus keeps a template's name whatever is imported into it, so the template itself declares
  // its version (a variable named template_version) and every receipt records it.
  const version = t.vars.find((v) => v.key === 'template_version')?.value;
  const ran = (taskId: string | null) => ({ taskId, templateId: t.id, templateName: t.name, templateVersion: version == null || version === '' ? null : String(version) });
  if (!t.keywordKey) throw new Error('RPA_NO_KEYWORD_VARIABLE in template ' + t.name + ' (set DUOPLUS_RPA_KEYWORD_KEY)');
  await duoplusPost('/api/v1/automation/addTask', {
    template_id: t.id,
    template_type: 2,
    name: opts.name,
    remark: 'stakeout',
    images: [
      {
        image_id: opts.imageId,
        issue_at: formatServerTime(Date.now(), serverOffsetMin),
        config: buildTaskConfig(t.vars, t.keywordKey, opts.keyword, opts.pinId, opts.businessName, opts.vars),
      },
    ],
  });
  opts.onAdded?.();

  const w = tasks.watch(opts.name);
  const deadline = Date.now() + opts.timeoutMs;
  let started = false;
  try {
    while (Date.now() < deadline) {
      const task = w.task;
      if (task) {
        if (task.status === 1 && !started) {
          started = true;
          opts.onStarted?.();
        }
        if (task.status === 3) return ran(task.id);
        if (task.status === 4 || task.status === 5) {
          const why = await failureDetail(task.id);
          throw new Error('RPA_TASK_FAILED ' + (task.status === 5 ? 'cancelled' : why || 'failed').slice(0, 200));
        }
      }
      // The template writes <pin_id>.done as its last step: that is the end of the search.
      if (opts.doneCheck && (await opts.doneCheck().catch(() => false)))
        return ran(w.task?.id ?? (await findTask(opts.name).catch(() => null))?.id ?? null);
      if (opts.stopCheck && (await opts.stopCheck().catch(() => false))) {
        const t2 = w.task ?? (await findTask(opts.name).catch(() => null));
        if (t2) await cancelRpaTask(t2.id);
        throw new Error('CANCELLED: stopped by the user');
      }
      await sleep(2500);
    }
    const task = w.task ?? (await findTask(opts.name).catch(() => null));
    if (task) await cancelRpaTask(task.id);
    throw new Error('RPA_TASK_TIMEOUT ' + (task ? 'status=' + task.status : 'task not found'));
  } finally {
    tasks.unwatch(opts.name);
  }
}

/**
 * Runs the warm-up template (DUOPLUS_RPA_TEMPLATE_WARMUP) once on a phone that has just been
 * switched on, with the template's own default variables. Resolves false when no warm-up template
 * is set; throws when the run fails or does not finish in time (the task is cancelled).
 */
let warmupVars: { id: string; vars: TemplateVar[] } | null = null;
export async function runWarmup(imageId: string, timeoutMs = 180000) {
  const id = process.env.DUOPLUS_RPA_TEMPLATE_WARMUP?.trim();
  if (!id) return false;
  if (warmupVars?.id !== id) warmupVars = { id, vars: await templateVars(id) };
  const name = 'stakeout-warmup-' + imageId + '-' + Date.now().toString(36);
  const config = Object.fromEntries(warmupVars.vars.map((v) => [v.key, { key: v.key, value: v.value ?? '', type: v.type || 'string', required: v.required }]));
  await duoplusPost('/api/v1/automation/addTask', {
    template_id: id,
    template_type: 2,
    name,
    remark: 'stakeout warm-up',
    images: [{ image_id: imageId, issue_at: formatServerTime(Date.now(), serverOffsetMin), config }],
  });
  const w = tasks.watch(name);
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const task = w.task;
      if (task?.status === 3) return true;
      if (task && (task.status === 4 || task.status === 5)) throw new Error('WARMUP_FAILED ' + ((await failureDetail(task.id)) || 'status ' + task.status).slice(0, 160));
      await sleep(2500);
    }
    const task = w.task ?? (await findTask(name).catch(() => null));
    if (task) await cancelRpaTask(task.id);
    throw new Error('WARMUP_TIMEOUT');
  } finally {
    tasks.unwatch(name);
  }
}
