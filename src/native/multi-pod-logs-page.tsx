import React from "react";
import { Common, Renderer } from "@freelensapp/extensions";
import { LogCollector, LogLine, PodRef, parseDuration } from "./log-collector";
import { sternPreferenceStore } from "../preference/stern-preference/stern-preference-store";

type Pod = Renderer.K8sApi.Pod;

const COLORS = ["#4fc3f7", "#81c784", "#ffb74d", "#e57373", "#ba68c8", "#4db6ac", "#f06292", "#dce775", "#9575cd", "#a1887f"];
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

const workloadApis: Record<string, () => { get(desc: { name: string; namespace: string }): Promise<unknown> }> = {
  deployment: () => Renderer.K8sApi.deploymentApi,
  statefulset: () => Renderer.K8sApi.statefulSetApi,
  replicaset: () => Renderer.K8sApi.replicaSetApi,
  daemonset: () => Renderer.K8sApi.daemonSetApi,
};

async function selectorFor(kind: string, name: string, namespace: string): Promise<string> {
  const api = workloadApis[kind]?.();
  if (!api) throw new Error(`Unsupported kind ${kind}`);
  const workload = (await api.get({ name, namespace })) as { getSelectors(): string[] } | null;
  if (!workload) throw new Error(`${kind} ${namespace}/${name} not found`);
  const selector = workload.getSelectors().join(",");
  if (!selector) throw new Error(`${kind} ${namespace}/${name} has no matchLabels selector`);
  return selector;
}

function formatTs(ts: string, mode: string): string {
  if (mode === "short") return ts.slice(5, 19).replace("T", " ");
  if (mode === "default") return ts;
  return "";
}

interface Props {
  kind: string;
  namespace: string;
  name: string;
  container?: string;
  exclude?: string;
}

interface State {
  lines: LogLine[];
  streams: { key: string; label: string; index: number; active: boolean; error?: string }[];
  error?: string;
  filter: string;
  follow: boolean;
  paused: boolean;
  wrap: boolean;
}

export class MultiPodLogsView extends React.Component<Props, State> {
  private collector?: LogCollector;
  private scroller = React.createRef<HTMLDivElement>();
  private pendingLines?: LogLine[];

  state: State = { lines: [], streams: [], filter: "", follow: true, paused: false, wrap: true };

  componentDidMount() {
    this.start();
  }

  componentDidUpdate(prev: Props) {
    if (["kind", "namespace", "name", "container", "exclude"].some((k) => prev[k as keyof Props] !== this.props[k as keyof Props])) {
      this.collector?.stop();
      this.setState({ lines: [], streams: [], error: undefined });
      this.start();
    }
    if (this.state.follow && this.scroller.current) {
      this.scroller.current.scrollTop = this.scroller.current.scrollHeight;
    }
  }

  componentWillUnmount() {
    this.collector?.stop();
  }

  private start() {
    const { kind, namespace, name, container, exclude } = this.props;
    if (!kind || !namespace || !name) return;

    const selectorPromise = selectorFor(kind, name, namespace);
    selectorPromise.catch((error) => this.setState({ error: String(error?.message ?? error) }));

    const collector = new LogCollector(
      {
        listPods: async (): Promise<PodRef[]> => {
          const labelSelector = await selectorPromise;
          const pods = ((await Renderer.K8sApi.podsApi.list({ namespace }, { labelSelector })) ?? []) as Pod[];
          return pods.map((pod) => ({
            name: pod.getName(),
            namespace: pod.getNs(),
            containers: [...pod.getInitContainers(), ...pod.getContainers()].map((c) => c.name),
          }));
        },
        fetchLogs: (pod, query) => Renderer.K8sApi.podsApi.getLogs({ name: pod.name, namespace: pod.namespace }, query),
      },
      {
        sinceMs: parseDuration(sternPreferenceStore.since || "1m"),
        maxLines: 5000,
        maxConcurrent: sternPreferenceStore.maxLogRequests || 10,
        includeContainer: container || undefined,
        excludeContainer: exclude || undefined,
      },
      (lines) => {
        if (this.state.paused) this.pendingLines = lines;
        else this.setState({ lines });
        this.updateStreams();
      },
    );
    this.collector = collector;
    collector.run();
    // Show discovered streams before the first lines arrive.
    setTimeout(() => this.updateStreams(), 1500);
  }

  private updateStreams() {
    const collector = this.collector;
    if (!collector) return;
    const streams = [...collector.streams.entries()].map(([key, s]) => ({
      key,
      label: `${s.pod.name}/${s.container}`,
      index: s.index,
      active: s.active,
      error: s.error,
    }));
    this.setState({ streams });
  }

  private togglePause = () => {
    const paused = !this.state.paused;
    this.setState({ paused, lines: paused ? this.state.lines : (this.pendingLines ?? this.state.lines) });
    this.pendingLines = undefined;
  };

  private onScroll = () => {
    const el = this.scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    if (atBottom !== this.state.follow) this.setState({ follow: atBottom });
  };

  render() {
    const { kind, namespace, name, container, exclude } = this.props;
    const { lines, streams, error, filter, paused, follow, wrap } = this.state;
    const tsMode = sternPreferenceStore.timestamp;

    let matcher: (text: string) => boolean = () => true;
    if (filter) {
      try {
        const re = new RegExp(filter, "i");
        matcher = (text) => re.test(text);
      } catch {
        const needle = filter.toLowerCase();
        matcher = (text) => text.toLowerCase().includes(needle);
      }
    }
    const visible = lines.filter((l) => matcher(`${l.pod} ${l.container} ${l.message}`));
    const scope = container ? ` | only ${container}` : exclude ? ` | except ${exclude}` : "";

    const button = (label: string, onClick: () => void, active = false) => (
      <button className={`mpl-btn${active ? " active" : ""}`} onClick={onClick}>
        {label}
      </button>
    );

    return (
      <div className="mpl-page">
        <style>{CSS}</style>
        <div className="mpl-head">
          <h2>
            Multi Pod Logs: {kind} {namespace}/{name}
            <span className="mpl-dim">{scope}</span>
          </h2>
          <div className="mpl-tools">
            <input
              className="mpl-filter"
              placeholder="Filter (regex)"
              value={filter}
              onChange={(e) => this.setState({ filter: e.target.value })}
            />
            {button(paused ? "Resume" : "Pause", this.togglePause, paused)}
            {button("Wrap", () => this.setState({ wrap: !wrap }), wrap)}
            {button("Follow", () => this.setState({ follow: !follow }), follow)}
            {button("Clear", () => this.collector?.clear())}
          </div>
        </div>
        <div className="mpl-streams">
          {streams.map((s) => (
            <span
              key={s.key}
              className={`mpl-chip${s.active ? "" : " gone"}`}
              style={{ borderColor: COLORS[s.index % COLORS.length] }}
              title={s.error ?? (s.active ? "streaming" : "pod gone")}
            >
              {s.label}
              {s.error ? " (!)" : ""}
            </span>
          ))}
          {error && <span className="mpl-error">{error}</span>}
          <span className="mpl-dim">
            {visible.length}/{lines.length} lines
          </span>
        </div>
        <div className={`mpl-log${wrap ? " wrap" : ""}`} ref={this.scroller} onScroll={this.onScroll}>
          {visible.map((l) => (
            <div key={l.seq} className="mpl-line">
              {tsMode && tsMode !== "no" && <span className="mpl-ts">{formatTs(l.ts, tsMode)} </span>}
              <span style={{ color: COLORS[l.stream % COLORS.length] }}>
                {l.pod} {l.container}
              </span>{" "}
              {l.message.replace(ANSI, "")}
            </div>
          ))}
          {lines.length === 0 && !error && <div className="mpl-dim">Waiting for logs...</div>}
        </div>
      </div>
    );
  }
}

const CSS = `
.mpl-page { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 12px 16px; box-sizing: border-box; gap: 8px; }
.mpl-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.mpl-head h2 { margin: 0; font-size: 16px; font-weight: 600; }
.mpl-tools { display: flex; gap: 6px; align-items: center; }
.mpl-filter { width: 220px; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--inputControlBorder); background: var(--inputControlBackground); color: var(--textColorPrimary); }
.mpl-btn { padding: 4px 10px; border-radius: 4px; border: 1px solid var(--borderColor); background: transparent; color: var(--textColorPrimary); cursor: pointer; }
.mpl-btn.active { background: var(--primary); border-color: var(--primary); color: #fff; }
.mpl-streams { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; }
.mpl-chip { padding: 1px 8px; border: 1px solid; border-radius: 10px; }
.mpl-chip.gone { opacity: 0.45; text-decoration: line-through; }
.mpl-error { color: var(--colorError); }
.mpl-dim { color: var(--textColorTertiary); font-weight: normal; }
.mpl-log { flex: 1; min-height: 0; overflow: auto; background: var(--logsBackground); color: var(--logsForeground); font-family: var(--font-monospace, monospace); font-size: 12px; line-height: 1.5; padding: 8px; border-radius: 4px; }
.mpl-line { white-space: pre; }
.mpl-log.wrap .mpl-line { white-space: pre-wrap; word-break: break-all; }
.mpl-line:hover { background: var(--logRowHoverBackground); }
.mpl-ts { color: var(--textColorTertiary); }
`;

/** Page component: reads its target from the page params. */
export const MultiPodLogsPage = (props: Common.Types.PageComponentProps) => {
  const p = props.params as Record<string, { get(): string }>;
  return (
    <MultiPodLogsView
      kind={p.kind.get()}
      namespace={p.namespace.get()}
      name={p.name.get()}
      container={p.container.get()}
      exclude={p.exclude.get()}
    />
  );
};
