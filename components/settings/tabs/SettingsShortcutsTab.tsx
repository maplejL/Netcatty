import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, RotateCcw } from "lucide-react";
import type { HotkeyScheme, KeyBinding } from "../../../domain/models";
import {
  DEFAULT_KEY_BINDINGS,
  findKeyBindingConflict,
  isModifierKeyName,
  keyEventToString,
} from "../../../domain/models";
import { useI18n } from "../../../application/i18n/I18nProvider";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { toast } from "../../ui/toast";
import { SectionHeader, Select, SettingsTabContent, SettingRow, Toggle } from "../settings-ui";

export default function SettingsShortcutsTab(props: {
  hotkeyScheme: HotkeyScheme;
  setHotkeyScheme: (scheme: HotkeyScheme) => void;
  shellOnlyTabNumberShortcuts: boolean;
  setShellOnlyTabNumberShortcuts: (enabled: boolean) => void;
  disableTerminalFontZoom: boolean;
  setDisableTerminalFontZoom: (enabled: boolean) => void;
  keyBindings: KeyBinding[];
  updateKeyBinding?: (bindingId: string, scheme: "mac" | "pc", newKey: string) => void;
  resetKeyBinding?: (bindingId: string, scheme?: "mac" | "pc") => void;
  resetAllKeyBindings: () => void;
  setIsHotkeyRecording?: (isRecording: boolean) => void;
}) {
  const {
    hotkeyScheme,
    setHotkeyScheme,
    shellOnlyTabNumberShortcuts,
    setShellOnlyTabNumberShortcuts,
    disableTerminalFontZoom,
    setDisableTerminalFontZoom,
    keyBindings,
    updateKeyBinding,
    resetKeyBinding,
    resetAllKeyBindings,
    setIsHotkeyRecording,
  } = props;
  const { t } = useI18n();

  const [recordingBindingId, setRecordingBindingId] = useState<string | null>(null);
  const [recordingScheme, setRecordingScheme] = useState<"mac" | "pc" | null>(null);

  const cancelRecording = useCallback(() => {
    setRecordingBindingId(null);
    setRecordingScheme(null);
  }, []);

  const getSpecialSuffix = useCallback(
    (bindingId: string): string | null => {
      const binding = keyBindings.find((b) => b.id === bindingId);
      if (!binding) return null;
      const currentKey = hotkeyScheme === "mac" ? binding.mac : binding.pc;
      if (currentKey.includes("[1...9]")) return "[1...9]";
      if (currentKey.includes("arrows")) return "arrows";
      return null;
    },
    [keyBindings, hotkeyScheme],
  );

  useEffect(() => {
    if (!recordingBindingId || !recordingScheme) return;

    const specialSuffix = getSpecialSuffix(recordingBindingId);

    // Track whether a non-modifier was pressed while holding a modifier so that
    // releasing bare Alt/Ctrl can be recorded as FinalShell-style single-key binds.
    let chordUsed = false;

    const commitBinding = (keyString: string) => {
      if (!keyString) return;

      const conflict = findKeyBindingConflict(
        keyBindings,
        recordingBindingId,
        recordingScheme,
        keyString,
      );
      if (conflict) {
        const conflictLabelKey = `settings.shortcuts.binding.${conflict.bindingId}`;
        const conflictLabel =
          t(conflictLabelKey) !== conflictLabelKey ? t(conflictLabelKey) : conflict.label;
        toast.warning(
          t("settings.shortcuts.conflict.message", {
            key: keyString,
            action: conflictLabel,
          }),
          t("settings.shortcuts.conflict.title"),
        );
        // Keep recording so the user can try another combination.
        return;
      }

      updateKeyBinding?.(recordingBindingId, recordingScheme, keyString);
      cancelRecording();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        cancelRecording();
        return;
      }

      if (isModifierKeyName(e.key)) {
        // Wait for keyup for pure modifiers (or a later non-modifier keydown).
        return;
      }

      chordUsed = true;

      if (specialSuffix) {
        const parts: string[] = [];
        if (recordingScheme === "mac") {
          if (e.metaKey) parts.push("⌘");
          if (e.ctrlKey) parts.push("⌃");
          if (e.altKey) parts.push("⌥");
          if (e.shiftKey) parts.push("Shift");
        } else {
          if (e.ctrlKey) parts.push("Ctrl");
          if (e.altKey) parts.push("Alt");
          if (e.shiftKey) parts.push("Shift");
          if (e.metaKey) parts.push("Win");
        }

        const modifierString = parts.length > 0 ? `${parts.join(" + ")} + ` : "";
        commitBinding(modifierString + specialSuffix);
        return;
      }

      commitBinding(keyEventToString(e, recordingScheme === "mac"));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!isModifierKeyName(e.key)) return;
      if (chordUsed) return;

      e.preventDefault();
      e.stopPropagation();

      // Special bindings (arrows / 1-9) still need a real key, not a bare modifier.
      if (specialSuffix) return;

      const isMacScheme = recordingScheme === "mac";
      if (e.key === "Alt") {
        commitBinding(isMacScheme ? "⌥" : "Alt");
        return;
      }
      if (e.key === "Control") {
        commitBinding(isMacScheme ? "⌃" : "Ctrl");
        return;
      }
      if (e.key === "Shift") {
        commitBinding("Shift");
        return;
      }
      if (e.key === "Meta" || e.key === "OS") {
        commitBinding(isMacScheme ? "⌘" : "Win");
      }
    };

    const handleClick = () => {
      cancelRecording();
    };

    const timer = setTimeout(() => {
      window.addEventListener("click", handleClick, true);
    }, 100);

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("click", handleClick, true);
    };
  }, [
    recordingBindingId,
    recordingScheme,
    updateKeyBinding,
    cancelRecording,
    getSpecialSuffix,
    keyBindings,
    t,
  ]);

  useEffect(() => {
    const isRecording = Boolean(recordingBindingId && recordingScheme);
    setIsHotkeyRecording?.(isRecording);
    return () => {
      setIsHotkeyRecording?.(false);
    };
  }, [recordingBindingId, recordingScheme, setIsHotkeyRecording]);

  const categories = useMemo(() => ["tabs", "terminal", "navigation", "app", "sftp"] as const, []);

  return (
    <SettingsTabContent value="shortcuts">
      <SectionHeader title={t("settings.shortcuts.section.scheme")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.shortcuts.scheme.label")}
          description={t("settings.shortcuts.scheme.desc")}
        >
          <Select
            value={hotkeyScheme}
            options={[
              { value: "disabled", label: t("settings.shortcuts.scheme.disabled") },
              { value: "mac", label: t("settings.shortcuts.scheme.mac") },
              { value: "pc", label: t("settings.shortcuts.scheme.pc") },
            ]}
            onChange={(v) => setHotkeyScheme(v as HotkeyScheme)}
            className="w-32"
          />
        </SettingRow>
        <SettingRow
          label={t("settings.shortcuts.disableTerminalFontZoom.label")}
          description={t("settings.shortcuts.disableTerminalFontZoom.desc")}
        >
          <Toggle
            checked={disableTerminalFontZoom}
            onChange={setDisableTerminalFontZoom}
          />
        </SettingRow>
        <SettingRow
          label={t("settings.shortcuts.shellOnlyTabNumberShortcuts.label")}
          description={t("settings.shortcuts.shellOnlyTabNumberShortcuts.desc")}
        >
          <Toggle
            checked={shellOnlyTabNumberShortcuts}
            onChange={setShellOnlyTabNumberShortcuts}
          />
        </SettingRow>
      </div>

      {hotkeyScheme !== "disabled" && (
        <>
          <div className="flex items-center justify-between">
            <SectionHeader title={t("settings.shortcuts.section.custom")} className="mb-0" />
            <Button
              variant="ghost"
              size="sm"
              onClick={resetAllKeyBindings}
              className="text-xs gap-1"
            >
              <RotateCcw size={12} /> {t("settings.shortcuts.resetAll")}
            </Button>
          </div>

          {categories.map((category) => {
            const categoryBindings = keyBindings.filter((kb) => kb.category === category);
            if (categoryBindings.length === 0) return null;
            return (
              <div key={category}>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  {t(`settings.shortcuts.category.${category}`)}
                </h4>
                <div className="space-y-0 divide-y divide-border rounded-lg border bg-card">
                  {categoryBindings.map((binding) => {
                    const currentKey = hotkeyScheme === "mac" ? binding.mac : binding.pc;
                    const specialSuffix = currentKey.includes("[1...9]")
                      ? "[1...9]"
                      : currentKey.includes("arrows")
                        ? "arrows"
                        : null;
                    const isSpecialBinding = !!specialSuffix;

                    const modifierPrefix = isSpecialBinding
                      ? currentKey.replace(specialSuffix!, "").trim().replace(/\+\s*$/, "").trim()
                      : null;

                    const isRecordingThis = recordingBindingId === binding.id;
                    const scheme = hotkeyScheme === "mac" ? "mac" : "pc";

                    return (
                      <div key={binding.id} className="flex items-center justify-between px-4 py-2">
                        <span className="text-sm">{t(`settings.shortcuts.binding.${binding.id}`) !== `settings.shortcuts.binding.${binding.id}` ? t(`settings.shortcuts.binding.${binding.id}`) : binding.label}</span>
                        <div className="flex items-center gap-2">
                          {isSpecialBinding ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRecordingBindingId(binding.id);
                                  setRecordingScheme(scheme);
                                }}
                                className={cn(
                                  "px-2 py-1 text-xs font-mono rounded border transition-colors min-w-[60px] text-center",
                                  isRecordingThis
                                    ? "border-primary bg-primary/10 animate-pulse"
                                    : "border-border hover:border-primary/50",
                                )}
                              >
                                {isRecordingThis
                                  ? t("settings.shortcuts.recording")
                                  : modifierPrefix || t("settings.shortcuts.none")}
                              </button>
                              <span className="text-xs text-muted-foreground">+</span>
                              <span className="px-2 py-1 text-xs font-mono rounded border border-border bg-muted/30 text-muted-foreground">
                                {specialSuffix}
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRecordingBindingId(binding.id);
                                setRecordingScheme(scheme);
                              }}
                              className={cn(
                                "px-2 py-1 text-xs font-mono rounded border transition-colors min-w-[80px] text-center",
                                isRecordingThis
                                  ? "border-primary bg-primary/10 animate-pulse"
                                  : "border-border hover:border-primary/50",
                              )}
                            >
                              {isRecordingThis
                                ? t("settings.shortcuts.recording")
                                : currentKey === "Disabled"
                                  ? t("settings.shortcuts.scheme.disabled")
                                  : currentKey || t("settings.shortcuts.scheme.disabled")}
                            </button>
                          )}
                          {!isSpecialBinding && (
                            <button
                              onClick={() => updateKeyBinding?.(binding.id, scheme, "Disabled")}
                              className="p-1 hover:bg-muted rounded"
                              aria-label={t("settings.shortcuts.setDisabled")}
                            >
                              <Ban size={12} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              const defaults = DEFAULT_KEY_BINDINGS.find((b) => b.id === binding.id);
                              const defaultKey = defaults
                                ? (scheme === "mac" ? defaults.mac : defaults.pc)
                                : null;
                              if (defaultKey) {
                                const conflict = findKeyBindingConflict(
                                  keyBindings,
                                  binding.id,
                                  scheme,
                                  defaultKey,
                                );
                                if (conflict) {
                                  const conflictLabelKey = `settings.shortcuts.binding.${conflict.bindingId}`;
                                  const conflictLabel =
                                    t(conflictLabelKey) !== conflictLabelKey
                                      ? t(conflictLabelKey)
                                      : conflict.label;
                                  toast.warning(
                                    t("settings.shortcuts.conflict.message", {
                                      key: defaultKey,
                                      action: conflictLabel,
                                    }),
                                    t("settings.shortcuts.conflict.title"),
                                  );
                                  return;
                                }
                              }
                              resetKeyBinding?.(binding.id, scheme);
                            }}
                            className="p-1 hover:bg-muted rounded"
                            aria-label={t("settings.shortcuts.resetToDefault")}
                          >
                            <RotateCcw size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </SettingsTabContent>
  );
}
