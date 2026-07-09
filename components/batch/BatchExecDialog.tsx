import { CheckCircle2, Loader2, TerminalSquare, XCircle } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { useTerminalBackend } from '../../application/state/useTerminalBackend';
import type { BatchExecHostResult } from '../../domain/batchExec';
import { createInitialBatchExecResult } from '../../domain/batchExec';
import type { Host, Identity, SSHKey } from '../../domain/models';
import { runBatchExecForHosts } from '../../application/state/batchExecRunner';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { Textarea } from '../ui/textarea';

export interface BatchExecDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hosts: Host[];
  keys: SSHKey[];
  identities: Identity[];
}

const statusIcon = (status: BatchExecHostResult['status']) => {
  if (status === 'running') {
    return <Loader2 size={14} className="animate-spin text-primary" />;
  }
  if (status === 'success') {
    return <CheckCircle2 size={14} className="text-green-500" />;
  }
  if (status === 'error' || status === 'skipped') {
    return <XCircle size={14} className="text-destructive" />;
  }
  return <span className="inline-block h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />;
};

export const BatchExecDialog: React.FC<BatchExecDialogProps> = ({
  open,
  onOpenChange,
  hosts,
  keys,
  identities,
}) => {
  const { t } = useI18n();
  const { execCommand, execAvailable } = useTerminalBackend();
  const [command, setCommand] = useState('');
  const [results, setResults] = useState<BatchExecHostResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedHostIds, setExpandedHostIds] = useState<Set<string>>(new Set());
  const runIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setCommand('');
    setResults(hosts.map(createInitialBatchExecResult));
    setExpandedHostIds(new Set());
    setIsRunning(false);
  }, [open, hosts]);

  const summary = useMemo(() => {
    const success = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'error').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    return { success, failed, skipped, total: results.length };
  }, [results]);

  const toggleExpanded = useCallback((hostId: string) => {
    setExpandedHostIds((prev) => {
      const next = new Set(prev);
      if (next.has(hostId)) next.delete(hostId);
      else next.add(hostId);
      return next;
    });
  }, []);

  const handleRun = useCallback(async () => {
    const trimmed = command.trim();
    if (!trimmed || hosts.length === 0 || !execAvailable()) return;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setIsRunning(true);
    setResults(hosts.map(createInitialBatchExecResult));

    await runBatchExecForHosts({
      hosts,
      command: trimmed,
      keys,
      identities,
      execCommand,
      onHostUpdate: (result) => {
        if (runIdRef.current !== runId) return;
        setResults((prev) => prev.map((entry) => (entry.hostId === result.hostId ? result : entry)));
      },
    });

    if (runIdRef.current === runId) {
      setIsRunning(false);
    }
  }, [command, execAvailable, execCommand, hosts, identities, keys]);

  const skipReasonLabel = (reason?: string) => {
    if (!reason) return '';
    return t(`batchExec.skip.${reason}` as 'batchExec.skip.non-ssh');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TerminalSquare size={18} />
            {t('batchExec.title')}
          </DialogTitle>
          <DialogDescription>
            {t('batchExec.description', { count: hosts.length })}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={t('batchExec.commandPlaceholder')}
          className="min-h-[72px] font-mono text-sm"
          disabled={isRunning}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void handleRun();
            }
          }}
        />

        {results.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('batchExec.resultsHeading')}</span>
              {!isRunning && summary.total > 0 && (
                <span>
                  {t('batchExec.summary', {
                    success: summary.success,
                    failed: summary.failed,
                    skipped: summary.skipped,
                  })}
                </span>
              )}
            </div>
            <ScrollArea className="h-[min(360px,45vh)] rounded-md border border-border/60">
              <div className="divide-y divide-border/50">
                {results.map((result) => {
                  const expanded = expandedHostIds.has(result.hostId);
                  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
                  const detail = output || result.error || skipReasonLabel(result.skipReason);
                  return (
                    <div key={result.hostId} className="px-3 py-2">
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 text-left"
                        onClick={() => detail && toggleExpanded(result.hostId)}
                        disabled={!detail}
                      >
                        <span className="mt-0.5 shrink-0">{statusIcon(result.status)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <span className="truncate">{result.label}</span>
                            {result.exitCode != null && result.status !== 'skipped' && (
                              <span className={cn(
                                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono',
                                result.exitCode === 0 ? 'bg-green-500/10 text-green-600' : 'bg-destructive/10 text-destructive',
                              )}>
                                {t('batchExec.exitCode', { code: result.exitCode })}
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {result.hostname}
                          </span>
                          {!expanded && detail && (
                            <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
                              {detail.split('\n')[0]}
                            </span>
                          )}
                        </span>
                      </button>
                      {expanded && detail && (
                        <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted/40 p-2 font-mono text-[11px] whitespace-pre-wrap">
                          {detail}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRunning}>
            {t('common.close')}
          </Button>
          <Button
            onClick={() => void handleRun()}
            disabled={isRunning || !command.trim() || hosts.length === 0 || !execAvailable()}
          >
            {isRunning ? t('batchExec.running') : t('batchExec.run')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BatchExecDialog;
