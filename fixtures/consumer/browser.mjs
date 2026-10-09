import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const core = await import("@foss-earth/dev"), browser = await import("@foss-earth/dev/browser");
const dom = new JSDOM("<!doctype html><main></main>", { url: "https://host.test/" });
const page = dom.window.document, tabs = [], actions = [], disposals = [];
const framePort = Object.fromEntries(["requestRender", "startServer", "startCapture", "startBenchmark", "startSimulation"].map(name => [name, () => { actions.push(name); }]));
const cancellationControllers = [];
const createAbortController = () => { const controller = new dom.window.AbortController(); cancellationControllers.push(controller); return controller; };
let reportOpen, mounts = 0, late, session;
try {
  const adapter = browser.createDevBrowserHost({ document: page, registerTab(tab) { tabs.push(tab.id); reportOpen = tab.onOpenChange; page.querySelector("main").append(tab.element); return () => { tab.element.remove(); tabs.push("removed"); }; } });
  const contribution = { id: "host.state", owner: "fixture", title: "Host state", mount({ ports, signal }) {
    assert.equal(ports, framePort); assert.equal(signal.aborted, false); mounts += 1;
    assert.equal(signal, cancellationControllers.at(-1).signal);
    const view = page.createElement("p"); view.textContent = "Mount " + mounts;
    const handle = { view, dispose() { disposals.push(view.textContent); } };
    if (mounts === 2) return new Promise(resolve => { late = () => resolve(handle); });
    return handle;
  } };
  const disabled = core.createDevSession({ search: "", ports: framePort, host: adapter.host, createAbortController, contributions: [contribution] });
  disabled.setOpen(true); disabled.dispose(); await disabled.whenSettled(); assert.deepEqual(tabs, []); assert.equal(mounts, 0);
  assert.equal(cancellationControllers.length, 0);
  session = core.createDevSession({ search: "?dev=1", ports: framePort, host: adapter.host, createAbortController, contributions: [contribution] });
  assert.deepEqual(tabs, ["dev"]); assert.equal(mounts, 0); reportOpen(true); await session.whenSettled(); assert.equal(mounts, 1);
  assert.match(adapter.element.textContent, /Mount 1/); reportOpen(false); await session.whenSettled(); assert.deepEqual(disposals, ["Mount 1"]);
  reportOpen(true); await Promise.resolve(); assert.equal(mounts, 2); session.dispose(); late(); await session.whenSettled();
  assert.deepEqual(disposals, ["Mount 1", "Mount 2"]); assert.deepEqual(tabs, ["dev", "removed"]); assert.deepEqual(actions, []); assert.equal(adapter.element.children.length, 0);
  assert.equal(adapter.element.ownerDocument, page);
  assert.equal(cancellationControllers.length, 2); assert.equal(cancellationControllers.every(controller => controller.signal.aborted), true);
  process.stdout.write("Installed Dev explicit Document host lifecycle, lazy/close/reopen/late-dispose and no implicit actions passed.\n");
} finally {
  session?.dispose(); late?.(); if (session) await session.whenSettled(); dom.window.close();
}
