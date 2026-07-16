/**
 * FinalShell-style floating command history popup over the terminal workspace.
 * Search + keyboard navigation; Enter / double-click paste only (no auto-run), Esc closes.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useI18n } from "../../application/i18n/I18nProvider";
import { cn } from "../../lib/utils";
import { Input } from "../ui/input";
import {
  buildCommandHistoryPopupEntries,
  filterCommandHistoryPopupEntries,
  nextCommandHistorySelectionIndex,
  type CommandHistoryPopupEntry,
} from "./commandHistoryPopupModel";

export interface TerminalCommandHistoryPopupProps {
  open: boolean;
  hostEntries?: Array<{ id: string; command: string; timestamp?: number }>;
  globalEntries?: Array<{
    id: string;
    command: string;
    hostId?: string;
    hostLabel?: string;
    timestamp?: number;
  }>;
  focusedHostId?: string | null;
  loading?: boolean;
  onClose: () => void;
  onPaste: (command: string) => void;
  onOpen?: () => void;
}

const MAX_VISIBLE = 200;

const TerminalCommandHistoryPopupInner: React.FC<TerminalCommandHistoryPopupProps> = ({
  open,
  hostEntries = [],
  globalEntries = [],
  focusedHostId = null,
  loading = false,
  onClose,
  onPaste,
  onOpen,
}) => {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openedOnceRef = useRef(false);

  const sourceEntries = useMemo(
    () =>
      buildCommandHistoryPopupEntries({
        hostEntries,
        globalEntries,
        focusedHostId,
        preferHostOnly: true,
      }),
    [focusedHostId, globalEntries, hostEntries],
  );

  const filtered = useMemo(
    () => filterCommandHistoryPopupEntries(sourceEntries, query, MAX_VISIBLE),
    [query, sourceEntries],
  );

  useEffect(() => {
    if (!open) {
      openedOnceRef.current = false;
      return;
    }
    setQuery("");
    setSelectedIndex(0);
    if (!openedOnceRef.current) {
      openedOnceRef.current = true;
      onOpen?.();
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [onOpen, open]);

  useEffect(() => {
    setSelectedIndex((prev) => {
      if (filtered.length === 0) return 0;
      return Math.min(prev, filtered.length - 1);
    });
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-history-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, selectedIndex]);

  const pasteEntry = useCallback(
    (entry: CommandHistoryPopupEntry | undefined) => {
      if (!entry?.command) return;
      onPaste(entry.command);
      onClose();
    },
    [onClose, onPaste],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) => nextCommandHistorySelectionIndex(prev, 1, filtered.length));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) => nextCommandHistorySelectionIndex(prev, -1, filtered.length));
        return;
      }
      // Enter / Tab: fill into terminal only (never auto-execute).
      if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
        event.preventDefault();
        pasteEntry(filtered[selectedIndex]);
      }
    },
    [filtered, onClose, pasteEntry, selectedIndex],
  );

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-[80] flex items-center justify-center bg-black/25 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-md border border-border/70 bg-background shadow-2xl"
        style={{ maxHeight: "min(70vh, 520px)" }}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label={t("history.popup.title")}
      >
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
          {loading && filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("history.loading")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {query.trim()
                ? t("history.popup.emptyFiltered")
                : t("history.popup.empty")}
            </div>
          ) : (
            filtered.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                data-history-index={index}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-mono leading-snug",
                  index === selectedIndex
                    ? "bg-primary/15 text-foreground"
                    : "text-foreground/90 hover:bg-muted/60",
                )}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => setSelectedIndex(index)}
                onDoubleClick={() => pasteEntry(entry)}
                title={entry.command}
              >
                <span className="min-w-0 flex-1 truncate whitespace-pre">{entry.command}</span>
              </button>
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-border/60 bg-muted/20 px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedIndex(0);
              }}
              placeholder={t("history.popup.searchPlaceholder")}
              className="h-8 pl-8 text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            {t("history.popup.hints")}
          </div>
        </div>
      </div>
    </div>
  );
};

export const TerminalCommandHistoryPopup = memo(TerminalCommandHistoryPopupInner);
TerminalCommandHistoryPopup.displayName = "TerminalCommandHistoryPopup";
