import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import { runBatchSftpUpload } from "../../application/state/batchSftpUploadRunner";
import type { BatchSftpHostResult } from "../../domain/batchSftpUpload";
import { createInitialBatchSftpResult, fileNameFromLocalPath } from "../../domain/batchSftpUpload";
import type { Host, Identity, KnownHost, SSHKey, TerminalSettings } from "../../domain/models";
import { netcattyBridge } from "../../infrastructure/services/netcattyBridge";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";

export interface BatchSftpUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hosts: Host[];
  allHosts: Host[];
  keys: SSHKey[];
  identities: Identity[];
  knownHosts?: KnownHost[];
  terminalSettings?: Pick<TerminalSettings, "verifyHostKeys" | "keepaliveInterval" | "keepaliveCountMax">;
}

const statusIcon = (status: BatchSftpHostResult["status"]) => {
  if (status === "connecting" || status === "uploading") {
    return <Loader2 size={14} className="animate-spin text-primary" />;
  }
  if (status === "success") {
    return <CheckCircle2 size={14} className="text-green-500" />;
  }
  if (status === "error" || status === "skipped") {
    return <XCircle size={14} className="text-destructive" />;
  }
  return <span className="inline-block h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />;
};

export const BatchSftpUploadDialog: React.FC<BatchSftpUploadDialogProps> = ({
  open,
  onOpenChange,
  hosts,
  allHosts,
  keys,
  identities,
  knownHosts,
  terminalSettings,
}) => {
  const { t } = useI18n();
  const [localPaths, setLocalPaths] = useState<string[]>([]);
  const [remoteDir, setRemoteDir] = useState("/tmp");
  const [results, setResults] = useState<BatchSftpHostResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedHostIds, setExpandedHostIds] = useState<Set<string>>(new Set());
  const cancelledRef = useRef(false);
  const runIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setLocalPaths([]);
    setRemoteDir("/tmp");
    setResults(hosts.map(createInitialBatchSftpResult));
    setExpandedHostIds(new Set());
    setIsRunning(false);
    cancelledRef.current = false;
  }, [open, hosts]);

  const summary = useMemo(() => {
    const success = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "error").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
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

  const handlePickFiles = useCallback(async () => {
    const bridge = netcattyBridge.get();
    if (!bridge) return;
    if (bridge.selectFiles) {
      const paths = await bridge.selectFiles(
        t("batchSftp.pickFilesTitle"),
        undefined,
        [{ name: "All Files", extensions: ["*"] }],
      );
      if (paths?.length) setLocalPaths(paths);
      return;
    }
    // Fallback: single-file picker when multi-select is unavailable.
    if (bridge.selectFile) {
      const path = await bridge.selectFile(
        t("batchSftp.pickFilesTitle"),
        undefined,
        [{ name: "All Files", extensions: ["*"] }],
      );
      if (path) setLocalPaths([path]);
    }
  }, [t]);

  const handleRun = useCallback(async () => {
    if (localPaths.length === 0 || hosts.length === 0) return;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    cancelledRef.current = false;
    setIsRunning(true);
    setResults(hosts.map((h) => ({ ...createInitialBatchSftpResult(h), total: localPaths.length })));

    await runBatchSftpUpload({
      hosts,
      allHosts,
      keys,
      identities,
      knownHosts,
      terminalSettings,
      localPaths,
      remoteDir: remoteDir.trim() || "/",
      onHostUpdate: (result) => {
        if (runIdRef.current !== runId) return;
        setResults((prev) => prev.map((entry) => (entry.hostId === result.hostId ? result : entry)));
      },
      isCancelled: () => cancelledRef.current || runIdRef.current !== runId,
    });

    if (runIdRef.current === runId) {
      setIsRunning(false);
    }
  }, [
    allHosts,
    hosts,
    identities,
    keys,
    knownHosts,
    localPaths,
    remoteDir,
    terminalSettings,
  ]);

  const handleClose = useCallback(
    (next: boolean) => {
      if (!next && isRunning) {
        cancelledRef.current = true;
      }
      onOpenChange(next);
    },
    [isRunning, onOpenChange],
  );

  const skipReasonLabel = (reason?: string) => {
    if (!reason) return "";
    return t(`batchSftp.skip.${reason}` as "batchSftp.skip.non-ssh");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload size={18} />
            {t("batchSftp.title")}
          </DialogTitle>
          <DialogDescription>
            {t("batchSftp.description", { count: hosts.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void handlePickFiles()} disabled={isRunning}>
              {t("batchSftp.pickFiles")}
            </Button>
            <span className="text-xs text-muted-foreground truncate">
              {localPaths.length === 0
                ? t("batchSftp.noFiles")
                : t("batchSftp.filesSelected", { count: localPaths.length })}
            </span>
          </div>
          {localPaths.length > 0 && (
            <div className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 max-h-24 overflow-auto">
              <ul className="text-[11px] font-mono text-muted-foreground space-y-0.5">
                {localPaths.map((p) => (
                  <li key={p} className="truncate" title={p}>
                    {fileNameFromLocalPath(p)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("batchSftp.remoteDir")}</label>
            <Input
              value={remoteDir}
              onChange={(e) => setRemoteDir(e.target.value)}
              placeholder="/tmp"
              className="font-mono text-sm"
              disabled={isRunning}
            />
          </div>
        </div>

        {results.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("batchSftp.resultsHeading")}</span>
              {!isRunning && summary.total > 0 && (
                <span>
                  {t("batchSftp.summary", {
                    success: summary.success,
                    failed: summary.failed,
                    skipped: summary.skipped,
                  })}
                </span>
              )}
            </div>
            <ScrollArea className="h-[min(320px,40vh)] rounded-md border border-border/60">
              <div className="divide-y divide-border/50">
                {results.map((result) => {
                  const expanded = expandedHostIds.has(result.hostId);
                  const detail =
                    result.fileErrors?.map((f) => `${f.fileName}: ${f.error}`).join("\n") ||
                    result.error ||
                    skipReasonLabel(result.skipReason);
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
                            {result.total > 0 && result.status !== "skipped" && (
                              <span
                                className={cn(
                                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono",
                                  result.status === "success"
                                    ? "bg-green-500/10 text-green-600"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                {result.uploaded}/{result.total}
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {result.hostname}
                          </span>
                          {!expanded && detail && (
                            <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
                              {detail.split("\n")[0]}
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
          <Button variant="outline" onClick={() => handleClose(false)}>
            {isRunning ? t("common.cancel") : t("common.close")}
          </Button>
          <Button
            onClick={() => void handleRun()}
            disabled={isRunning || localPaths.length === 0 || hosts.length === 0}
          >
            {isRunning ? t("batchSftp.running") : t("batchSftp.run")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BatchSftpUploadDialog;
