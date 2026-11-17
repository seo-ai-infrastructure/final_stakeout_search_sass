/**
 * One shared look at DuoPlus's task list for every search that is waiting on a template, instead
 * of one request per phone (DuoPlus allows about one request a second for the whole account; see
 * apps/worker/src/rpa.ts). Each waiting search registers its task's unique name and reads the
 * task's latest row from here. A task the shared list does not show is asked for by name, a few
 * per round, so a list that misbehaves makes the watcher slower but never wrong.
 */
export type TaskRow = { id: string; status: number; created_at?: string; [key: string]: unknown };
export type TaskWatch = { name: string; addedAt: number; task: TaskRow | null; seenAt: number; askedAt: number };

export const asTaskRow = (row: any): TaskRow => ({ ...row, id: String(row?.id), status: Number(row?.status) });

export function createTaskWatcher(o: {
  /** The newest tasks on the account (rows with name, id, status). */
  list: () => Promise<any[]>;
  /** One task by its name, for tasks the list did not show. */
  byName: (name: string) => Promise<TaskRow | null>;
  pollMs: number;
  /** Runs after each round (e.g. to learn DuoPlus's clock from the rows seen). */
  afterPoll?: (watching: ReadonlyMap<string, TaskWatch>) => Promise<void>;
  onListError?: (e: unknown) => void;
  /** A task not in the list this long after it was added is asked for by name… */
  missingAfterMs?: number;
  /** …at most this often per task… */
  askEveryMs?: number;
  /** …and at most this many tasks per round. */
  askPerRound?: number;
  now?: () => number;
}) {
  const now = o.now ?? Date.now;
  const watching = new Map<string, TaskWatch>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let polling = false;

  async function poll() {
    if (polling || !watching.size) return;
    polling = true;
    try {
      let rows: any[] | null = null;
      try {
        rows = await o.list();
      } catch (e) {
        o.onListError?.(e);
      }
      const seen = now();
      for (const row of rows ?? []) {
        const w = watching.get(String(row?.name ?? ''));
        if (w) {
          w.task = asTaskRow(row);
          w.seenAt = seen;
        }
      }
      const missing = [...watching.values()]
        .filter((w) => w.seenAt < seen && seen - w.addedAt >= (o.missingAfterMs ?? 10000) && seen - w.askedAt >= (o.askEveryMs ?? 20000))
        .sort((a, b) => a.askedAt - b.askedAt || a.addedAt - b.addedAt)
        .slice(0, o.askPerRound ?? 2);
      for (const w of missing) {
        w.askedAt = now();
        const t = await o.byName(w.name).catch(() => null);
        if (t && watching.get(w.name) === w) {
          w.task = t;
          w.seenAt = now();
        }
      }
      await o.afterPoll?.(watching);
    } finally {
      polling = false;
    }
  }

  return {
    /** Starts watching a task by its unique name; the returned record is updated in place. */
    watch(name: string) {
      const w: TaskWatch = { name, addedAt: now(), task: null, seenAt: 0, askedAt: 0 };
      watching.set(name, w);
      timer ??= setInterval(() => void poll(), o.pollMs);
      return w;
    },
    unwatch(name: string) {
      watching.delete(name);
      if (!watching.size && timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    poll,
    watching: () => watching.size,
    running: () => timer !== null,
  };
}
