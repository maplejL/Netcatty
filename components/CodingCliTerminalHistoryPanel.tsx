import {
  FolderOpen,
  Pin,
  PinOff,
  Radar,
  Rocket,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../application/i18n/I18nProvider';
import {
  filterCodingCliTerminalHistory,
  resolveCodingCliHistoryJumpStatus,
  type CodingCliJumpTier,
  type CodingCliTerminalHistoryEntry,
} from '../domain/codingCliTerminalHistory';
import {
  CODING_CLI_PROVIDERS,
  getCodingCliProvider,
  type CodingCliProviderId,
} from '../domain/codingCliProviders';
import { cn } from '../lib/utils';
import { AgentIconBadge } from './ai/AgentIconBadge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';

export type CodingCliHistoryOpenMode = 'jump' | 'shell';

export type CodingCliHistoryScanResult = {
  matched: number;
  added: number;
  updated: number;
  total: number;
  localMatched?: number;
  externalMatched?: number;
  externalSkippedNoCwd?: number;
  error?: string;
};

export type CodingCliTerminalHistoryPanelProps = {
  /** drawer: right overlay; page: fill vault stage */
  variant?: 'drawer' | 'page';
  open?: boolean;
  entries: CodingCliTerminalHistoryEntry[];
  onClose?: () => void;
  /** Default jump = open cwd + launch coding CLI. shell = cwd only. */
  onOpenEntry: (entry: CodingCliTerminalHistoryEntry, mode?: CodingCliHistoryOpenMode) => void;
  onRemoveEntry: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onClearAll: () => void;
  /** Scan in-app local terminals + external OS coding CLI processes. */
  onScanOpenTerminals?: () => CodingCliHistoryScanResult | void | Promise<CodingCliHistoryScanResult | void>;
  /** Auto-scan once when the panel/page becomes visible. */
  autoScanOnOpen?: boolean;
};

function formatRelativeTime(timestamp: number, now: number): string {
  const deltaSec = Math.max(0, Math.round((now - timestamp) / 1000));
  if (deltaSec < 60) return `${deltaSec}s`;
  const deltaMin = Math.round(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m`;
  const deltaHr = Math.round(deltaMin / 60);
  if (deltaHr < 48) return `${deltaHr}h`;
  const deltaDay = Math.round(deltaHr / 24);
  return `${deltaDay}d`;
}

function jumpStatusLabel(
  t: (key: string, values?: Record<string, string>) => string,
  tier: CodingCliJumpTier,
  resumeCommand?: string,
): { text: string; title?: string } {
  if (tier === 'exact') {
    return {
      text: t('codingCliHistory.status.exact'),
      title: resumeCommand,
    };
  }
  if (tier === 'continue') {
    return { text: t('codingCliHistory.status.continue') };
  }
  return { text: t('codingCliHistory.status.fresh') };
}

const CodingCliTerminalHistoryContent: React.FC<{
  variant: 'drawer' | 'page';
  entries: CodingCliTerminalHistoryEntry[];
  onClose?: () => void;
  onOpenEntry: (entry: CodingCliTerminalHistoryEntry, mode?: CodingCliHistoryOpenMode) => void;
  onRemoveEntry: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onClearAll: () => void;
  onScanOpenTerminals?: () => CodingCliHistoryScanResult | void | Promise<CodingCliHistoryScanResult | void>;
  autoScanOnOpen?: boolean;
  isVisible?: boolean;
}> = ({
  variant,
  entries,
  onClose,
  onOpenEntry,
  onRemoveEntry,
  onTogglePin,
  onClearAll,
  onScanOpenTerminals,
  autoScanOnOpen = true,
  isVisible = true,
}) => {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<CodingCliProviderId | 'all'>('all');
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const didAutoScanRef = useRef(false);
  const now = Date.now();

  const applyScanResult = (result: CodingCliHistoryScanResult | void | null) => {
    if (result && typeof result === 'object') {
      const local = result.localMatched ?? 0;
      const external = result.externalMatched ?? 0;
      let hint = t('codingCliHistory.scanResultDetailed', {
        matched: String(result.matched),
        added: String(result.added),
        updated: String(result.updated),
        local: String(local),
        external: String(external),
      });
      if (result.error) {
        hint = `${hint} · ${t('codingCliHistory.scanError', { error: result.error })}`;
      }
      setScanHint(hint);
      console.info('[codingCliHistory:scan] ui:result', result);
    } else {
      setScanHint(t('codingCliHistory.scanDone'));
    }
  };

  useEffect(() => {
    if (!isVisible) {
      didAutoScanRef.current = false;
      return;
    }
    if (!autoScanOnOpen || !onScanOpenTerminals || didAutoScanRef.current) return;
    didAutoScanRef.current = true;
    let cancelled = false;
    setScanning(true);
    void Promise.resolve(onScanOpenTerminals())
      .then((result) => {
        if (!cancelled) applyScanResult(result);
      })
      .finally(() => {
        if (!cancelled) setScanning(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyScanResult closes over t
  }, [autoScanOnOpen, isVisible, onScanOpenTerminals, t]);

  const handleScanClick = () => {
    if (!onScanOpenTerminals || scanning) return;
    setScanning(true);
    void Promise.resolve(onScanOpenTerminals())
      .then((result) => applyScanResult(result))
      .finally(() => setScanning(false));
  };

  const usedProviderIds = useMemo(() => {
    const ids = new Set(entries.map((entry) => entry.providerId));
    return CODING_CLI_PROVIDERS.filter((provider) => ids.has(provider.id)).map((p) => p.id);
  }, [entries]);

  const filtered = useMemo(
    () => filterCodingCliTerminalHistory(entries, { query, providerId: providerFilter }),
    [entries, providerFilter, query],
  );

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col bg-background',
        variant === 'drawer' && 'h-full w-full max-w-md border-l border-border shadow-2xl',
        variant === 'page' && 'h-full w-full flex-1',
      )}
      onClick={variant === 'drawer' ? (event) => event.stopPropagation() : undefined}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{t('codingCliHistory.title')}</div>
          <div className="text-xs text-muted-foreground">
            {t('codingCliHistory.subtitle')}
          </div>
          {scanHint && (
            <div className="mt-1 text-[11px] text-primary/90">{scanHint}</div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onScanOpenTerminals && (
            <Button
              variant="default"
              size="sm"
              className="h-8 gap-1.5 text-xs active:scale-[0.98]"
              onClick={handleScanClick}
              disabled={scanning}
              title={t('codingCliHistory.scanOpen')}
            >
              <Radar size={14} className={scanning ? 'animate-pulse' : undefined} />
              {scanning ? t('codingCliHistory.scanning') : t('codingCliHistory.scanOpen')}
            </Button>
          )}
          {variant === 'drawer' && onClose && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
              <X size={16} />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Search size={14} className="shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('codingCliHistory.searchPlaceholder')}
            className="h-8"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={providerFilter === 'all'}
            label={t('codingCliHistory.filterAll')}
            onClick={() => setProviderFilter('all')}
          />
          {usedProviderIds.map((providerId) => {
            const provider = getCodingCliProvider(providerId);
            const label = provider?.label ?? providerId;
            return (
              <FilterChip
                key={providerId}
                active={providerFilter === providerId}
                label={label}
                onClick={() => setProviderFilter(providerId)}
              />
            );
          })}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {entries.length === 0
              ? t('codingCliHistory.empty')
              : t('codingCliHistory.emptyFiltered')}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filtered.map((entry) => {
              const provider = getCodingCliProvider(entry.providerId);
              const jumpTier = resolveCodingCliHistoryJumpStatus(entry);
              const status = jumpStatusLabel(t, jumpTier, entry.resumeCommand);
              return (
                <div
                  key={entry.id}
                  className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/40"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    onClick={() => onOpenEntry(entry, 'jump')}
                  >
                    <AgentIconBadge
                      agent={{
                        id: entry.providerId,
                        name: provider?.label,
                        command: provider?.command,
                      }}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {entry.title || provider?.label || entry.providerId}
                        </span>
                        {entry.pinned && (
                          <Pin size={12} className="shrink-0 text-primary" />
                        )}
                      </div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        {entry.cwd}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{provider?.label ?? entry.providerId}</span>
                        <span>·</span>
                        <span>{formatRelativeTime(entry.lastUsedAt, now)}</span>
                        <span>·</span>
                        <span
                          className={cn(
                            'truncate',
                            jumpTier === 'exact' && 'text-primary font-mono',
                            jumpTier === 'continue' && 'text-foreground/80',
                            jumpTier === 'fresh' && 'opacity-70',
                          )}
                          title={status.title || status.text}
                        >
                          {jumpTier === 'exact' && entry.resumeCommand
                            ? entry.resumeCommand
                            : status.text}
                        </span>
                      </div>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-70 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={entry.pinned
                        ? t('codingCliHistory.unpin')
                        : t('codingCliHistory.pin')}
                      onClick={() => onTogglePin(entry.id, !entry.pinned)}
                    >
                      {entry.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-primary"
                      title={t('codingCliHistory.jump')}
                      onClick={() => onOpenEntry(entry, 'jump')}
                    >
                      <Rocket size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={t('codingCliHistory.openShell')}
                      onClick={() => onOpenEntry(entry, 'shell')}
                    >
                      <FolderOpen size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      title={t('codingCliHistory.remove')}
                      onClick={() => onRemoveEntry(entry.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <span className="text-[11px] text-muted-foreground">
          {t('codingCliHistory.count', { n: String(entries.length) })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          disabled={entries.length === 0}
          onClick={onClearAll}
        >
          {t('codingCliHistory.clearAll')}
        </Button>
      </div>
    </div>
  );
};

const CodingCliTerminalHistoryPanelInner: React.FC<CodingCliTerminalHistoryPanelProps> = ({
  variant = 'drawer',
  open = true,
  entries,
  onClose,
  onOpenEntry,
  onRemoveEntry,
  onTogglePin,
  onClearAll,
  onScanOpenTerminals,
  autoScanOnOpen = true,
}) => {
  if (variant === 'drawer') {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
        <CodingCliTerminalHistoryContent
          variant="drawer"
          entries={entries}
          onClose={onClose}
          onOpenEntry={onOpenEntry}
          onRemoveEntry={onRemoveEntry}
          onTogglePin={onTogglePin}
          onClearAll={onClearAll}
          onScanOpenTerminals={onScanOpenTerminals}
          autoScanOnOpen={autoScanOnOpen}
          isVisible={open}
        />
      </div>
    );
  }

  return (
    <CodingCliTerminalHistoryContent
      variant="page"
      entries={entries}
      onOpenEntry={onOpenEntry}
      onRemoveEntry={onRemoveEntry}
      onTogglePin={onTogglePin}
      onClearAll={onClearAll}
      onScanOpenTerminals={onScanOpenTerminals}
      autoScanOnOpen={autoScanOnOpen}
      isVisible
    />
  );
};

const FilterChip: React.FC<{
  active: boolean;
  label: string;
  onClick: () => void;
}> = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
      active
        ? 'border-primary/40 bg-primary/10 text-foreground'
        : 'border-border text-muted-foreground hover:bg-muted/50',
    )}
  >
    {label}
  </button>
);

export const CodingCliTerminalHistoryPanel = memo(CodingCliTerminalHistoryPanelInner);
CodingCliTerminalHistoryPanel.displayName = 'CodingCliTerminalHistoryPanel';

/** Vault section page alias (same component, page layout). */
export default CodingCliTerminalHistoryPanel;
