import { Common } from "@freelensapp/extensions";
import { observable, makeObservable } from "mobx";

export type LogViewer = "kubectl" | "page" | "stern";

export type MultiPodLogsSternPreferenceModel = {
  viewer: LogViewer;
  /** @deprecated replaced by viewer, only read for migration */
  useStern?: boolean;
  krew: boolean;
  timestamp: string;
  since: string;
  maxLogRequests: number;
  builtInTemplate: string;
  customTemplate: string;
};

export class MultiPodLogsSternPreferencesStore extends Common.Store
  .ExtensionStore<MultiPodLogsSternPreferenceModel> {
  // Store properties
  viewer: LogViewer = "kubectl";
  krew = false;
  timestamp = "no";
  since = "5m";
  maxLogRequests = 50;
  builtInTemplate = "";
  customTemplate = "";

  constructor() {
    super({
      // Store name
      configName: "stern-preference-store",
      // Store default property values
      defaults: {
        viewer: "kubectl",
        krew: false,
        timestamp: "no",
        since: "5m",
        maxLogRequests: 50,
        builtInTemplate: "default",
        customTemplate: "",
      },
    });
    makeObservable(this, {
      viewer: observable,
      krew: observable,
      timestamp: observable,
      since: observable,
      maxLogRequests: observable,
      builtInTemplate: observable,
      customTemplate: observable,
    });
  }

  public fromStore({
    viewer,
    useStern,
    krew,
    timestamp,
    since,
    maxLogRequests,
    builtInTemplate,
    customTemplate,
  }: Partial<MultiPodLogsSternPreferenceModel>): void {
    this.viewer = viewer ?? (useStern ? "stern" : "kubectl");
    this.krew = krew;
    this.timestamp = timestamp;
    this.since = since;
    this.maxLogRequests = maxLogRequests;
    this.builtInTemplate = builtInTemplate;
    this.customTemplate = customTemplate;
  }

  toJSON(): MultiPodLogsSternPreferenceModel {
    return {
      viewer: this.viewer,
      krew: this.krew,
      timestamp: this.timestamp,
      since: this.since,
      maxLogRequests: this.maxLogRequests,
      builtInTemplate: this.builtInTemplate,
      customTemplate: this.customTemplate,
    };
  }
}

export const sternPreferenceStore = new MultiPodLogsSternPreferencesStore();
