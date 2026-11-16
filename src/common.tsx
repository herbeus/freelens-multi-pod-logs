import React from "react";
import { Renderer, Common } from "@freelensapp/extensions";
import { SternCmd } from "./stern";
import { selectorFor } from "./native/selector";
import { sternPreferenceStore } from "./preference/stern-preference/stern-preference-store";

const {
  Component: { MenuItem, Icon, SubMenu, StatusBrick },
} = Renderer;

type Pod = Renderer.K8sApi.Pod;

export class MultiPodLogsCommon {
  /** Set by the renderer extension so menu actions can open the logs page. */
  public static extension?: Renderer.LensExtension;

  /**
   * Get the container name list by a list of pods.
   *
   * @param podList
   * @returns a set, without duplicates
   */
  public static getContainersByPodList(podList: Pod[]): Set<string> {
    const containerNameList: Set<string> = new Set();
    for (let i = 0; i < podList.length; i++) {
      const containers = podList[i].getContainers();
      for (let j = 0; j < containers.length; j++) {
        containerNameList.add(containers[j].name);
      }
    }

    return containerNameList;
  }

  /**
   * Construct the menu voices.
   *
   * @param props
   * @param containerNames
   * @param resourceNs
   * @param resourceType
   * @param resourceName
   * @param resourceTitle
   * @returns the MenuItem to show in Lens
   */
  public static uiMenu(
    props: any,
    containerNames: Set<string>,
    resourceNs: string,
    resourceType: string,
    resourceName: string,
    resourceTitle: string
  ) {
    return (
      <MenuItem
        onClick={Common.Util.prevDefault(() =>
          this.multiPodLogs(
            resourceNs,
            resourceType,
            resourceName,
            resourceTitle
          )
        )}
      >
        <Icon
          material="playlist_play"
          interactive={props.toolbar}
          tooltip="Multi Pod Logs"
        />
        <span className="title">Multi Pod Logs</span>
        {
          // Show sub-menu only if deployment pods has at least 2 containers
          containerNames.size > 1 && (
            <>
              <Icon material="keyboard_arrow_right" />
              <SubMenu>
                {/* All containers */}
                <MenuItem
                  onClick={Common.Util.prevDefault(() =>
                    this.multiPodLogs(
                      resourceNs,
                      resourceType,
                      resourceName,
                      resourceTitle
                    )
                  )}
                >
                  <span>All containers</span>
                </MenuItem>
                {/* All containers, except selected */}
                <MenuItem onClick={Common.Util.prevDefault(() => {})}>
                  <span>All except</span>
                  <Icon material="keyboard_arrow_right" />

                  <SubMenu>
                    {Array.from(containerNames).map((c) => {
                      return (
                        <MenuItem
                          key={`except_${c}`}
                          onClick={Common.Util.prevDefault(() =>
                            this.multiPodLogs(
                              resourceNs,
                              resourceType,
                              resourceName,
                              resourceTitle,
                              { exclude: c, containers: containerNames }
                            )
                          )}
                        >
                          <StatusBrick />
                          <span>{c}</span>
                        </MenuItem>
                      );
                    })}
                  </SubMenu>
                </MenuItem>
                {/* Only selected container */}
                <MenuItem onClick={Common.Util.prevDefault(() => {})}>
                  <span>Only</span>
                  <Icon material="keyboard_arrow_right" />

                  <SubMenu>
                    {Array.from(containerNames).map((c) => {
                      return (
                        <MenuItem
                          key={`only_${c}`}
                          onClick={Common.Util.prevDefault(() =>
                            this.multiPodLogs(
                              resourceNs,
                              resourceType,
                              resourceName,
                              resourceTitle,
                              { include: c, containers: containerNames }
                            )
                          )}
                        >
                          <StatusBrick />
                          <span>{c}</span>
                        </MenuItem>
                      );
                    })}
                  </SubMenu>
                </MenuItem>
              </SubMenu>
            </>
          )
        }
      </MenuItem>
    );
  }

  private static multiPodLogs(
    resourceNs: string,
    resourceType: string,
    resourceName: string,
    resourceTitle: string,
    options?: { exclude?: string; include?: string; containers?: Set<string> }
  ) {
    const viewer = sternPreferenceStore.viewer;
    if (viewer === "kubectl") {
      void this.kubectlLogs(resourceNs, resourceType, resourceName, resourceTitle, options);
      return;
    }
    if (viewer === "page" && this.extension) {
      void this.extension.navigate("logs", {
        kind: resourceType,
        namespace: resourceNs,
        name: resourceName,
        container: options?.include ?? "",
        exclude: options?.exclude ?? "",
      });
      Renderer.Navigation.hideDetails();
      return;
    }

    // Generate stern command
    const cmd = SternCmd.generateCmd(
      `${resourceType}/${resourceName}`,
      {
        namespace: [resourceNs],
        excludeContainer: options?.exclude,
        container: options?.include,
        diffContainer: true,
        timestamps: sternPreferenceStore.timestamp,
        since: sternPreferenceStore.since,
        maxLogRequests: sternPreferenceStore.maxLogRequests,
        output: sternPreferenceStore.builtInTemplate,
        template: sternPreferenceStore.customTemplate,
      },
      {
        krew: sternPreferenceStore.krew,
      }
    );

    // Open new terminal
    this.openTerminal(
      `Multi Pod Logs | ${resourceTitle}: ${resourceName}`,
      cmd
    );
  }

  /**
   * Follow the logs of all pods of a workload with plain kubectl in a dock terminal.
   * kubectl can only select one or all containers, so "all except" with more than one
   * remaining container falls back to the built-in page.
   */
  private static async kubectlLogs(
    namespace: string,
    kind: string,
    name: string,
    title: string,
    options?: { exclude?: string; include?: string; containers?: Set<string> }
  ) {
    let container = options?.include;
    if (options?.exclude) {
      const rest = [...(options.containers ?? [])].filter((c) => c !== options.exclude);
      if (rest.length !== 1) {
        Renderer.Component.Notifications.info(
          "kubectl cannot exclude a single container, opening the built-in log page instead."
        );
        void this.extension?.navigate("logs", { kind, namespace, name, container: "", exclude: options.exclude });
        Renderer.Navigation.hideDetails();
        return;
      }
      container = rest[0];
    }

    let selector: string;
    try {
      selector = await selectorFor(kind, name, namespace);
    } catch (e: any) {
      Renderer.Component.Notifications.error(`Multi Pod Logs: ${e?.message ?? e}`);
      return;
    }

    const cmd = KubectlLogsCmd.generate({
      namespace,
      selector,
      container,
      since: sternPreferenceStore.since,
      timestamps: sternPreferenceStore.timestamp !== "no",
      maxLogRequests: sternPreferenceStore.maxLogRequests,
    });
    this.openTerminal(`Multi Pod Logs | ${title}: ${name}`, cmd);
  }

  private static openTerminal(title: string, command: string) {
    const tab = Renderer.Component.createTerminalTab({
      title: title,
    });

    Renderer.Component.terminalStore.sendCommand(command, {
      enter: true,
      tabId: tab.id,
    });

    Renderer.Navigation.hideDetails();
  }
}

export interface KubectlLogsOptions {
  namespace: string;
  selector: string;
  container?: string;
  since?: string;
  timestamps?: boolean;
  maxLogRequests?: number;
}

export class KubectlLogsCmd {
  /** Double quotes work in PowerShell, cmd and POSIX shells; kubernetes names never contain them. */
  private static quote(value: string): string {
    return `"${value.replace(/"/g, "")}"`;
  }

  public static generate(o: KubectlLogsOptions): string {
    const parts = [
      "kubectl logs -f --prefix --ignore-errors",
      "-n", this.quote(o.namespace),
      "-l", this.quote(o.selector),
      o.container ? `-c ${this.quote(o.container)}` : "--all-containers",
      `--max-log-requests=${Math.max(1, o.maxLogRequests || 50)}`,
    ];
    if (o.since && /^\d+[smh]$/.test(o.since.trim())) parts.push(`--since=${o.since.trim()}`);
    if (o.timestamps) parts.push("--timestamps");
    return parts.join(" ");
  }
}
