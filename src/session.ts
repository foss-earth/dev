import { DEV_TAB_ID, wantsDev } from "./activation.js";
import type { DevContribution, DevContributionInfo, DevContributionStatus, DevError, DevSession, DevSessionOptions, DevSnapshot, DevViewHandle } from "./types.js";

interface Run<View> { controller: AbortController; handle: DevViewHandle<View> | null; attached: boolean; cleaned: boolean }
interface Slot<Ports, View> { contribution: DevContribution<Ports, View>; status: DevContributionStatus; run: Run<View> | null }
const infoOf = (value: DevContributionInfo): DevContributionInfo => ({ id: value.id, title: value.title, owner: value.owner, ...(value.description === undefined ? {} : { description: value.description }) });

/** Pure lifecycle machinery. Nothing reads a location, document, runtime or feature singleton. */
export function createDevSession<Ports, View>(options: DevSessionOptions<Ports, View>): DevSession<Ports, View> {
  const enabled = wantsDev(options.search);
  const { host, ports, onError } = options;
  const createAbortController = options.createAbortController ?? (() => new AbortController());
  const slots = new Map<string, Slot<Ports, View>>();
  const listeners = new Set<(snapshot: DevSnapshot) => void>();
  const pending = new Set<Promise<void>>();
  let open = false, disposed = false;
  let removeTab: (() => void) | null = null;
  const report = (id: string | null, stage: DevError["stage"], cause: unknown): void => {
    try { onError?.({ id, stage, cause }); } catch { /* Reporting cannot prevent cleanup. */ }
  };
  const snapshot = (): DevSnapshot => ({ enabled, open, disposed, contributions: [...slots.values()].map(slot => ({ ...slot.status })) });
  const emit = (): void => {
    const value = snapshot();
    for (const listener of listeners) { try { listener(value); } catch (error) { report(null, "host", error); } }
  };
  const hostCall = (id: string, action: () => void): void => { try { action(); } catch (error) { report(id, "host", error); } };
  const track = (promise: Promise<void>): void => {
    pending.add(promise);
    void promise.then(() => { pending.delete(promise); }, () => { pending.delete(promise); });
  };
  const status = (slot: Slot<Ports, View>, phase: DevContributionStatus["phase"], error: string | null = null): void => {
    slot.status = { ...infoOf(slot.contribution), phase, error };
    if (enabled && !disposed) hostCall(slot.contribution.id, () => host.status({ ...slot.status }));
    emit();
  };
  const current = (slot: Slot<Ports, View>, run: Run<View>): boolean => !disposed && open && slots.get(slot.contribution.id) === slot && slot.run === run && !run.controller.signal.aborted;

  async function clean(id: string, run: Run<View>): Promise<void> {
    if (run.cleaned || !run.handle) return;
    run.cleaned = true;
    if (run.attached) {
      run.attached = false;
      try { host.unmount(id); } catch (error) { report(id, "unmount", error); }
    }
    try { await run.handle.dispose(); } catch (error) { report(id, "dispose", error); }
  }

  function stop(slot: Slot<Ports, View>): void {
    const run = slot.run;
    slot.run = null;
    if (run) {
      try { run.controller.abort(); } catch (error) { report(slot.contribution.id, "dispose", error); }
      track(clean(slot.contribution.id, run));
    }
    status(slot, "idle");
  }

  function start(slot: Slot<Ports, View>): void {
    if (!enabled || !open || disposed || slot.run) return;
    let controller: AbortController;
    try { controller = createAbortController(); }
    catch (error) {
      status(slot, "failed", error instanceof Error ? error.message : String(error));
      report(slot.contribution.id, "mount", error);
      return;
    }
    // The injected factory may synchronously close, remove or dispose this mount.
    if (!open || disposed || slots.get(slot.contribution.id) !== slot) {
      try { controller.abort(); } catch (error) { report(slot.contribution.id, "dispose", error); }
      return;
    }
    const run: Run<View> = { controller, handle: null, attached: false, cleaned: false };
    slot.run = run;
    status(slot, "mounting");
    const mounting = Promise.resolve().then(() => current(slot, run) ? slot.contribution.mount({ ports, signal: run.controller.signal }) : null).then(async handle => {
      if (handle === null) return;
      // Even a malformed returned view can own resources through its disposer.
      if (handle && typeof handle === "object" && typeof handle.dispose === "function") run.handle = handle;
      if (!handle || typeof handle !== "object" || !("view" in handle) || typeof handle.dispose !== "function") throw new Error("Dev contribution must return a view and disposer.");
      run.handle = handle;
      if (!current(slot, run)) { await clean(slot.contribution.id, run); return; }
      // A partial host mount also needs its unmount port if that mount throws.
      run.attached = true;
      host.mount(infoOf(slot.contribution), handle.view);
      if (!current(slot, run)) { await clean(slot.contribution.id, run); return; }
      status(slot, "mounted");
    }).catch(async error => {
      await clean(slot.contribution.id, run);
      if (current(slot, run)) {
        slot.run = null;
        status(slot, "failed", error instanceof Error ? error.message : String(error));
        report(slot.contribution.id, "mount", error);
      }
    });
    track(mounting);
  }

  function register(contribution: DevContribution<Ports, View>): () => void {
    if (disposed) throw new Error("Dev session is disposed.");
    if (!contribution || typeof contribution.id !== "string" || !/^[a-z\d][a-z\d._-]*$/i.test(contribution.id) || typeof contribution.title !== "string" || !contribution.title || typeof contribution.owner !== "string" || !contribution.owner || (contribution.description !== undefined && typeof contribution.description !== "string") || typeof contribution.mount !== "function") throw new Error("Dev contributions require a stable safe ID, title, owner and mount factory.");
    if (slots.has(contribution.id)) throw new Error(`Duplicate Dev contribution ID: ${contribution.id}.`);
    const slot: Slot<Ports, View> = { contribution: { ...contribution }, status: { ...infoOf(contribution), phase: "idle", error: null }, run: null };
    const id = slot.contribution.id;
    slots.set(id, slot);
    if (enabled && removeTab) hostCall(contribution.id, () => host.status({ ...slot.status }));
    if (open) start(slot); else emit();
    let removed = false;
    return () => {
      if (removed || slots.get(id) !== slot) return;
      removed = true;
      stop(slot);
      slots.delete(id);
      if (enabled && !disposed) hostCall(id, () => host.remove(id));
      emit();
    };
  }

  function setOpen(value: boolean): void {
    if (!enabled || disposed || open === value) return;
    open = value;
    for (const slot of slots.values()) { if (open) start(slot); else stop(slot); }
    emit();
  }

  function dispose(): void {
    if (disposed) return;
    open = false;
    disposed = true;
    for (const slot of slots.values()) stop(slot);
    const remove = removeTab; removeTab = null;
    try { remove?.(); } catch (error) { report(null, "dispose", error); }
    emit(); listeners.clear();
  }

  const session: DevSession<Ports, View> = {
    enabled,
    get disposed() { return disposed; },
    snapshot, register, setOpen, dispose,
    subscribe(listener) { if (disposed) return () => {}; listeners.add(listener); return () => { listeners.delete(listener); }; },
    async whenSettled() { while (pending.size) await Promise.all([...pending]); },
  };
  try {
    for (const contribution of options.contributions ?? []) register(contribution);
    if (enabled) {
      removeTab = host.registerTab({ id: DEV_TAB_ID, title: "Dev", onOpenChange: setOpen });
      for (const slot of slots.values()) hostCall(slot.contribution.id, () => host.status({ ...slot.status }));
    }
  } catch (error) { report(null, "register-tab", error); dispose(); throw error; }
  return session;
}
