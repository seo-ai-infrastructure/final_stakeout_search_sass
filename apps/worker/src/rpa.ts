/**
 * Runs the search step with the account's own DuoPlus RPA template (SEARCH_MODE=rpa).
 *
 * DuoPlus automation API (help.duoplus.net/docs/api-reference):
 *   automation/userTemplateList, userTemplateInfo   find the template and its variables
 *   automation/addTask                              run it on one phone (returns no id)
 *   automation/taskList                             find our task by its unique name; status
 *   automation/updateTaskTime                       reschedule (server clock correction)
 *   automation/taskLogList                          per-step errors when a run fails
 *   automation/setTaskStatus                        status 5 = cancel
 * Task times are "YYYY-MM-DD HH:mm" on DuoPlus's own clock (no zone), so the worker
 * learns that clock's offset from the first task's created_at.
 */
import { duoplusPost } from '@stakeout/core/redis';
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

type TaskRow = { id: string; status: number; created_at?: string; issue_at?: string; start_at?: string; finish_at?: string };

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
  return row ? { ...row, id: String(row.id), status: Number(row.status) } : null;
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
  name: string;
  timeoutMs: number;
  onStarted?: () => void;
  /** True once the template's own "done" file exists: finish without waiting for DuoPlus's status. */
  doneCheck?: () => Promise<boolean>;
}) {
  const t = await rpaTemplate(opts.surface);
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
        config: buildTaskConfig(t.vars, t.keywordKey, opts.keyword, opts.pinId, opts.businessName),
      },
    ],
  });

  const deadline = Date.now() + opts.timeoutMs;
  let task: TaskRow | null = null;
  let rescheduled = false;
  let started = false;
  while (Date.now() < deadline) {
    task = await findTask(opts.name).catch(() => null);
    if (task) {
      // Learn DuoPlus's clock from the first task, and correct this task's time if we guessed wrong.
      if (!offsetLearned && task.created_at) {
        const learned = learnServerOffset(task.created_at, Date.now());
        if (learned !== null) {
          offsetLearned = true;
          if (learned !== serverOffsetMin) {
            console.log('[rpa] DuoPlus clock is UTC' + (learned >= 0 ? '+' : '') + learned / 60 + 'h; adjusting (was ' + serverOffsetMin / 60 + 'h)');
            serverOffsetMin = learned;
            if (task.status === 0 && !rescheduled) {
              rescheduled = true;
              await duoplusPost('/api/v1/automation/updateTaskTime', { id: task.id, issue_at: formatServerTime(Date.now(), serverOffsetMin) }).catch(() => {});
            }
          }
        }
      }
      if (task.status === 1 && !started) {
        started = true;
        opts.onStarted?.();
      }
      if (task.status === 3) return { taskId: task.id, templateId: t.id, templateName: t.name };
      // The template writes <pin_id>.done as its last step: that is the end of the search.
      if (task.status === 1 && opts.doneCheck && (await opts.doneCheck().catch(() => false)))
        return { taskId: task.id, templateId: t.id, templateName: t.name };
      if (task.status === 4 || task.status === 5) {
        const why = await failureDetail(task.id);
        throw new Error('RPA_TASK_FAILED ' + (task.status === 5 ? 'cancelled' : why || 'failed').slice(0, 200));
      }
    }
    await sleep(4000);
  }
  if (task) await cancelRpaTask(task.id);
  throw new Error('RPA_TASK_TIMEOUT ' + (task ? 'status=' + task.status : 'task not found'));
}
