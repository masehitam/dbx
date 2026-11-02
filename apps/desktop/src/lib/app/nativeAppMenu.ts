import { SHORTCUT_DEFINITIONS, formatShortcut, type ShortcutActionId, type ShortcutScope, type ShortcutSettings } from "@/lib/editor/shortcutRegistry";
import { parseShortcutStrokes } from "@/lib/editor/shortcutDisplay";

// Mirrors the shortcut registry into the macOS menu bar (src-tauri/src/lib.rs
// build_app_menu_actions_submenu) so actions show their key equivalents and
// are found by Help → Search. Clicking an item replays the shortcut into the
// web view, so every existing keydown handler keeps deciding what it does.

export interface NativeMenuAction {
  id: ShortcutActionId;
  label: string;
  accelerator: string | null;
}

export interface NativeMenuGroup {
  title: string;
  items: NativeMenuAction[];
}

const SCOPE_ORDER: ShortcutScope[] = ["global", "editor", "grid", "sidebar", "search", "debug"];

// Key equivalents the static native menu already owns (Quit, Close Tab, the
// predefined Edit/View/Window items, Hide / Hide Others).
const NATIVE_MENU_SHORTCUTS = new Set(["Mod+Q", "Mod+W", "Mod+Z", "Mod+Shift+Z", "Mod+X", "Mod+C", "Mod+V", "Mod+A", "Mod+H", "Alt+Mod+H", "Mod+M", "Ctrl+Mod+F"].map(canonical));

export function shortcutScopeLabelKey(scope: ShortcutScope): string {
  if (scope === "debug") return "plDebug.start.title";
  return `settings.shortcutScope${scope[0].toUpperCase()}${scope.slice(1)}`;
}

function canonical(shortcut: string): string {
  const parts = parseShortcutStrokes(shortcut)[0] ?? [];
  const key = (parts[parts.length - 1] ?? "").toLowerCase();
  return [...parts.slice(0, -1).sort(), key].join("+");
}

/**
 * Native accelerator for a single-stroke shortcut, or null when it should not
 * become a menu key equivalent. Only ⌘/⌃ combos qualify: an Option-only or
 * plain key equivalent would compete with text input in the web view.
 */
export function shortcutToAccelerator(shortcut: string): string | null {
  const strokes = parseShortcutStrokes(shortcut);
  if (strokes.length !== 1) return null;
  const parts = strokes[0];
  const modifiers = parts.slice(0, -1);
  if (!modifiers.some((part) => part === "Mod" || part === "Meta" || part === "Ctrl")) return null;
  return parts.map((part) => (part === "Mod" ? "CmdOrCtrl" : part === "Meta" ? "Cmd" : part === "Plus" ? "=" : part)).join("+");
}

export function buildNativeMenuGroups(shortcuts: ShortcutSettings, t: (key: string) => string, platform = globalThis.navigator?.platform || ""): NativeMenuGroup[] {
  const taken = new Set(NATIVE_MENU_SHORTCUTS);
  return SCOPE_ORDER.map((scope) => ({
    title: t(shortcutScopeLabelKey(scope)),
    items: SHORTCUT_DEFINITIONS.filter((definition) => definition.scope === scope && definition.inputKind !== "modifier-only" && shortcuts[definition.id]).map((definition) => {
      const shortcut = shortcuts[definition.id];
      const key = canonical(shortcut);
      // Scopes reuse keys (⌘D in editor and grid); only the first keeps the accelerator.
      const accelerator = taken.has(key) ? null : shortcutToAccelerator(shortcut);
      if (accelerator) taken.add(key);
      const label = t(definition.labelKey);
      return { id: definition.id, label: accelerator ? label : `${label}  (${formatShortcut(shortcut, platform)})`, accelerator };
    }),
  })).filter((group) => group.items.length > 0);
}

function keyboardInitForStroke(parts: string[], isMac: boolean): KeyboardEventInit {
  const modifiers = new Set(parts.slice(0, -1));
  const last = parts[parts.length - 1] ?? "";
  const key = last === "Plus" ? "+" : last.length === 1 ? last.toLowerCase() : last;
  const code = /^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : /^[0-9]$/.test(key) ? `Digit${key}` : key === "/" ? "Slash" : key === "\\" ? "Backslash" : key;
  return {
    key,
    code,
    metaKey: modifiers.has("Meta") || (modifiers.has("Mod") && isMac),
    ctrlKey: modifiers.has("Ctrl") || (modifiers.has("Mod") && !isMac),
    altKey: modifiers.has("Alt"),
    shiftKey: modifiers.has("Shift"),
    bubbles: true,
    cancelable: true,
    composed: true,
  };
}

/**
 * Dispatches the shortcut's key strokes at the focused element, exactly as if
 * typed. A native menu key equivalent only fires when the web view left the
 * key unhandled, so replaying it here cannot run an action twice.
 */
export function replayShortcut(shortcut: string, platform = globalThis.navigator?.platform || "", target: EventTarget = document.activeElement ?? document.body): void {
  const isMac = platform.toLowerCase().includes("mac");
  for (const stroke of parseShortcutStrokes(shortcut)) {
    target.dispatchEvent(new KeyboardEvent("keydown", keyboardInitForStroke(stroke, isMac)));
  }
}
