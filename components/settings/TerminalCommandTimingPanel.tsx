/**
 * Visual panel for recent terminal command latency traces (settings → system).
 */
import { ClipboardCopy, RefreshCw, Search, Trash2, X } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Select, SettingRow } from "./settings-ui";
import { cn } from "../../lib/utils";
import {
  buildTerminalCommandTimingViewModel,
  clearTerminalCommandTimingTraces,
  filterTerminalCommandTimingTraces,
  formatTerminalCommandTimingTrace,
  getTerminalCommandTimingHostKey,
  getTerminalCommandTimingSnapshot,
  getTerminalCommandTimingTraces,
  listTerminalCommandTimingHostOptions,
  refreshTerminalCommandTimingFromStorage,
  subscribeTerminalCommandTiming,
  type TerminalCommandTimingSegmentId,
  type TerminalCommandTimingViewModel,
} from "../terminal/runtime/terminalCommandTiming";

const HOST_FILTER_ALL = "*";

const LIMIT_OPTIONS = [
  { value: "20", label: "20" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "200", label: "200" },
] as const;

const SEGMENT_COLORS: Record<TerminalCommandTimingSegmentId, string> = {
  submit_to_write: "bg-sky-500/85",
  write_to_output: "bg-amber-500/85",
  output_to_render: "bg-violet-500/85",
  render_to_end: "bg-emerald-500/70",
  incomplete: "bg-muted-foreground/30",
};

const SEGMENT_I18N: Record<TerminalCommandTimingSegmentId, string> = {
  submit_to_write: "settings.terminalCommandTiming.segSubmitWrite",
  write_to_output: "settings.terminalCommandTiming.segWriteOutput",
  output_to_render: "settings.terminalCommandTiming.segOutputRender",
  render_to_end: "settings.terminalCommandTiming.segRenderEnd",
  incomplete: "settings.terminalCommandTiming.segIncomplete",
};

function formatMs(ms: number | undefined): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms >= 10_000 ? 1 : 2)}s`;
}

function shortSessionId(sessionId: string): string {
  if (sessionId.length <= 12) return sessionId;
  return `${sessionId.slice(0, 6)}…${sessionId.slice(-4)}`;
}

/**
 * Full text with wrap. Native title + Radix tooltip so long commands/IPs are
 * never permanently hidden on narrow settings layouts.
 */
function HoverFullText({
  text,
  className,
  as: Tag = "span",
  mono = false,
}: {
  text: string;
  className?: string;
  as?: "span" | "code";
  mono?: boolean;
}) {
  if (!text) return null;
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <Tag
          title={text}
          className={cn(
            // block + w-full: avoid flex-item shrinking that clips mid-command
            "block w-full min-w-0 max-w-full break-all whitespace-pre-wrap text-left leading-snug",
            mono && "font-mono",
            className,
          )}
        >
          {text}
        </Tag>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className="max-w-[min(36rem,calc(100vw-2rem))] whitespace-pre-wrap break-all font-mono text-xs"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function bottleneckHint(
  id: TerminalCommandTimingSegmentId | null,
  t: (key: string) => string,
): string | null {
  if (!id || id === "incomplete" || id === "render_to_end") return null;
  if (id === "submit_to_write") return t("settings.terminalCommandTiming.hintSubmitWrite");
  if (id === "write_to_output") return t("settings.terminalCommandTiming.hintWriteOutput");
  if (id === "output_to_render") return t("settings.terminalCommandTiming.hintOutputRender");
  return null;
}

function LatencyBar({
  model,
  t,
}: {
  model: TerminalCommandTimingViewModel;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-1.5">
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/60"
        role="img"
        aria-label={t("settings.terminalCommandTiming.barAria")}
      >
        {model.segments.map((seg) => {
          if (seg.ms <= 0) return null;
          const label = `${t(SEGMENT_I18N[seg.id])}: ${formatMs(seg.ms)}${
            seg.isBottleneck ? ` · ${t("settings.terminalCommandTiming.bottleneck")}` : ""
          }`;
          return (
            <Tooltip key={seg.id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "h-full min-w-[2px] transition-all",
                    SEGMENT_COLORS[seg.id],
                    seg.isBottleneck && "ring-1 ring-inset ring-foreground/40",
                  )}
                  // flex must live on the TooltipTrigger root so stacked widths stay proportional
                  style={{ flexGrow: Math.max(seg.ms, 1), flexShrink: 0, flexBasis: 0 }}
                  title={label}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {label}
              </TooltipContent>
            </Tooltip>
          );
        })}
        {model.segments.every((s) => s.ms <= 0) && (
          <div className="h-full w-full animate-pulse bg-muted-foreground/20" />
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        {model.segments
          .filter((s) => s.ms > 0)
          .map((seg) => (
            <span
              key={seg.id}
              className={cn(
                "inline-flex items-center gap-1",
                seg.isBottleneck && "font-medium text-foreground",
              )}
            >
              <span className={cn("inline-block h-1.5 w-1.5 rounded-full", SEGMENT_COLORS[seg.id])} />
              {t(SEGMENT_I18N[seg.id])} {formatMs(seg.ms)}
            </span>
          ))}
      </div>
    </div>
  );
}

function TraceRow({
  model,
  t,
}: {
  model: TerminalCommandTimingViewModel;
  t: (key: string) => string;
}) {
  const hint = bottleneckHint(model.bottleneckId, t);
  const hostKey = getTerminalCommandTimingHostKey(model);
  // Prefer showing IP/hostname; append label when it differs.
  const hostSecondary =
    model.hostHostname && model.hostLabel && model.hostLabel !== model.hostHostname
      ? model.hostLabel
      : null;
  const hostDisplay = hostSecondary ? `${hostKey} · ${hostSecondary}` : hostKey;
  const hostTitle = [model.hostHostname, model.hostLabel, model.hostId].filter(Boolean).join(" · ");
  return (
    <div
      className={cn(
        "rounded-md border border-border/50 bg-background/40 px-3 py-2.5 space-y-2 overflow-visible",
        model.status === "active" && "border-primary/40",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1 overflow-visible">
          <div className="flex min-w-0 items-start gap-1.5">
            <div className="min-w-0 flex-1 overflow-visible">
              <HoverFullText
                as="code"
                mono
                text={model.command}
                className="text-[12px] text-foreground"
              />
            </div>
            {model.status === "active" && (
              <span className="mt-0.5 shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {t("settings.terminalCommandTiming.statusActive")}
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 text-[10px] text-muted-foreground">
            {hostDisplay && (
              <HoverFullText
                mono
                text={hostDisplay}
                className="text-[10px] text-muted-foreground"
              />
            )}
            {hostTitle && hostTitle !== hostDisplay && (
              <span className="sr-only">{hostTitle}</span>
            )}
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  <span className="cursor-default font-mono text-[10px]" title={model.sessionId}>
                    {shortSessionId(model.sessionId)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[min(36rem,calc(100vw-2rem))] break-all font-mono text-xs">
                  {model.sessionId}
                </TooltipContent>
              </Tooltip>
              {model.endReason && (
                <span className="shrink-0">
                  {t("settings.terminalCommandTiming.endReason")}: {model.endReason}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-sm font-semibold tabular-nums">
            {formatMs(
              model.msTotal
              ?? (model.status === "active" && model.wallSubmit
                ? Math.max(0, Date.now() - model.wallSubmit)
                : undefined)
              ?? model.msFirstRender
              ?? model.msFirstOutput
              ?? model.msWrite,
            )}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {model.msTotal !== undefined
              ? t("settings.terminalCommandTiming.total")
              : t("settings.terminalCommandTiming.partial")}
          </div>
        </div>
      </div>

      <LatencyBar model={model} t={t} />

      {hint && (
        <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400/90">
          {hint}
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground sm:grid-cols-4">
        <span>write {formatMs(model.msWrite)}</span>
        <span>1st out {formatMs(model.msFirstOutput)}</span>
        <span>1st render {formatMs(model.msFirstRender)}</span>
        <span>total {formatMs(model.msTotal)}</span>
      </div>
    </div>
  );
}

export interface TerminalCommandTimingPanelProps {
  enabled: boolean;
}

export const TerminalCommandTimingPanel: React.FC<TerminalCommandTimingPanelProps> = ({
  enabled,
}) => {
  const { t } = useI18n();
  const [limit, setLimit] = useState("50");
  const [hostFilter, setHostFilter] = useState(HOST_FILTER_ALL);
  const [searchQuery, setSearchQuery] = useState("");
  const [version, setVersion] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");

  const bump = useCallback(() => {
    // Main window owns the live buffer; settings window mirrors via localStorage.
    refreshTerminalCommandTimingFromStorage();
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // subscribe also re-hydrates from localStorage (main window writes traces there).
    return subscribeTerminalCommandTiming(bump);
  }, [enabled, bump]);

  // Poll while open: StorageEvent can miss same-process edge cases; keep UI fresh.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(bump, 800);
    return () => window.clearInterval(id);
  }, [enabled, bump]);

  const limitN = Number(limit) || 50;

  const allTraces = useMemo(() => {
    void version;
    return getTerminalCommandTimingTraces(limitN);
  }, [version, limitN]);

  const hostOptions = useMemo(
    () => listTerminalCommandTimingHostOptions(allTraces),
    [allTraces],
  );

  // Drop stale host filter when that host no longer appears in the buffer.
  useEffect(() => {
    if (hostFilter === HOST_FILTER_ALL) return;
    if (!hostOptions.includes(hostFilter)) {
      setHostFilter(HOST_FILTER_ALL);
    }
  }, [hostFilter, hostOptions]);

  const filteredTraces = useMemo(
    () =>
      filterTerminalCommandTimingTraces(allTraces, {
        hostFilter,
        query: searchQuery,
      }),
    [allTraces, hostFilter, searchQuery],
  );

  const models = useMemo(
    () => filteredTraces.map(buildTerminalCommandTimingViewModel).reverse(),
    [filteredTraces],
  );

  const snapshot = useMemo(() => {
    void version;
    return getTerminalCommandTimingSnapshot();
  }, [version]);

  const activeCount = Object.keys(snapshot.activeBySession).length;
  const hasFilters =
    (hostFilter && hostFilter !== HOST_FILTER_ALL) || Boolean(searchQuery.trim());

  const handleClear = useCallback(() => {
    clearTerminalCommandTimingTraces();
    bump();
  }, [bump]);

  const handleCopy = useCallback(async () => {
    const lines = filteredTraces.map(formatTerminalCommandTimingTrace).reverse();
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text || "");
      setCopyState("ok");
    } catch {
      setCopyState("fail");
    }
    window.setTimeout(() => setCopyState("idle"), 1500);
  }, [filteredTraces]);

  if (!enabled) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("settings.terminalCommandTiming.panelDisabled")}
      </p>
    );
  }

  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={100}>
    <div className="space-y-3">
      <SettingRow
        label={t("settings.terminalCommandTiming.recentTitle")}
        description={t("settings.terminalCommandTiming.recentDesc")
          .replace("{n}", String(models.length))
          .replace("{cap}", String(snapshot.capacity))
          .replace("{active}", String(activeCount))}
      >
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select
            value={limit}
            options={LIMIT_OPTIONS.map((o) => ({
              value: o.value,
              label: t("settings.terminalCommandTiming.limitOption").replace("{n}", o.label),
            }))}
            onChange={setLimit}
            className="w-30"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={bump}>
                <RefreshCw size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("settings.system.refresh")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => void handleCopy()}>
                <ClipboardCopy size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {copyState === "ok"
                ? t("settings.terminalCommandTiming.copied")
                : copyState === "fail"
                  ? t("settings.terminalCommandTiming.copyFailed")
                  : t("settings.terminalCommandTiming.copy")}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleClear}
                disabled={allTraces.length === 0}
              >
                <Trash2 size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("settings.terminalCommandTiming.clear")}</TooltipContent>
          </Tooltip>
        </div>
      </SettingRow>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <div className="w-full min-w-0 sm:max-w-[min(100%,280px)] sm:flex-none">
              <Select
                value={hostFilter}
                options={[
                  {
                    value: HOST_FILTER_ALL,
                    label: t("settings.terminalCommandTiming.hostAll"),
                  },
                  ...hostOptions.map((host) => ({ value: host, label: host })),
                ]}
                onChange={setHostFilter}
                className="w-full min-w-0"
              />
            </div>
          </TooltipTrigger>
          {hostFilter !== HOST_FILTER_ALL && (
            <TooltipContent
              side="top"
              className="max-w-[min(28rem,calc(100vw-2rem))] break-all font-mono text-xs"
            >
              {hostFilter}
            </TooltipContent>
          )}
        </Tooltip>
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("settings.terminalCommandTiming.searchPlaceholder")}
            className="h-9 pl-8 pr-8 text-sm"
            aria-label={t("settings.terminalCommandTiming.searchPlaceholder")}
            title={searchQuery || undefined}
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery("")}
              aria-label={t("settings.terminalCommandTiming.clearSearch")}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {(
          [
            "submit_to_write",
            "write_to_output",
            "output_to_render",
            "render_to_end",
          ] as TerminalCommandTimingSegmentId[]
        ).map((id) => (
          <span key={id} className="inline-flex items-center gap-1.5">
            <span className={cn("inline-block h-2 w-2 rounded-sm", SEGMENT_COLORS[id])} />
            {t(SEGMENT_I18N[id])}
          </span>
        ))}
      </div>

      {allTraces.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
          {t("settings.terminalCommandTiming.empty")}
        </div>
      ) : models.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
          {hasFilters
            ? t("settings.terminalCommandTiming.emptyFiltered")
            : t("settings.terminalCommandTiming.empty")}
        </div>
      ) : (
        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-0.5">
          {models.map((model) => (
            <TraceRow key={model.id} model={model} t={t} />
          ))}
        </div>
      )}
    </div>
    </TooltipProvider>
  );
};

export default TerminalCommandTimingPanel;
