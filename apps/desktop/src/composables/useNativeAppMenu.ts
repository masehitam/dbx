import { onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "@/stores/settingsStore";
import { normalizeShortcutSettings, type ShortcutActionId } from "@/lib/editor/shortcutRegistry";
import { buildNativeMenuGroups, replayShortcut } from "@/lib/app/nativeAppMenu";
import { isTauriRuntime } from "@/lib/backend/tauriRuntime";
import { isMacOS } from "@/lib/backend/platform";

/** Keeps the macOS "Actions" menu in sync with the user's shortcuts and UI language. */
export function useNativeAppMenu() {
  if (!isTauriRuntime() || !isMacOS()) return;
  const settingsStore = useSettingsStore();
  const { t, locale } = useI18n();
  const shortcuts = () => normalizeShortcutSettings(settingsStore.editorSettings.shortcuts);

  const stopWatch = watch(
    [shortcuts, locale],
    async ([current]) => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_app_menu_actions", { groups: buildNativeMenuGroups(current, t) }).catch((error) => console.warn("[DBX][native-menu]", error));
    },
    { immediate: true },
  );

  let unlisten: (() => void) | null = null;
  let disposed = false;
  void import("@tauri-apps/api/event").then(({ listen }) =>
    listen<ShortcutActionId>("dbx-app-menu-action", (event) => {
      const shortcut = shortcuts()[event.payload];
      if (shortcut) replayShortcut(shortcut);
    }).then((handle) => {
      if (disposed) handle();
      else unlisten = handle;
    }),
  );

  onBeforeUnmount(() => {
    disposed = true;
    stopWatch();
    unlisten?.();
  });
}
