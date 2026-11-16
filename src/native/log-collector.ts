/**
 * Collects logs of several pods/containers through the Kubernetes API by
 * polling (the same way the built-in log tab does), merges them by timestamp
 * and keeps a bounded buffer. Free of Freelens imports so it can be tested
 * with fakes.
 */

export interface PodRef {
  name: string;
  namespace: string;
  containers: string[];
}

export interface LogLine {
  /** RFC3339Nano timestamp from the API, used for ordering. */
  ts: string;
  pod: string;
  container: string;
  message: string;
  /** Index of the stream, used for coloring. */
  stream: number;
  seq: number;
}

export interface LogQuery {
  container: string;
  timestamps: true;
  sinceTime: string;
}

export interface CollectorDeps {
  listPods(): Promise<PodRef[]>;
  fetchLogs(pod: PodRef, query: LogQuery): Promise<string>;
  now?: () => number;
}

export interface CollectorOptions {
  sinceMs: number;
  maxLines: number;
  maxConcurrent: number;
  includeContainer?: string;
  excludeContainer?: string;
}

interface Stream {
  index: number;
  pod: PodRef;
  container: string;
  sinceTime: string;
  /** Lines already seen in the current second; the API only accepts whole seconds. */
  seen: Set<string>;
  active: boolean;
  error?: string;
}

const LINE = /^(\d{4}-\d\d-\d\dT[\d:.]+Z) ?(.*)$/;

export function parseDuration(text: string): number {
  const re = /(\d+(?:\.\d+)?)(h|m|s|ms)/g;
  const unit: Record<string, number> = { h: 3600e3, m: 60e3, s: 1e3, ms: 1 };
  let total = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text.trim()))) total += parseFloat(match[1]) * unit[match[2]];
  return total;
}

function toSecond(ts: string): string {
  return ts.replace(/\.\d+Z$/, "Z");
}

export class LogCollector {
  lines: LogLine[] = [];
  streams = new Map<string, Stream>();
  private seq = 0;
  private stopped = false;

  constructor(
    private readonly deps: CollectorDeps,
    private readonly options: CollectorOptions,
    private readonly onChange: (lines: LogLine[]) => void = () => {},
  ) {}

  private get now() {
    return this.deps.now?.() ?? Date.now();
  }

  /** Syncs the stream list with the current pods. Returns the active stream count. */
  async refreshPods(): Promise<number> {
    const pods = await this.deps.listPods();
    const wanted = new Set<string>();
    // All streams start at the same point, so pods that appear later (e.g. during
    // a rollout) are shown from their first line.
    this.initialSince ??= toSecond(new Date(this.now - this.options.sinceMs).toISOString());

    for (const pod of pods) {
      for (const container of pod.containers) {
        if (this.options.includeContainer && container !== this.options.includeContainer) continue;
        if (this.options.excludeContainer && container === this.options.excludeContainer) continue;
        const key = `${pod.namespace}/${pod.name}/${container}`;
        wanted.add(key);
        const existing = this.streams.get(key);
        if (existing) {
          existing.active = true;
          existing.pod = pod;
        } else {
          this.streams.set(key, {
            index: this.streams.size,
            pod,
            container,
            sinceTime: this.initialSince,
            seen: new Set(),
            active: true,
          });
        }
      }
    }
    for (const [key, stream] of this.streams) if (!wanted.has(key)) stream.active = false;
    return [...this.streams.values()].filter((s) => s.active).length;
  }

  private initialSince?: string;

  /** Fetches new lines for every active stream once. */
  async poll(): Promise<void> {
    const active = [...this.streams.values()].filter((s) => s.active);
    const fresh: LogLine[] = [];
    let next = 0;
    const worker = async () => {
      while (next < active.length && !this.stopped) {
        const stream = active[next++];
        fresh.push(...(await this.pollStream(stream)));
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, this.options.maxConcurrent) }, worker));
    if (fresh.length === 0) return;

    const merged = this.lines.concat(fresh);
    merged.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.seq - b.seq));
    this.lines = merged.length > this.options.maxLines ? merged.slice(-this.options.maxLines) : merged;
    this.onChange(this.lines);
  }

  private async pollStream(stream: Stream): Promise<LogLine[]> {
    let text: string;
    try {
      text = await this.deps.fetchLogs(stream.pod, {
        container: stream.container,
        timestamps: true,
        sinceTime: stream.sinceTime,
      });
      stream.error = undefined;
    } catch (error) {
      stream.error = String((error as Error)?.message ?? error);
      return [];
    }

    const out: LogLine[] = [];
    for (const raw of text.split("\n")) {
      if (!raw) continue;
      const match = raw.match(LINE);
      if (!match) continue;
      const [, ts, message] = match;
      const second = toSecond(ts);
      if (second < stream.sinceTime) continue;
      if (second === stream.sinceTime) {
        if (stream.seen.has(raw)) continue;
      } else {
        stream.sinceTime = second;
        stream.seen.clear();
      }
      stream.seen.add(raw);
      out.push({ ts, pod: stream.pod.name, container: stream.container, message, stream: stream.index, seq: this.seq++ });
    }
    return out;
  }

  /** Runs pod discovery and polling until stop() is called. */
  run(pollMs = 2000, podRefreshMs = 10000): void {
    let lastRefresh = 0;
    const loop = async (): Promise<void> => {
      while (!this.stopped) {
        if (this.now - lastRefresh >= podRefreshMs) {
          await this.refreshPods().catch((): number => 0);
          lastRefresh = this.now;
        }
        await this.poll().catch((): void => undefined);
        await new Promise<void>((r) => setTimeout(r, pollMs));
      }
    };
    void loop();
  }

  stop(): void {
    this.stopped = true;
  }

  clear(): void {
    this.lines = [];
    this.onChange(this.lines);
  }
}
