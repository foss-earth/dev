// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDevBrowserHost } from "../src/browser.js";
import { createDevSession, type DevTabRegistration } from "../src/index.js";
afterEach(() => { document.body.replaceChildren(); });

describe("optional host-injected browser view", () => {
  it("registers in the supplied host UI and displays only host-owned views", async () => {
    let registration!: DevTabRegistration & { element: HTMLElement };
    const removeTab = vi.fn();
    const browser = createDevBrowserHost({ document, registerTab: tab => { registration = tab; document.body.append(tab.element); return removeTab; } });
    const child = document.createElement("p"); child.textContent = "Existing renderer observations";
    const dispose = vi.fn();
    const session = createDevSession({ search: "?dev=1", ports: {}, host: browser.host, contributions: [{ id: "renderer.state", title: "Renderer", owner: "renderer", mount: () => ({ view: child, dispose }) }] });
    expect(registration.id).toBe("dev"); expect(browser.element.textContent).toContain("Open Dev");
    expect(child.parentElement).toBeNull();
    registration.onOpenChange(true); await session.whenSettled();
    expect(browser.element.textContent).toContain("Existing renderer observations");
    registration.onOpenChange(false); await session.whenSettled();
    expect(child.parentElement).toBeNull(); expect(dispose).toHaveBeenCalledTimes(1);
    session.dispose(); expect(removeTab).toHaveBeenCalledTimes(1); expect(browser.element.children).toHaveLength(0);
  });

  it("has no registered tab or contribution work without the exact activation flag", () => {
    const registerTab = vi.fn(() => () => {}), mount = vi.fn();
    const browser = createDevBrowserHost({ document, registerTab });
    const session = createDevSession({ search: "?dev=true", ports: {}, host: browser.host, contributions: [{ id: "host.state", title: "Host", owner: "host", mount }] });
    session.setOpen(true); expect(registerTab).not.toHaveBeenCalled(); expect(mount).not.toHaveBeenCalled();
    expect(browser.element.children).toHaveLength(0); session.dispose();
  });

  it("keeps supplied labels and errors as text", async () => {
    const browser = createDevBrowserHost({ document, registerTab: () => () => {} });
    const session = createDevSession<unknown, HTMLElement>({ search: "?dev=1", ports: null, host: browser.host, contributions: [{ id: "host.error", title: "<script>title</script>", description: "<img src=x>", owner: "host", mount() { throw new Error("<script>failure</script>"); } }] });
    session.setOpen(true); await session.whenSettled();
    expect(browser.element.querySelector("script, img")).toBeNull();
    expect(browser.element.textContent).toContain("<script>failure</script>"); session.dispose();
  });
});
