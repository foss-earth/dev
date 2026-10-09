import { createDevSession, wantsDev, DEV_TAB_ID, type DevContribution, type DevHostPort, type DevSession, type DevSnapshot, type DevViewHandle } from "@foss-earth/dev";
import { createDevBrowserHost, type DevBrowserHostOptions } from "@foss-earth/dev/browser";
interface Ports { inspect(): Readonly<{ resources: number }>; }
const ports: Ports = { inspect: () => ({ resources: 1 }) };
const host: DevHostPort<string> = { registerTab: () => () => {}, mount() {}, unmount() {}, status() {}, remove() {} };
const contribution: DevContribution<Ports, string> = { id: "host.resources", title: "Resources", owner: "host", mount({ ports: same, signal }) { const value = same.inspect(); const handle: DevViewHandle<string> = { view: String(value.resources) + String(signal.aborted), dispose() {} }; return handle; } };
const session: DevSession<Ports, string> = createDevSession({ search: "?dev=1", ports, host, createAbortController: () => new AbortController(), contributions: [contribution] });
const snapshot: DevSnapshot = session.snapshot(); const remove = session.subscribe(next => { void next.open; }); remove(); session.dispose();
function suppliedBrowser(document: Document, registerTab: DevBrowserHostOptions["registerTab"]) { return createDevBrowserHost({ document, registerTab }); }
void suppliedBrowser; void snapshot; wantsDev("?dev=1"); void DEV_TAB_ID;
