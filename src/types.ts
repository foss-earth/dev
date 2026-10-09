export type DevPhase = "idle" | "mounting" | "mounted" | "failed";
export interface DevContributionInfo { id: string; title: string; owner: string; description?: string }
export interface DevContributionStatus extends DevContributionInfo { phase: DevPhase; error: string | null }
export interface DevSnapshot { enabled: boolean; open: boolean; disposed: boolean; contributions: readonly DevContributionStatus[] }

/** The host supplies its existing observations and authorities by reference. */
export interface DevMountContext<Ports> { ports: Ports; signal: AbortSignal }
export interface DevViewHandle<View> { view: View; dispose(): void | Promise<void> }
export interface DevContribution<Ports, View> extends DevContributionInfo {
  /** Lazily creates an observation view; never starts capture/benchmarks/servers/simulation. */
  mount(context: DevMountContext<Ports>): DevViewHandle<View> | Promise<DevViewHandle<View>>;
}

export interface DevTabRegistration {
  id: "dev";
  title: "Dev";
  /** The host's one tab registry reports actual visibility, including close and reopen. */
  onOpenChange(open: boolean): void;
}

/** Presentation ports; no new registry, renderer or frame loop belongs to Dev. */
export interface DevHostPort<View> {
  registerTab(tab: DevTabRegistration): () => void;
  mount(contribution: DevContributionInfo, view: View): void;
  unmount(id: string): void;
  status(contribution: DevContributionStatus): void;
  remove(id: string): void;
}

export interface DevError { id: string | null; stage: "register-tab" | "mount" | "unmount" | "dispose" | "host"; cause: unknown }
export interface DevSessionOptions<Ports, View> {
  search: string;
  ports: Ports;
  host: DevHostPort<View>;
  /** Host cancellation factory. Omission retains the legacy native constructor. */
  createAbortController?(): AbortController;
  contributions?: readonly DevContribution<Ports, View>[];
  onError?(error: DevError): void;
}
export interface DevSession<Ports, View> {
  readonly enabled: boolean;
  readonly disposed: boolean;
  snapshot(): DevSnapshot;
  register(contribution: DevContribution<Ports, View>): () => void;
  setOpen(open: boolean): void;
  subscribe(listener: (snapshot: DevSnapshot) => void): () => void;
  /** Await outstanding mounts and disposal; no timeout or hidden work loop is created. */
  whenSettled(): Promise<void>;
  dispose(): void;
}
