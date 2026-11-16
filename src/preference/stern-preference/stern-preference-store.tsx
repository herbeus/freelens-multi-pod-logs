import { Common } from "@freelensapp/extensions";
import { observable, makeObservable } from "mobx";

export type MultiPodLogsSternPreferenceModel = {
  useStern: boolean;
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
  useStern = false;
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
        useStern: false,
        krew: false,
        timestamp: "no",
        since: "5m",
        maxLogRequests: 50,
        builtInTemplate: "default",
        customTemplate: "",
      },
    });
    makeObservable(this, {
      useStern: observable,
      krew: observable,
      timestamp: observable,
      since: observable,
      maxLogRequests: observable,
      builtInTemplate: observable,
      customTemplate: observable,
    });
  }

  public fromStore({
    useStern,
    krew,
    timestamp,
    since,
    maxLogRequests,
    builtInTemplate,
    customTemplate,
  }: Partial<MultiPodLogsSternPreferenceModel>): void {
    this.useStern = useStern ?? false;
    this.krew = krew;
    this.timestamp = timestamp;
    this.since = since;
    this.maxLogRequests = maxLogRequests;
    this.builtInTemplate = builtInTemplate;
    this.customTemplate = customTemplate;
  }

  toJSON(): MultiPodLogsSternPreferenceModel {
    return {
      useStern: this.useStern,
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
