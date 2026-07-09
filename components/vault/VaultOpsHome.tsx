import React, { useCallback, useMemo, useState } from 'react';
import {
  Clock,
  Layers,
  LayoutGrid,
  Network,
  Pin,
  Plug,
  Terminal,
} from 'lucide-react';

import {
  buildIpSegmentSummaries,
  buildOpsResumeItems,
  collectActiveHostIds,
  OPS_HOME_WORKSPACE_HOST_LIMIT,
  pickPinnedHosts,
  pickRecentHosts,
} from '../../domain/opsHome';
import type { Host, TerminalSession, Workspace } from '../../types';
import { formatRelativeTime } from '../AIChatSessionHistoryDrawer';
import { DistroAvatar } from '../DistroAvatar';
import { SelectHostDialog } from '../SelectHostDialog';
import { Button } from '../ui/button';
import { toast } from '../ui/toast';
import { cn } from '../../lib/utils';

export type VaultOpsHomeProps = {
  hosts: Host[];
  sessions: TerminalSession[];
  workspaces: Workspace[];
  onHostConnect: (host: Host) => void;
  onActivateTab: (tabId: string) => void;
  onCreateWorkspaceWithHosts?: (hosts: Host[], options?: { enableBroadcast?: boolean }) => void;
  onOpenBatchExec?: (hosts: Host[]) => void;
  onSwitchToTreeView: () => void;
  getEffectiveHostDistro: (host: Host) => string | undefined;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function HostQuickTile({
  host,
  onConnect,
  getEffectiveHostDistro,
}: {
  host: Host;
  onConnect: (host: Host) => void;
  getEffectiveHostDistro: (host: Host) => string | undefined;
}) {
  const effectiveDistro = getEffectiveHostDistro(host);
  const badge = (host.os || 'L')[0].toUpperCase();

  return (
    <button
      type="button"
      className={cn(
        'soft-card elevate rounded-xl h-[68px] px-3 py-2 text-left',
        'hover:border-primary/30 transition-colors w-full min-w-[200px] max-w-[280px]',
      )}
      onClick={() => onConnect(host)}
    >
      <div className="flex items-center gap-3 h-full">
        <DistroAvatar host={host} fallback={badge} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{host.label}</div>
          <div className="text-[11px] text-muted-foreground font-mono truncate">
            {host.username}@{host.hostname}
          </div>
          {effectiveDistro && (
            <div className="text-[10px] text-muted-foreground truncate">{effectiveDistro}</div>
          )}
        </div>
        <Plug size={14} className="text-muted-foreground shrink-0" />
      </div>
    </button>
  );
}

function SectionHeading({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <h3 className="text-sm font-semibold text-muted-foreground inline-flex items-center gap-1.5 mb-2">
      {icon}
      {title}
    </h3>
  );
}

export function VaultOpsHome({
  hosts,
  sessions,
  workspaces,
  onHostConnect,
  onActivateTab,
  onCreateWorkspaceWithHosts,
  onOpenBatchExec,
  onSwitchToTreeView,
  getEffectiveHostDistro,
  t,
}: VaultOpsHomeProps) {
  const activeHostIds = useMemo(() => collectActiveHostIds(sessions), [sessions]);
  const resumeItems = useMemo(
    () => buildOpsResumeItems(sessions, workspaces),
    [sessions, workspaces],
  );
  const pinned = useMemo(() => pickPinnedHosts(hosts), [hosts]);
  const recent = useMemo(() => pickRecentHosts(hosts), [hosts]);
  const segments = useMemo(
    () => buildIpSegmentSummaries(hosts, activeHostIds),
    [hosts, activeHostIds],
  );

  const [workspacePicker, setWorkspacePicker] = useState<{
    segment: string;
    hosts: Host[];
  } | null>(null);
  const [workspacePickerSelectedIds, setWorkspacePickerSelectedIds] = useState<string[]>([]);

  const openWorkspacePicker = useCallback((segment: string, segmentHosts: Host[]) => {
    setWorkspacePicker({ segment, hosts: segmentHosts });
    setWorkspacePickerSelectedIds([]);
  }, []);

  const handleWorkspacePickerSelect = useCallback((host: Host) => {
    setWorkspacePickerSelectedIds((prev) => {
      if (prev.includes(host.id)) {
        return prev.filter((id) => id !== host.id);
      }
      if (prev.length >= OPS_HOME_WORKSPACE_HOST_LIMIT) {
        toast.info(t('vault.opsHome.workspaceHostLimit', { max: OPS_HOME_WORKSPACE_HOST_LIMIT }));
        return prev;
      }
      return [...prev, host.id];
    });
  }, [t]);

  const handleWorkspacePickerConfirm = useCallback(() => {
    if (!workspacePicker || !onCreateWorkspaceWithHosts) return;
    const selected = workspacePicker.hosts.filter((host) =>
      workspacePickerSelectedIds.includes(host.id),
    );
    if (selected.length === 0) return;
    onCreateWorkspaceWithHosts(selected, { enableBroadcast: true });
    setWorkspacePicker(null);
    setWorkspacePickerSelectedIds([]);
  }, [onCreateWorkspaceWithHosts, workspacePicker, workspacePickerSelectedIds]);

  const closeWorkspacePicker = useCallback((open: boolean) => {
    if (open) return;
    setWorkspacePicker(null);
    setWorkspacePickerSelectedIds([]);
  }, []);

  if (hosts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <LayoutGrid size={32} className="mb-3 opacity-50" />
        <p className="text-sm">{t('vault.opsHome.empty')}</p>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-6 pb-6" data-section="vault-ops-home">
      {resumeItems.length > 0 && (
        <section>
          <SectionHeading icon={<Terminal size={14} />} title={t('vault.opsHome.resume')} />
          <div className="flex flex-wrap gap-2">
            {resumeItems.map((item) => (
              <Button
                key={`${item.kind}:${item.id}`}
                variant="secondary"
                className="h-auto py-2 px-3 justify-start gap-2 max-w-full"
                onClick={() => onActivateTab(item.id)}
              >
                {item.kind === 'workspace' ? <Layers size={14} /> : <Terminal size={14} />}
                <span className="truncate text-left">
                  {item.kind === 'workspace'
                    ? t('vault.opsHome.resumeWorkspace', {
                      title: item.title,
                      count: item.paneCount,
                    })
                    : item.label}
                </span>
              </Button>
            ))}
          </div>
        </section>
      )}

      {pinned.length > 0 && (
        <section>
          <SectionHeading icon={<Pin size={14} />} title={t('vault.opsHome.pinned')} />
          <div className="flex flex-wrap gap-3">
            {pinned.map((host) => (
              <HostQuickTile
                key={host.id}
                host={host}
                onConnect={onHostConnect}
                getEffectiveHostDistro={getEffectiveHostDistro}
              />
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <SectionHeading icon={<Clock size={14} />} title={t('vault.opsHome.recent')} />
          <div className="flex flex-wrap gap-3">
            {recent.map((host) => (
              <HostQuickTile
                key={host.id}
                host={host}
                onConnect={onHostConnect}
                getEffectiveHostDistro={getEffectiveHostDistro}
              />
            ))}
          </div>
        </section>
      )}

      {segments.length > 0 && (
        <section>
          <div className="flex items-center justify-between gap-2 mb-2">
            <SectionHeading icon={<Network size={14} />} title={t('vault.opsHome.segments')} />
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onSwitchToTreeView}>
              {t('vault.opsHome.browseTree')}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {segments.map((segment) => {
              const lastLabel = segment.lastConnectedAt
                ? t('vault.opsHome.segmentLastConnected', {
                  time: formatRelativeTime(new Date(segment.lastConnectedAt), t),
                })
                : t('vault.opsHome.segmentNever');

              return (
                <div
                  key={segment.segment}
                  className="soft-card rounded-xl border border-border/60 p-3 space-y-3"
                >
                  <div>
                    <div className="font-mono text-sm font-semibold">{segment.segment}.x</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t('vault.opsHome.segmentHosts', { count: segment.hostCount })}
                      {segment.activeSessionCount > 0 && (
                        <>
                          {' · '}
                          {t('vault.opsHome.segmentActive', { count: segment.activeSessionCount })}
                        </>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{lastLabel}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onCreateWorkspaceWithHosts && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8"
                        onClick={() => openWorkspacePicker(segment.segment, segment.hosts)}
                      >
                        {t('vault.opsHome.openWorkspace')}
                      </Button>
                    )}
                    {onOpenBatchExec && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => onOpenBatchExec(segment.hosts)}
                      >
                        {t('vault.opsHome.batchCommand')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>

    <SelectHostDialog
      open={workspacePicker != null}
      onOpenChange={closeWorkspacePicker}
      title={
        workspacePicker
          ? t('vault.opsHome.pickWorkspaceHosts', { segment: `${workspacePicker.segment}.x` })
          : undefined
      }
      hosts={workspacePicker?.hosts ?? []}
      selectedHostIds={workspacePickerSelectedIds}
      multiSelect
      maxSelection={OPS_HOME_WORKSPACE_HOST_LIMIT}
      onSelect={handleWorkspacePickerSelect}
      onConfirm={handleWorkspacePickerConfirm}
    />
    </>
  );
}
