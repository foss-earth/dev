# @foss-earth/dev

The library behind FOSS Earth's Dev tab. It handles `?dev=1` activation and the
lifecycle of diagnostic views. Each host app contributes its own observation
views and passes in its existing data sources as explicit ports. Dev imports no
feature diagnostics, app identity or runtime.

## Exports

The root export provides `DEV_PARAMETER`, `DEV_TAB_ID`, `wantsDev`,
`createDevSession` and the contribution, lifecycle and host-port types.
Importing it reads no document, location or React globals.

`wantsDev(search)` accepts exactly one `dev=1` parameter. A missing, empty,
zero or other value, or a duplicated parameter, leaves Dev inactive.

`@foss-earth/dev/browser` exports `createDevBrowserHost`. It takes an explicit
`document` and a host `registerTab` port, and presents contributed HTML
elements, readiness and errors in wrapping sections. It imports no UI package
or browser singleton, touches the DOM only when called, and neither creates a
window manager nor mounts React.

`@foss-earth/dev/panel.css` is optional styling for that adapter (a paragraph
grid).

## Usage

```ts
import { createDevSession } from "@foss-earth/dev";

const dev = createDevSession({
  search: host.search,
  ports: host.existingObservations,
  host: host.devTabAdapter,
  createAbortController: () => new AbortController(),
  contributions: [{
    id: "renderer.resources",
    owner: "renderer",
    title: "Resources",
    mount: ({ ports, signal }) => host.createResourceView(ports, signal),
  }],
  onError: error => host.reportDevError(error),
});
```

Without activation, no Dev tab is registered and no contribution factory or
host presentation port is called. With activation, the host's UI registry
receives a single tab with the stable ID `dev`. Existing tabs keep their
owners: Dev does not rename Debug, move renderer performance controls or add a
settings home.

### Host port

`DevHostPort` provides `registerTab`, `mount`, `unmount`, `status` and
`remove`. `registerTab({id, title, onOpenChange})` returns an unregister
callback. The host reports real visibility through `onOpenChange(true/false)`.

Closing or hiding Dev cancels every mount in progress, detaches mounted views
and disposes each exactly once. Reopening creates fresh views. Every mount
receives the same `ports` object by reference.

`createAbortController` builds each mount's cancellation controller in the
host's environment. It is called only for an activated, open contribution.
If omitted, the native `AbortController` is used.

### Contributions

A contribution has a caller-chosen stable `id`, `title` and `owner` metadata,
and a lazy `mount({ports, signal})` that returns `{view, dispose}` or a
Promise of that handle.

- Factories run only after the host reports the tab open.
- Contributions can be registered or unregistered while the tab is open.
- Duplicate IDs are rejected.
- An async mount that finishes after cancellation is disposed without being
  attached, and cannot replace a newer view.
- A failing factory is isolated, reported through `onError` and retried on
  reopen. A failed host mount also detaches and disposes partial work.
- Cleanup errors are reported and do not stop other cleanup. A throwing abort
  still allows all view and tab cleanup.
- `whenSettled()` waits for outstanding mounts and cleanup, for shutdown or
  tests. It starts no loop and sets no timeout.

Factories create observation views only. Opening Dev never starts a server,
capture, benchmark or simulation loop. Any action belongs in an explicit
host-owned control. Dev creates no registry, renderer, frame scheduler or clock
of its own.

## Development

Build output is ESM JavaScript with declarations. The package has no
`@foss-earth/*` dependencies. Scripts from `package.json`:

```sh
npm install
npm test            # vitest
npm run typecheck
npm run lint
npm run build
```

The tests cover activation, disabled sessions, duplicate IDs, lazy mounting,
ports, close/reopen/dispose, stale and rejected async work, failure cleanup,
subscriptions and the browser adapter (using jsdom).

## Project policies

- [Code of conduct](https://github.com/foss-earth/.github/blob/main/CODE_OF_CONDUCT.md)
- [Contributing](https://github.com/foss-earth/.github/blob/main/CONTRIBUTING.md)
- [AGPL-3.0 license](LICENSE)
- [Security](https://github.com/foss-earth/.github/blob/main/SECURITY.md)
