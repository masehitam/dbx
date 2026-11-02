// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildNativeMenuGroups, isToolbarCommand, replayShortcut, shortcutToAccelerator } from "../nativeAppMenu";
import { normalizeShortcutSettings } from "@/lib/editor/shortcutRegistry";
import { matchesShortcut, toolbarCommandFromShortcut } from "@/lib/editor/keyboardShortcuts";

const MAC = "MacIntel";

describe("shortcutToAccelerator", () => {
  it("maps Mod/Meta to native names and keeps the rest", () => {
    expect(shortcutToAccelerator("Mod+Enter")).toBe("CmdOrCtrl+Enter");
    expect(shortcutToAccelerator("Shift+Mod+F")).toBe("Shift+CmdOrCtrl+F");
    expect(shortcutToAccelerator("Ctrl+Mod+G")).toBe("Ctrl+CmdOrCtrl+G");
  });

  it("skips shortcuts that would fight text input or cannot be a key equivalent", () => {
    expect(shortcutToAccelerator("Alt+X")).toBeNull();
    expect(shortcutToAccelerator("Tab")).toBeNull();
    expect(shortcutToAccelerator("Mod+K Mod+S")).toBeNull();
  });
});

describe("buildNativeMenuGroups", () => {
  const groups = buildNativeMenuGroups(normalizeShortcutSettings(undefined, MAC), (key) => key, MAC);
  const items = groups.flatMap((group) => group.items);

  it("lists every bound action under a titled scope group", () => {
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.every((group) => group.title && group.items.length)).toBe(true);
    expect(items.find((item) => item.id === "executeSql")?.accelerator).toBe("CmdOrCtrl+Enter");
  });

  it("never assigns one accelerator twice or reuses the static menu's keys", () => {
    const accelerators = items.map((item) => item.accelerator).filter(Boolean);
    expect(new Set(accelerators).size).toBe(accelerators.length);
    expect(accelerators).not.toContain("CmdOrCtrl+W");
    expect(accelerators).not.toContain("CmdOrCtrl+Z");
  });

  it("shows the shortcut in the label when there is no accelerator", () => {
    const withoutAccelerator = items.find((item) => !item.accelerator && !isToolbarCommand(item.id));
    expect(withoutAccelerator?.label).toMatch(/\(.+\)$/);
  });
});

describe("toolbar commands", () => {
  it("are listed without a shortcut, as plain labels", () => {
    const items = buildNativeMenuGroups(normalizeShortcutSettings(undefined, MAC), (key) => key, MAC).flatMap((group) => group.items);
    const newConnection = items.find((item) => item.id === "newConnection");
    expect(newConnection).toEqual({ id: "newConnection", label: "toolbar.newConnection", accelerator: null });
    expect(items.find((item) => item.id === "openDataTransfer")).toBeTruthy();
  });

  it("get an accelerator and a keydown match once the user binds a key", () => {
    const shortcuts = normalizeShortcutSettings({ newConnection: "Mod+Shift+N" }, MAC);
    const items = buildNativeMenuGroups(shortcuts, (key) => key, MAC).flatMap((group) => group.items);
    expect(items.find((item) => item.id === "newConnection")?.accelerator).toBe("CmdOrCtrl+Shift+N");
    const event = new KeyboardEvent("keydown", { key: "n", code: "KeyN", metaKey: true, shiftKey: true });
    expect(toolbarCommandFromShortcut(event, shortcuts)).toBe("newConnection");
    expect(toolbarCommandFromShortcut(new KeyboardEvent("keydown", { key: "n", metaKey: true }), shortcuts)).toBeNull();
  });
});

describe("replayShortcut", () => {
  it("dispatches a keydown the existing matcher recognizes", () => {
    for (const shortcut of ["Mod+Enter", "Shift+Mod+F", "Mod+\\", "Mod+/", "Alt+X"]) {
      let matched = false;
      const target = document.createElement("div");
      target.addEventListener("keydown", (event) => (matched = matchesShortcut(event, shortcut, MAC)));
      replayShortcut(shortcut, MAC, target);
      expect(matched, shortcut).toBe(true);
    }
  });
});
