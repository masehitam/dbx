// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildNativeMenuGroups, replayShortcut, shortcutToAccelerator } from "../nativeAppMenu";
import { normalizeShortcutSettings } from "@/lib/editor/shortcutRegistry";
import { matchesShortcut } from "@/lib/editor/keyboardShortcuts";

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
    const withoutAccelerator = items.find((item) => !item.accelerator);
    expect(withoutAccelerator?.label).toMatch(/\(.+\)$/);
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
