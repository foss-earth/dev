# @foss-earth/dev

Staging candidate **0.1.0** supplies the shared `?dev=1` activation and
diagnostic view lifecycle. Each host contributes its own observation views
and passes its existing authorities through explicit ports. No feature
diagnostic catalogue, app identity or runtime is imported by Dev.


The pure root exports `DEV_PARAMETER`, `DEV_TAB_ID`, `wantsDev`,
`createDevSession` and contribution/lifecycle/host-port types. Importing it
reads no document, location or React globals. `wantsDev(search)` accepts
exactly one `dev=1` parameter. Missing, empty, zero, truthy text and duplicate
parameters leave Dev inactive.

Without activation, no Dev tab is registered and no contribution factory or
host presentation port is invoked. With activation, the host's existing UI
registry receives the single stable tab ID `dev`. Factories remain lazy until
the host reports the tab open. Current tabs and their context rules retain
their owners; Dev does not rename Debug, move Renderer performance controls
or create another settings home.

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

`DevHostPort` provides `registerTab`, `mount`, `unmount`, `status` and
`remove`. `registerTab({id, title, onOpenChange})` returns its unregister
callback. Report real visibility through `onOpenChange(true/false)`;
closing or hiding Dev cancels every mounting factory, detaches mounted views
and disposes them exactly once. Reopening creates fresh views. The same
`ports` object reaches each mount by reference. Dev creates no second
registry, renderer, frame scheduler or clock.

Supply `createAbortController` to construct each mount's cancellation controller
in the host's environment. It is called only for an activated, open contribution;
disabled sessions and import create none. Omitting it preserves the legacy native
constructor. A factory failure is isolated to that contribution, and a throwing
abort still permits all view and tab cleanup. The Earth host must supply this
factory explicitly when integrating Dev.

Contributions have caller-owned stable IDs, title/owner metadata and a lazy
`mount({ports, signal})` returning `{view, dispose}` or a Promise of that
handle. A contribution can be registered or unregistered while the tab is
open. Duplicate IDs are rejected. A cancelled/stale async completion is
disposed without attaching; it cannot replace a newer view. Mount failures
are isolated and reported, and reopening retries failed views. Host mount
failures also detach and dispose partial work. Cleanup errors are reported
without preventing other cleanup. `whenSettled()` awaits outstanding mounts
and cleanup for shutdown or tests; it does not start a loop or impose an
unrequested timeout.

Factories create observation views only. Opening Dev never starts a server,
capture, benchmark or independent simulation loop. Any requested action
belongs to an explicit host-owned control and callback; registration and
visibility never synthesize such an action. Existing feature diagnostics
continue to use their current feature-owned controls and resource budgets.

The separate `/browser` entry exports `createDevBrowserHost` with an explicit
`document` and host `registerTab` port. It presents contributed HTML elements,
readiness/errors and wrapping sections. It imports no UI package or browser
singleton, and initializes DOM only when explicitly called. This adapter
does not create a window manager or mount React. `/panel.css` supplies its
optional paragraph-grid presentation.

Build emits ESM JavaScript and declarations with `.js` relative imports.
The same exact installed tools as About are pinned; no untested OS/Node
support range is claimed. After the primary's heavy-slot grant, install the exact reviewed CI/dev tools
and prepare the explicit archive inputs described below. No source check or
consumer check ran during this source-only renewal.

The tests cover strict activation, disabled work, duplicate IDs, lazy
mounting, explicit ports, close/reopen/dispose, stale/rejected async work,
failure cleanup, subscriptions and browser presentation. The guarded installed public
consumer imports root/browser entries without a DOM or implementation peers,
verifies disabled Dev mounts nothing, and exercises supplied-document lifecycle
through the explicit jsdom closure. Checks have not yet run in this staging lane.

Current source remains intact. Hosts can retain their existing composition
until an exact built artifact and their adoption checks are accepted. Dev
was specified as a new contribution framework; it was absent from the
committed 13-tab shared inventory. Source behavior inspection and license
provenance are recorded in `SOURCE_PROVENANCE.json`. Release lineage,
attribution conformance and remote admission remain coordinator gates.


## Mandatory exact installed-consumer inputs

The consumer requires Dev **0.1.0**, TypeScript **5.9.3**, jsdom **29.1.1** and every required jsdom dependency/peer in `fixtures/consumer/dependency-plan.json`. The plan has exact current installed-tool metadata versions; it is an unqualified prerequisite list, not archive pins or experiment evidence. The manifest shape is `fixtures/consumer/archive-input.schema.json`; `archive-input.example.json` is deliberately noninstallable until actual archive names, SHA256, sizes and paths are supplied. No archive is packed by the harness and no ancestor `node_modules`, source path or installed source link is an input.

The primary/platform stages every actual reviewed archive and a completed manifest inside this owner's ignored `build/`, then supplies:

```sh
DEV_CONSUMER_ARCHIVES=build/consumer-inputs/<run>/archives.json npm run check:implementation
npm run check:conformance
```

`check:implementation` retains lint, incremental typecheck, bounded existing Vitest, build and the new installed archive harness. The archive must have been packed separately from the exact already-built candidate after a grant; it is mandatory even for Dev itself. A current archive cannot be fabricated by importing this source checkout. If the build step changes output bytes, the supplied archive will be rejected, and the primary must prepare a matching archive before running the affected consumer step. The whole implementation suite needs only one successful final run; source preparation executes none of these commands. The harness may also be invoked as `node scripts/check-installed-artifact.mjs --archives-file=build/consumer-inputs/<run>/archives.json`.

`--archives-file` or `DEV_CONSUMER_ARCHIVES` is mandatory. Each record has exact `name`, `version`, `archive`, `sha256` and `sizeBytes`, and the manifest seals the exact dependency-plan SHA256. The harness verifies archive metadata/required dependency closure, rejects source links/bundled unknown packages/traversal, stages immutable archive copies, and refuses old Dev0.1.0 bytes when current published source/build bytes differ. Optional native `canvas` is excluded; Dev has no runtime/React/UI/renderer implementation peer.

Each run uses a fresh dated owner `build/consumer/` workspace, cache, temporary directory and retained logs, with sanitized `NODE_PATH`, `NODE_OPTIONS` and npm user/global configuration. First it installs only Dev and TypeScript from exact files offline with scripts disabled; root/browser imports run while browser globals throw and undeclared implementation peers are poisoned. It compiles actual installed public declarations strictly with `skipLibCheck: false` and no ambient types. Then it installs the complete exact jsdom archive closure, checks installed package identities, and runs supplied-document lifecycle fixtures. Realpath guards apply to every runtime dependency and every TypeScript transitive source file. Ancestor-file/package and outside-declaration negative controls must demonstrate rejection before a passing receipt is emitted. CSS is resolved through the public export.

Existing unit-test assertions remain unchanged for disabled/exact activation, laziness, ID stability, close/reopen/unregister, stale/rejected/late asynchronous disposal, cleanup failures and host subscriptions. The installed fixture retains disabled, shared-port identity, lazy/close/reopen/late-dispose and no implicit actions assertions. Its DOM closes in `finally`; it launches no Chrome/browser, server, GPU, native build, benchmark, capture or simulation. New fixtures and tools remain source-only, unrun and unqualified. `SOURCE_RECEIPT.json` records current digests; old preparation/harness/receipts stay retained under ignored build.

The unconditional attribution caller and descriptor still use CI revision `9e046dd482e0229dc7c7b2d71b079d5905664656`, archive SHA256 `450ede699f55f9b9c78146eadb73de7c6297e56553e7d7f9e5b164786a7beb24`, and policy SHA256 `9ca88bf5861685e22e65e5f39fa65b05faaf9c218875fccbecce1b9f2dca5bd3`. `check:conformance` invokes the actual installed shared component; no checker is duplicated. All metadata including docs-only changes follows that same gate. Exact candidate/artifact pins, full intended-ref audit, actual hosted admission, public-source availability and Earth/Flight/Campus adoption remain primary/coordinator gates. No broad Node/OS/browser/device range is inferred from Node `registerHooks` or jsdom; the granted actual tool/runtime must qualify this harness.

## Project policies

- [Code of conduct](CODE_OF_CONDUCT.md)
- [Contributing](CONTRIBUTING.md)
- [AGPL-3.0 license](LICENSE)
- [Security](SECURITY.md)
