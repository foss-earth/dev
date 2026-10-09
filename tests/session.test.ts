import { describe, expect, it, vi } from "vitest";
import { createDevSession, wantsDev, type DevContribution, type DevTabRegistration, type DevViewHandle } from "../src/index.js";

function fixture(search = "?dev=1", createAbortController?: () => AbortController) {
  let tab: DevTabRegistration | null = null;
  const removeTab = vi.fn();
  const host = { registerTab: vi.fn((value: DevTabRegistration) => { tab = value; return removeTab; }), mount: vi.fn(), unmount: vi.fn(), status: vi.fn(), remove: vi.fn() };
  const ports = { observe: vi.fn(), requestRender: vi.fn(), capture: vi.fn(), benchmark: vi.fn(), server: vi.fn(), simulation: vi.fn() };
  const onError = vi.fn();
  const session = createDevSession<typeof ports, string>({ search, ports, host, onError, createAbortController });
  return { session, host, ports, onError, removeTab, tab: () => tab! };
}
const info = { id: "renderer.resources", title: "Resources", owner: "renderer" };

describe("explicit Dev activation", () => {
  it.each(["", "?dev", "?dev=", "?dev=0", "?dev=true", "?dev=01", "?dev=1&dev=0", "?dev=1&dev=1"])("stays inactive for %s", search => {
    expect(wantsDev(search)).toBe(false);
    const f = fixture(search), mount = vi.fn();
    f.session.register({ ...info, mount }); f.session.setOpen(true); f.session.dispose();
    expect(mount).not.toHaveBeenCalled();
    for (const method of Object.values(f.host)) expect(method).not.toHaveBeenCalled();
  });
  it("registers only the dev tab with the exact flag, leaving host authorities untouched", () => {
    const f = fixture("?scene=example&dev=1");
    expect(f.session.enabled).toBe(true);
    expect(f.tab().id).toBe("dev"); expect(f.tab().title).toBe("Dev");
    expect(f.session.snapshot().open).toBe(false);
    for (const action of Object.values(f.ports)) expect(action).not.toHaveBeenCalled();
    f.session.dispose(); expect(f.removeTab).toHaveBeenCalledTimes(1);
  });
});

describe("host contribution lifecycle", () => {
  it("uses only the supplied cancellation factory and never allocates it while disabled", async () => {
    const controllers = [new AbortController(), new AbortController()];
    let next = 0;
    const createAbortController = vi.fn(() => controllers[next++]!);
    vi.stubGlobal("AbortController", class { constructor() { throw new Error("ambient cancellation allocation"); } });
    const disabled = fixture("", createAbortController), f = fixture("?dev=1", createAbortController);
    try {
      disabled.session.register({ ...info, mount: () => ({ view: "disabled", dispose() {} }) });
      disabled.session.setOpen(true); disabled.session.dispose();
      expect(createAbortController).not.toHaveBeenCalled();
      const mount = vi.fn(({ signal }: { signal: AbortSignal }) => ({ view: signal === controllers[0].signal ? "first" : "second", dispose() {} }));
      f.session.register({ ...info, mount });
      expect(createAbortController).not.toHaveBeenCalled();
      f.session.setOpen(true); await f.session.whenSettled();
      expect(createAbortController).toHaveBeenCalledTimes(1);
      expect(mount.mock.calls[0][0].signal).toBe(controllers[0].signal);
      f.session.setOpen(false); await f.session.whenSettled();
      expect(controllers[0].signal.aborted).toBe(true);
      f.session.setOpen(true); await f.session.whenSettled();
      expect(createAbortController).toHaveBeenCalledTimes(2);
      expect(mount.mock.calls[1][0].signal).toBe(controllers[1].signal);
    } finally {
      disabled.session.dispose(); f.session.dispose(); await f.session.whenSettled(); vi.unstubAllGlobals();
    }
  });

  it("isolates a throwing cancellation factory and retries it on reopen", async () => {
    let attempts = 0;
    const createAbortController = vi.fn(() => { if (++attempts === 1) throw new Error("factory failed"); return new AbortController(); });
    const f = fixture("?dev=1", createAbortController), failedMount = vi.fn(() => ({ view: "recovered", dispose() {} }));
    try {
      f.session.register({ ...info, mount: failedMount });
      f.session.register({ ...info, id: "other.state", mount: () => ({ view: "other", dispose() {} }) });
      expect(() => f.session.setOpen(true)).not.toThrow(); await f.session.whenSettled();
      expect(failedMount).not.toHaveBeenCalled();
      expect(f.session.snapshot().contributions[0]).toMatchObject({ phase: "failed", error: "factory failed" });
      expect(f.host.mount).toHaveBeenCalledWith(expect.objectContaining({ id: "other.state" }), "other");
      expect(f.onError).toHaveBeenCalledWith(expect.objectContaining({ id: info.id, stage: "mount" }));
      f.session.setOpen(false); f.session.setOpen(true); await f.session.whenSettled();
      expect(failedMount).toHaveBeenCalledTimes(1);
      expect(f.host.mount).toHaveBeenCalledWith(info, "recovered");
    } finally { f.session.dispose(); await f.session.whenSettled(); }
  });

  it("attempts every cleanup and unregisters the tab after an injected abort throws", async () => {
    const first = new AbortController(), second = new AbortController();
    const abortError = new Error("abort failed"), unmountError = new Error("unmount failed"), disposeError = new Error("dispose failed");
    vi.spyOn(first, "abort").mockImplementation(() => { throw abortError; });
    let next = 0;
    const f = fixture("?dev=1", () => [first, second][next++]!);
    const firstDispose = vi.fn(async () => { throw disposeError; }), secondDispose = vi.fn();
    f.host.unmount.mockImplementationOnce(() => { throw unmountError; });
    f.session.register({ ...info, mount: () => ({ view: "first", dispose: firstDispose }) });
    f.session.register({ ...info, id: "other.state", mount: () => ({ view: "second", dispose: secondDispose }) });
    f.session.setOpen(true); await f.session.whenSettled();
    expect(() => f.session.dispose()).not.toThrow(); await f.session.whenSettled();
    f.session.dispose();
    expect(firstDispose).toHaveBeenCalledTimes(1); expect(secondDispose).toHaveBeenCalledTimes(1);
    expect(f.host.unmount).toHaveBeenCalledTimes(2); expect(f.removeTab).toHaveBeenCalledTimes(1);
    expect(second.signal.aborted).toBe(true);
    expect(f.onError).toHaveBeenCalledWith({ id: info.id, stage: "dispose", cause: abortError });
    expect(f.onError).toHaveBeenCalledWith({ id: info.id, stage: "unmount", cause: unmountError });
    expect(f.onError).toHaveBeenCalledWith({ id: info.id, stage: "dispose", cause: disposeError });
  });

  it("retires an injected controller when its factory synchronously disposes the session", async () => {
    const controller = new AbortController(), mount = vi.fn(() => ({ view: "unused", dispose() {} }));
    let disposeSession = (): void => {};
    const f = fixture("?dev=1", () => { disposeSession(); return controller; });
    disposeSession = f.session.dispose;
    f.session.register({ ...info, mount }); f.session.setOpen(true); await f.session.whenSettled();
    expect(controller.signal.aborted).toBe(true); expect(mount).not.toHaveBeenCalled();
    expect(f.host.mount).not.toHaveBeenCalled(); expect(f.removeTab).toHaveBeenCalledTimes(1);
    expect(f.session.disposed).toBe(true);
  });

  it("disposes a malformed returned handle that still owns a disposer", async () => {
    const f = fixture(), dispose = vi.fn();
    f.session.register({ ...info, mount: () => ({ dispose } as unknown as DevViewHandle<string>) });
    f.session.setOpen(true); await f.session.whenSettled();
    expect(dispose).toHaveBeenCalledTimes(1); expect(f.host.mount).not.toHaveBeenCalled();
    expect(f.session.snapshot().contributions[0]).toMatchObject({ phase: "failed", error: "Dev contribution must return a view and disposer." });
    f.session.dispose(); await f.session.whenSettled(); expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("mounts lazily, supplies the existing ports, closes, and mounts a fresh view on reopen", async () => {
    const f = fixture(), disposers: ReturnType<typeof vi.fn>[] = [];
    const mount = vi.fn(({ ports, signal }) => {
      expect(ports).toBe(f.ports); expect(signal.aborted).toBe(false);
      const dispose = vi.fn(); disposers.push(dispose);
      return { view: `view-${disposers.length}`, dispose };
    });
    f.session.register({ ...info, mount });
    expect(mount).not.toHaveBeenCalled();
    f.tab().onOpenChange(true); await f.session.whenSettled();
    expect(f.host.mount).toHaveBeenLastCalledWith(info, "view-1");
    expect(f.session.snapshot().contributions[0].phase).toBe("mounted");
    f.tab().onOpenChange(false); await f.session.whenSettled();
    expect(disposers[0]).toHaveBeenCalledTimes(1); expect(f.host.unmount).toHaveBeenCalledWith(info.id);
    expect(mount.mock.calls[0][0].signal.aborted).toBe(true);
    f.session.setOpen(true); await f.session.whenSettled();
    expect(f.host.mount).toHaveBeenLastCalledWith(info, "view-2");
    f.session.dispose(); f.session.dispose(); await f.session.whenSettled();
    expect(disposers[1]).toHaveBeenCalledTimes(1); expect(f.removeTab).toHaveBeenCalledTimes(1);
    expect(() => f.session.register({ ...info, mount })).toThrow("disposed");
  });

  it("rejects duplicate and malformed stable IDs", () => {
    const f = fixture(), mount = () => ({ view: "", dispose() {} });
    f.session.register({ ...info, mount });
    expect(() => f.session.register({ ...info, mount })).toThrow("Duplicate");
    expect(() => f.session.register({ ...info, id: "../escape", mount })).toThrow("stable safe ID");
    f.session.dispose();
  });

  it("unregisters once and lets the same stable ID be registered again", async () => {
    const f = fixture(), dispose = vi.fn();
    const remove = f.session.register({ ...info, mount: () => ({ view: "first", dispose }) });
    f.session.setOpen(true); await f.session.whenSettled();
    remove(); remove(); await f.session.whenSettled();
    expect(dispose).toHaveBeenCalledTimes(1); expect(f.host.remove).toHaveBeenCalledTimes(1);
    f.session.register({ ...info, mount: () => ({ view: "replacement", dispose() {} }) });
    await f.session.whenSettled(); expect(f.host.mount).toHaveBeenLastCalledWith(info, "replacement");
    f.session.dispose();
  });

  it("keeps registered identity stable when the caller edits its original metadata", () => {
    const f = fixture();
    const contribution = { ...info, mount: () => ({ view: "", dispose() {} }) };
    const remove = f.session.register(contribution);
    contribution.id = "changed.id"; contribution.title = "Changed";
    expect(f.session.snapshot().contributions[0]).toMatchObject(info);
    remove(); expect(f.session.snapshot().contributions).toHaveLength(0);
    expect(f.host.remove).toHaveBeenCalledWith(info.id); f.session.dispose();
  });

  it("cleans stale async results after close and keeps the reopened view", async () => {
    const f = fixture(), finishes: ((handle: DevViewHandle<string>) => void)[] = [];
    const mount = vi.fn(() => new Promise<DevViewHandle<string>>(resolve => { finishes.push(resolve); }));
    f.session.register({ ...info, mount }); f.session.setOpen(true); await Promise.resolve();
    f.session.setOpen(false); f.session.setOpen(true); await Promise.resolve();
    const staleDispose = vi.fn(), freshDispose = vi.fn();
    finishes[1]({ view: "fresh", dispose: freshDispose });
    finishes[0]({ view: "stale", dispose: staleDispose });
    await f.session.whenSettled();
    expect(staleDispose).toHaveBeenCalledTimes(1); expect(freshDispose).not.toHaveBeenCalled();
    expect(f.host.mount).toHaveBeenCalledTimes(1); expect(f.host.mount).toHaveBeenCalledWith(info, "fresh");
    f.session.dispose(); await f.session.whenSettled(); expect(freshDispose).toHaveBeenCalledTimes(1);
  });

  it("cleans late results after session disposal", async () => {
    const f = fixture(); let finish!: (value: DevViewHandle<string>) => void;
    f.session.register({ ...info, mount: () => new Promise(resolve => { finish = resolve; }) });
    f.session.setOpen(true); await Promise.resolve(); f.session.dispose();
    const dispose = vi.fn(); finish({ view: "late", dispose }); await f.session.whenSettled();
    expect(dispose).toHaveBeenCalledTimes(1); expect(f.host.mount).not.toHaveBeenCalled();
  });

  it("isolates rejected mounts and retries on the next reopen", async () => {
    const f = fixture(), mount = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue({ view: "recovered", dispose() {} });
    f.session.register({ ...info, mount }); f.session.setOpen(true); await f.session.whenSettled();
    expect(f.session.snapshot().contributions[0]).toMatchObject({ phase: "failed", error: "unavailable" });
    expect(f.onError).toHaveBeenCalledWith(expect.objectContaining({ id: info.id, stage: "mount" }));
    f.session.setOpen(false); f.session.setOpen(true); await f.session.whenSettled();
    expect(f.host.mount).toHaveBeenCalledWith(info, "recovered"); f.session.dispose();
  });

  it("releases a handle when the host's mount fails and reports disposal errors", async () => {
    const f = fixture(), dispose = vi.fn(async () => { throw new Error("dispose failure"); });
    f.host.mount.mockImplementation(() => { throw new Error("mount failure"); });
    f.session.register({ ...info, mount: () => ({ view: "view", dispose }) }); f.session.setOpen(true); await f.session.whenSettled();
    expect(dispose).toHaveBeenCalledTimes(1); expect(f.host.unmount).toHaveBeenCalledTimes(1);
    expect(f.session.snapshot().contributions[0].phase).toBe("failed");
    expect(f.onError).toHaveBeenCalledWith(expect.objectContaining({ stage: "dispose" })); f.session.dispose();
  });

  it("reports state changes and removes subscriptions at disposal", async () => {
    const f = fixture(), changed = vi.fn(); f.session.subscribe(changed);
    const contribution: DevContribution<typeof f.ports, string> = { ...info, mount: () => ({ view: "", dispose() {} }) };
    f.session.register(contribution); f.session.setOpen(true); await f.session.whenSettled();
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }));
    f.session.dispose(); const calls = changed.mock.calls.length;
    f.session.setOpen(true); await f.session.whenSettled(); expect(changed.mock.calls).toHaveLength(calls);
  });
});
