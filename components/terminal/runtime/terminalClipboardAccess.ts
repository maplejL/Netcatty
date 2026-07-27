/**
 * Terminal clipboard helpers that prefer Electron's main-process clipboard
 * (no gesture / permission quirks) and fall back to navigator.clipboard.
 */
import { netcattyBridge } from "../../../infrastructure/services/netcattyBridge";
import { logger } from "../../../lib/logger";

export async function readTerminalClipboardText(): Promise<string> {
  try {
    const bridge = netcattyBridge.get();
    if (bridge?.readClipboardText) {
      const text = await bridge.readClipboardText();
      if (typeof text === "string") return text;
    }
  } catch (err) {
    logger.warn("[Terminal] Electron clipboard read failed, falling back to navigator", err);
  }

  try {
    return await navigator.clipboard.readText();
  } catch (err) {
    logger.warn("[Terminal] navigator.clipboard.readText failed", err);
    return "";
  }
}

export async function writeTerminalClipboardText(text: string): Promise<boolean> {
  const value = typeof text === "string" ? text : "";
  if (!value) return false;

  try {
    const bridge = netcattyBridge.get();
    if (bridge?.writeClipboardText) {
      const ok = await bridge.writeClipboardText(value);
      if (ok) return true;
    }
  } catch (err) {
    logger.warn("[Terminal] Electron clipboard write failed, falling back to navigator", err);
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (err) {
    logger.warn("[Terminal] navigator.clipboard.writeText failed", err);
    return false;
  }
}
