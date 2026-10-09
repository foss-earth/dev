import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
const suppliedController = new AbortController();
Object.defineProperty(globalThis, "AbortController", { configurable: true, get() { throw new Error("Dev read ambient cancellation constructor"); } });
for (const name of ["document", "window", "navigator", "location", "localStorage", "sessionStorage"]) Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error("Pure Dev import read browser global " + name); } });
registerHooks({ resolve(specifier, context, nextResolve) {
  if (/^(?:react(?:-dom)?(?:$|\/)|@babylonjs\/|@foss-earth\/(?:ui|renderer|engine|sky|scenes|360|images)(?:$|\/))/.test(specifier)) throw new Error("Dev root/browser attempted undeclared implementation peer " + specifier);
  return nextResolve(specifier, context);
} });
const core = await import("@foss-earth/dev"), browser = await import("@foss-earth/dev/browser");
assert.equal(core.DEV_PARAMETER, "dev"); assert.equal(core.DEV_TAB_ID, "dev"); assert.equal(typeof browser.createDevBrowserHost, "function");
for (const search of ["", "?dev", "?dev=", "?dev=0", "?dev=true", "?dev=01", "?dev=1&dev=0", "?dev=1&dev=1"]) {
  const calls = [];
  const record = name => () => { calls.push(name); };
  const host = { registerTab() { calls.push("registerTab"); return record("unregisterTab"); }, mount: record("mount"), unmount: record("unmount"), status: record("status"), remove: record("remove") };
  const session = core.createDevSession({ search, ports: {}, host, contributions: [{ id: "host.state", title: "State", owner: "host", mount() { calls.push("factory"); return { view: null, dispose: record("dispose") }; } }] });
  assert.equal(core.wantsDev(search), false); session.setOpen(true); session.dispose(); await session.whenSettled(); assert.deepEqual(calls, []);
}
assert.equal(core.wantsDev("?scene=fixture&dev=1"), true);
let controllerAllocations = 0, mounted = 0, disposed = 0;
const suppliedPorts = {};
const active = core.createDevSession({ search: "?dev=1", ports: suppliedPorts, createAbortController() { controllerAllocations += 1; return suppliedController; }, host: { registerTab: () => () => {}, mount() { mounted += 1; }, unmount() {}, status() {}, remove() {} }, contributions: [{ id: "host.explicit", title: "Explicit", owner: "host", mount({ ports, signal }) { assert.equal(ports, suppliedPorts); assert.equal(signal, suppliedController.signal); return { view: "provided", dispose() { disposed += 1; } }; } }] });
try {
  assert.equal(controllerAllocations, 0); active.setOpen(true); await active.whenSettled();
  assert.equal(controllerAllocations, 1); assert.equal(mounted, 1);
} finally { active.dispose(); await active.whenSettled(); }
assert.equal(suppliedController.signal.aborted, true); assert.equal(disposed, 1);
assert.match(readFileSync(new URL(import.meta.resolve("@foss-earth/dev/panel.css")), "utf8"), /flex-wrap/);
for (const entry of ["@foss-earth/dev", "@foss-earth/dev/browser"]) {
  const code = readFileSync(new URL(import.meta.resolve(entry)), "utf8");
  assert.doesNotMatch(code, /from ["']\.[^"']+(?<!\.js)["']/);
}
await assert.rejects(import("react"), /Cannot find|ERR_MODULE_NOT_FOUND|undeclared implementation peer|Runtime escaped/);
process.stdout.write("Installed Dev pure root/browser/CSS, strict activation and disabled work passed without browser globals or implementation peers.\n");
