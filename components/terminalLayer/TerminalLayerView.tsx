/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { memo, useCallback } from 'react';

import { TerminalLayerFocusSidebarSection } from './TerminalLayerFocusSidebarSection';
import { TerminalLayerSidePanelSection } from './TerminalLayerSidePanelSection';
import { TerminalLayerWorkspaceSection } from './TerminalLayerWorkspaceSection';
import { terminalLayerViewCtxEqual } from './terminalLayerViewMemo';
import { useTerminalHostTreeLayoutWidth } from '../../application/state/terminalHostTreeStore';
import { TerminalCommandHistoryPopup } from '../terminal/TerminalCommandHistoryPopup';

type TerminalLayerViewContext = Record<string, any>;

function TerminalLayerViewInner({ ctx }: { ctx: TerminalLayerViewContext }) {
  const hostTreeLayoutWidth = useTerminalHostTreeLayoutWidth();
  const historyState = ctx.focusedHostHistoryState;
  const historySessionId = ctx.historySessionId as string | null | undefined;
  const focusedHost = ctx.focusedHost;

  const handleHistoryPopupOpen = useCallback(() => {
    if (!historySessionId || !focusedHost?.id) return;
    if (!ctx.remoteHistory?.fetch) return;
    // Refresh remote shell history when the floating picker opens.
    void ctx.remoteHistory.fetch(historySessionId, focusedHost.id);
  }, [ctx.remoteHistory, focusedHost?.id, historySessionId]);

  return (
    <div
      ref={ctx.workspaceOuterRef}
      className="absolute inset-0 bg-background flex min-h-0"
      data-section="terminal-workspace"
      style={{
        visibility: ctx.isTerminalLayerVisible ? 'visible' : 'hidden',
        pointerEvents: ctx.isTerminalLayerVisible ? 'auto' : 'none',
        zIndex: ctx.isTerminalLayerVisible ? 10 : 0,
        left: hostTreeLayoutWidth,
      }}
    >
      <TerminalLayerSidePanelSection ctx={ctx} />
      <TerminalLayerFocusSidebarSection ctx={ctx} />
      <TerminalLayerWorkspaceSection ctx={ctx} />
      <TerminalCommandHistoryPopup
        open={Boolean(ctx.commandHistoryPopupOpen)}
        hostEntries={historyState?.entries}
        globalEntries={ctx.shellHistory}
        focusedHostId={focusedHost?.id ?? null}
        loading={Boolean(historyState?.loading)}
        onClose={ctx.handleCloseCommandHistoryPopup}
        onPaste={ctx.handleHistoryPaste}
        onOpen={handleHistoryPopupOpen}
      />
    </div>
  );
}

export const TerminalLayerView = memo(
  TerminalLayerViewInner,
  (prev, next) => terminalLayerViewCtxEqual(prev.ctx, next.ctx),
);
TerminalLayerView.displayName = 'TerminalLayerView';
