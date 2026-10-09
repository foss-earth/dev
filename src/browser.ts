import type { DevContributionInfo, DevContributionStatus, DevHostPort, DevTabRegistration } from "./types.js";

/** The application supplies its one UI tab registry and its document explicitly. */
export interface DevBrowserHostOptions {
  document: Document;
  registerTab(tab: DevTabRegistration & { element: HTMLElement }): () => void;
}
export interface DevBrowserHost { element: HTMLElement; host: DevHostPort<HTMLElement> }

/** Optional DOM presentation. Importing this entry reads no browser globals. */
export function createDevBrowserHost(options: DevBrowserHostOptions): DevBrowserHost {
  const page = options.document;
  const element = page.createElement("div");
  element.className = "foss-earth-dev";
  element.setAttribute("aria-label", "Dev");
  const sections = new Map<string, { element: HTMLElement; body: HTMLElement; status: HTMLElement }>();
  function section(info: DevContributionInfo) {
    let existing = sections.get(info.id);
    if (!existing) {
      const wrapper = page.createElement("section");
      wrapper.className = "foss-earth-dev__section";
      wrapper.dataset.contributionId = info.id;
      const title = page.createElement("h3"); title.textContent = info.title;
      const body = page.createElement("div"); body.className = "foss-earth-dev__body";
      const status = page.createElement("p"); status.className = "foss-earth-dev__status"; status.setAttribute("role", "status");
      wrapper.append(title);
      if (info.description) { const description = page.createElement("p"); description.textContent = info.description; wrapper.append(description); }
      wrapper.append(status, body); element.append(wrapper);
      existing = { element: wrapper, body, status }; sections.set(info.id, existing);
    }
    return existing;
  }
  const host: DevHostPort<HTMLElement> = {
    registerTab(tab) {
      const removeTab = options.registerTab({ ...tab, element });
      return () => { try { removeTab(); } finally { element.replaceChildren(); sections.clear(); } };
    },
    mount(info, view) { section(info).body.replaceChildren(view); },
    unmount(id) { sections.get(id)?.body.replaceChildren(); },
    status(info: DevContributionStatus) {
      const state = section(info).status;
      state.textContent = info.phase === "failed" ? `Unavailable: ${info.error ?? "view failed"}` : info.phase === "mounting" ? "Preparing view" : info.phase === "idle" ? "Open Dev to show this view" : "";
      state.hidden = info.phase === "mounted";
    },
    remove(id) { sections.get(id)?.element.remove(); sections.delete(id); },
  };
  return { element, host };
}
