import { Renderer } from "@freelensapp/extensions";

const workloadApis: Record<string, () => { get(desc: { name: string; namespace: string }): Promise<unknown> }> = {
  deployment: () => Renderer.K8sApi.deploymentApi,
  statefulset: () => Renderer.K8sApi.statefulSetApi,
  replicaset: () => Renderer.K8sApi.replicaSetApi,
  daemonset: () => Renderer.K8sApi.daemonSetApi,
};

/** Label selector of a workload, e.g. "app=web,tier=frontend". */
export async function selectorFor(kind: string, name: string, namespace: string): Promise<string> {
  const api = workloadApis[kind]?.();
  if (!api) throw new Error(`Unsupported kind ${kind}`);
  const workload = (await api.get({ name, namespace })) as { getSelectors(): string[] } | null;
  if (!workload) throw new Error(`${kind} ${namespace}/${name} not found`);
  const selector = workload.getSelectors().join(",");
  if (!selector) throw new Error(`${kind} ${namespace}/${name} has no matchLabels selector`);
  return selector;
}
