/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { useActiveTabId } from '../../application/state/activeTabStore';
import { sessionCapabilitiesStore } from '../../application/state/sessionCapabilitiesStore';
import { useSystemManagerBackend } from '../../application/state/useSystemManagerBackend';
import { canReuseTerminalConnection } from '../../application/state/terminalConnectionReuse';
import { resolveSystemSidebarSession } from '../../domain/systemManager/resolveSystemSession';
import type { TerminalContextReader } from '../../domain/terminalContextRead';
import { useSystemCapabilitiesWarmup } from '../systemManager/hooks/useSystemManager';
import { cn } from '../../lib/utils';
import type { Host, TerminalSession, Workspace } from '../../types';
import { TerminalLayerView } from './TerminalLayerView';
import { useTerminalAiContexts } from './useTerminalAiContexts';
import { useTerminalLayerEffects } from './useTerminalLayerEffects';
import { useTerminalThemePanelState } from './useTerminalThemePanelState';
import { useManualTerminalChromeSurfaceInjection } from '../../application/state/useManualTerminalChromeSurfaceInjection';
import { sidePanelLiveStore, type SidePanelLiveSnapshot } from '../../application/state/sidePanelLiveStore';
import { useTerminalWorkspaceLayout } from './useTerminalWorkspaceLayout';
import type { SidePanelTab } from './TerminalLayerSupport';

type StableRef = React.MutableRefObject<Record<string, any>>;

export function TerminalLayerTabBridge({ stableRef }: { stableRef: StableRef }) {
  const s = stableRef.current;
  const activeTabId = useActiveTabId();
  const systemBackend = useSystemManagerBackend();
  const terminalContextReadersRef = useRef<Map<string, TerminalContextReader>>(new Map());

  s.activeTabIdRef.current = activeTabId;

  const workspaceById = s.workspaceById as Map<string, Workspace>;
  const sessions = s.sessions as TerminalSession[];
  const sessionHostsMap = s.sessionHostsMap as Map<string, Host>;
  const sftpHostForTab = s.sftpHostForTab as Map<string, Host>;
  const sidePanelOpenTabs = s.sidePanelOpenTabs as Map<string, SidePanelTab>;
  const showHostTreeSidebar = s.showHostTreeSidebar as boolean | undefined;

  const activeWorkspace = useMemo(
    () => (activeTabId ? workspaceById.get(activeTabId) : undefined),
    [activeTabId, workspaceById],
  );
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeTabId),
    [activeTabId, sessions],
  );
  const isFocusMode = activeWorkspace?.viewMode === 'focus';
  const focusedSessionId = activeWorkspace?.focusedSessionId;
  const effectiveFocusedSessionId = useMemo((): string | null => {
    if (activeWorkspace) {
      if (focusedSessionId) return focusedSessionId;
      return sessions.find((session) => session.workspaceId === activeWorkspace.id)?.id ?? null;
    }
    return activeSession?.id ?? null;
  }, [activeSession?.id, activeWorkspace, focusedSessionId, sessions]);

  s.activeWorkspaceRef.current = activeWorkspace;
  s.activeSessionRef.current = activeSession;
  s.focusedSessionIdRef.current = focusedSessionId;

  const isVisible = Boolean(activeSession || activeWorkspace || s.draggingSessionId);
  const isTerminalLayerVisible = isVisible || !!s.draggingSessionId;

  const {
    activeResizers,
    computeSplitHint,
    dropHint,
    findSplitNode,
    handleWorkspaceDrop,
    resizing,
    setDropHint,
    setResizing,
    setWorkspaceArea,
    workspaceInnerRef,
    workspaceOuterRef,
    workspaceOverlayRef,
    workspaceRectsById,
  } = useTerminalWorkspaceLayout({
    activeSession,
    activeWorkspace,
    isFocusMode,
    onAddSessionToWorkspace: s.onAddSessionToWorkspace,
    onCreateWorkspaceFromSessions: s.onCreateWorkspaceFromSessions,
    onSetDraggingSessionId: s.onSetDraggingSessionId,
    onUpdateSplitSizes: s.onUpdateSplitSizes,
    sessions,
    workspaces: s.workspaces,
  });

  const isSidePanelOpenForCurrentTab = activeTabId ? sidePanelOpenTabs.has(activeTabId) : false;
  const activeSidePanelTab = activeTabId ? sidePanelOpenTabs.get(activeTabId) ?? null : null;
  const isSftpOpenForCurrentTab = activeSidePanelTab === 'sftp';

  const activeHostIdForSidebar = useMemo(() => {
    const sessionId = activeWorkspace ? focusedSessionId : activeSession?.id;
    if (!sessionId) return null;
    return sessionHostsMap.get(sessionId)?.id
      ?? sessions.find((session) => session.id === sessionId)?.hostId
      ?? null;
  }, [activeWorkspace, focusedSessionId, activeSession, sessionHostsMap, sessions]);

  const sftpActiveHost = useMemo((): Host | null => {
    if (!isSftpOpenForCurrentTab || !activeTabId) return null;
    if (activeWorkspace && focusedSessionId) {
      return sessionHostsMap.get(focusedSessionId) ?? sftpHostForTab.get(activeTabId) ?? null;
    }
    if (activeSession) {
      return sessionHostsMap.get(activeSession.id) ?? sftpHostForTab.get(activeTabId) ?? null;
    }
    return sftpHostForTab.get(activeTabId) ?? null;
  }, [activeSession, activeTabId, activeWorkspace, focusedSessionId, isSftpOpenForCurrentTab, sessionHostsMap, sftpHostForTab]);

  const resolveSftpLinkedSessionId = useCallback((
    sessionId: string | null | undefined,
    host: Host | null,
  ): string | null => {
    if (!sessionId || !host) return null;
    const session = sessions.find((candidate) => candidate.id === sessionId);
    // CWD follow/go-to need a live SSH-like session. Mosh/ET cannot run getSessionPwd.
    if (!session || session.status !== 'connected') return null;
    if (session.protocol === 'local' || session.protocol === 'serial' || session.protocol === 'telnet') {
      return null;
    }
    if (session.moshEnabled || session.etEnabled) return null;
    const sessionHost = sessionHostsMap.get(session.id);
    if (!sessionHost) {
      // Fall back to session hostId when the map has not resolved yet.
      return session.hostId === host.id ? session.id : null;
    }
    // Prefer vault host id; hostname/port is a secondary match for session-time
    // overrides. Do NOT require username — su/sudo changes the shell user while
    // SFTP stays on the login identity, and that used to unlink the session.
    const sameHost =
      sessionHost.id === host.id
      || (
        sessionHost.hostname === host.hostname
        && (sessionHost.port || 22) === (host.port || 22)
      );
    return sameHost ? session.id : null;
  }, [sessionHostsMap, sessions]);

  const activeTerminalSessionIdForSftp = useMemo((): string | null => {
    if (!isSftpOpenForCurrentTab || !sftpActiveHost) return null;
    const preferredSessionId = activeWorkspace
      ? (focusedSessionId ?? effectiveFocusedSessionId)
      : activeSession?.id;
    const linked = resolveSftpLinkedSessionId(preferredSessionId, sftpActiveHost);
    if (linked) return linked;

    // Only fall back when a single same-host SSH session is connected. With two
    // tabs on the same host (different CWDs), grabbing "any" session made SFTP
    // follow / go-to-cwd stick to the wrong path (#2322).
    const candidates: string[] = [];
    for (const session of sessions) {
      if (session.status !== 'connected') continue;
      if (activeWorkspace && session.workspaceId && session.workspaceId !== activeWorkspace.id) {
        continue;
      }
      const candidate = resolveSftpLinkedSessionId(session.id, sftpActiveHost);
      if (candidate) candidates.push(candidate);
    }
    if (candidates.length === 1) return candidates[0];
    return null;
  }, [
    activeSession?.id,
    activeWorkspace,
    effectiveFocusedSessionId,
    focusedSessionId,
    isSftpOpenForCurrentTab,
    resolveSftpLinkedSessionId,
    sessions,
    sftpActiveHost,
  ]);

  // Endpoint-matched (or same-host fallback) sessions feed SFTP follow / go-to-cwd.
  const linkedTerminalSessionIdForSftp = activeTerminalSessionIdForSftp;

  const activeTerminalCwd = useMemo(() => {
    if (!linkedTerminalSessionIdForSftp) return null;
    return s.terminalRendererCwdBySessionRef.current.get(linkedTerminalSessionIdForSftp) ?? null;
    // terminalCwdRevision bumps when any session cwd changes so linked SFTP can react.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedTerminalSessionIdForSftp, s.terminalCwdRevision]);

  const historySessionId = effectiveFocusedSessionId;
  const activeTerminalSessionForSystem = useMemo(
    () => resolveSystemSidebarSession(sessions, activeWorkspace, focusedSessionId, activeSession),
    [activeSession, activeWorkspace, focusedSessionId, sessions],
  );
  const activeSystemSessionHost = useMemo((): Host | null => {
    const id = activeTerminalSessionForSystem?.id;
    if (!id) return null;
    return sessionHostsMap.get(id) ?? null;
  }, [activeTerminalSessionForSystem?.id, sessionHostsMap]);

  const systemWarmupSessionIds = useMemo(() => {
    if (!activeTabId || activeSidePanelTab !== 'system') return [];
    const session = activeTerminalSessionForSystem;
    if (!session || session.status !== 'connected') return [];
    return [session.id];
  }, [activeSidePanelTab, activeTabId, activeTerminalSessionForSystem]);

  useSystemCapabilitiesWarmup(
    systemWarmupSessionIds,
    systemBackend,
    systemWarmupSessionIds.length > 0,
    (s.terminalSettings?.systemManagerProcessRefreshInterval ?? 3) * 1000,
  );

  useEffect(() => {
    sessionCapabilitiesStore.prune(new Set(sessions.map((session) => session.id)));
  }, [sessions]);

  const focusedHost = useMemo((): Host | null => {
    if (!historySessionId) return null;
    return sessionHostsMap.get(historySessionId) ?? null;
  }, [historySessionId, sessionHostsMap]);
  const focusedHostHistoryState = s.remoteHistory?.getState(
    focusedHost?.id ?? null,
    historySessionId,
  );

  const themeState = useTerminalThemePanelState({
    accentMode: s.accentMode,
    activeSession,
    activeSidePanelTab,
    activeWorkspace,
    customAccent: s.customAccent,
    followAppTerminalTheme: s.followAppTerminalTheme,
    focusedSessionId,
    fontSize: s.fontSize,
    hostMap: s.hostMap,
    isSidePanelOpenForCurrentTab,
    isVisible,
    onUpdateHost: s.onUpdateHost,
    onUpdateTerminalFontFamilyId: s.onUpdateTerminalFontFamilyId,
    onUpdateTerminalFontSize: s.onUpdateTerminalFontSize,
    onUpdateSessionFontSize: s.onUpdateSessionFontSize,
    onClearSessionFontSizeOverride: s.onClearSessionFontSizeOverride,
    onUpdateTerminalFontWeight: s.onUpdateTerminalFontWeight,
    onUpdateTerminalThemeId: s.onUpdateTerminalThemeId,
    pickTheme: s.pickTerminalTheme,
    clearIntent: s.clearThemeIntent,
    resolveFocusedAppearance: s.resolveSessionAppearance,
    sessionHostsMap,
    terminalFontFamilyId: s.terminalFontFamilyId,
    terminalSettings: s.terminalSettings,
    terminalTheme: s.terminalTheme,
  });

  useManualTerminalChromeSurfaceInjection(
    themeState.resolvedPreviewTheme,
    !s.followAppTerminalTheme && isTerminalLayerVisible,
  );

  const sidePanelLiveSnapshot = useMemo<SidePanelLiveSnapshot>(() => ({
    sftpActiveHost,
    activeTerminalSessionIdForSftp,
    activeTerminalCwd,
    activeWorkspace,
    activeTerminalSessionForSystem: activeTerminalSessionForSystem ?? null,
    activeSystemSessionHost,
    focusedHost,
    focusedSessionId: effectiveFocusedSessionId,
    historySessionId,
    resolvedPreviewTheme: themeState.resolvedPreviewTheme,
    previewedOrVisibleThemeId: themeState.previewedOrVisibleThemeId,
    focusedFontFamilyId: themeState.focusedFontFamilyId,
    focusedFontFamilyOverridden: themeState.focusedFontFamilyOverridden,
    focusedFontSize: themeState.focusedFontSize,
    focusedFontSizeOverridden: themeState.focusedFontSizeOverridden,
    focusedFontWeight: themeState.focusedFontWeight,
    focusedFontWeightOverridden: themeState.focusedFontWeightOverridden,
    focusedThemeOverridden: themeState.focusedThemeOverridden,
  }), [
    activeSystemSessionHost,
    activeTerminalCwd,
    activeTerminalSessionForSystem,
    activeTerminalSessionIdForSftp,
    activeWorkspace,
    effectiveFocusedSessionId,
    focusedHost,
    historySessionId,
    sftpActiveHost,
    themeState.focusedFontFamilyId,
    themeState.focusedFontFamilyOverridden,
    themeState.focusedFontSize,
    themeState.focusedFontSizeOverridden,
    themeState.focusedFontWeight,
    themeState.focusedFontWeightOverridden,
    themeState.focusedThemeOverridden,
    themeState.previewedOrVisibleThemeId,
    themeState.resolvedPreviewTheme,
  ]);

  useLayoutEffect(() => {
    sidePanelLiveStore.update(sidePanelLiveSnapshot);
  }, [sidePanelLiveSnapshot]);

  const { aiContextsByTabId, resolveAIExecutorContext } = useTerminalAiContexts({
    hosts: s.hosts,
    hostsRef: s.hostsRef,
    portForwardingRules: s.portForwardingRules,
    portForwardingRulesRef: s.portForwardingRulesRef,
    mountedAiTabIds: s.mountedAiTabIds,
    sessionHostsMap,
    sessions,
    sessionsRef: s.sessionsRef,
    terminalContextReadersRef,
    workspaces: s.workspaces,
    workspacesRef: s.workspacesRef,
  });

  const handleTerminalContextReaderChange = React.useCallback((
    sessionId: string,
    reader: TerminalContextReader | null,
  ) => {
    if (reader) {
      terminalContextReadersRef.current.set(sessionId, reader);
    } else {
      terminalContextReadersRef.current.delete(sessionId);
    }
  }, []);

  const prevFocusedSessionIdRef = useRef<string | undefined>(undefined);

  useTerminalLayerEffects({
    activeSidePanelTab,
    activeTabId,
    activeTabIdRef: s.activeTabIdRef,
    activeWorkspace,
    activityTrackedSessions: s.activityTrackedSessions,
    cancelAnimationFrame,
    ChunkedEscapeFilter: s.ChunkedEscapeFilter,
    clearTimeout,
    document,
    dropHint,
    filterTabsMap: s.filterTabsMap,
    focusedSessionId,
    getSessionActivityIdsToClear: s.getSessionActivityIdsToClear,
    handleToggleAiFromTopBar: s.handleToggleAiFromTopBar,
    handleToggleHistorySidePanel: s.handleToggleHistorySidePanel,
    handleToggleScriptsSidePanel: s.handleToggleScriptsSidePanel,
    handleToggleSidePanel: s.handleToggleSidePanel,
    hasNotifiableTerminalOutput: s.hasNotifiableTerminalOutput,
    isComposeBarOpen: s.isComposeBarOpen,
    isFocusMode,
    isTerminalLayerVisible,
    lastSidePanelTabRef: s.lastSidePanelTabRef,
    Map,
    Math,
    onSessionData: s.onSessionData,
    onSplitSessionRef: s.onSplitSessionRef,
    onToggleBroadcastRef: s.onToggleBroadcastRef,
    onToggleWorkspaceViewModeRef: s.onToggleWorkspaceViewModeRef,
    prevFocusedSessionIdRef,
    refocusActiveTerminalSession: s.refocusActiveTerminalSession,
    requestAnimationFrame,
    ResizeObserver,
    sessionActivityStore: s.sessionActivityStore,
    sessionHostsMap,
    sessions,
    Set,
    setDropHint,
    setSftpHostForTab: s.setSftpHostForTab,
    setSftpInitialLocationForTab: s.setSftpInitialLocationForTab,
    setSftpPendingUploadsForTab: s.setSftpPendingUploadsForTab,
    setAiMountedTabIds: s.setAiMountedTabIds,
    setNotesMountedTabIds: s.setNotesMountedTabIds,
    setScriptsMountedTabIds: s.setScriptsMountedTabIds,
    setSystemMountedTabIds: s.setSystemMountedTabIds,
    setThemeMountedTabIds: s.setThemeMountedTabIds,
    setSidePanelOpenTabs: s.setSidePanelOpenTabs,
    setTimeout,
    setupMcpApprovalBridge: s.setupMcpApprovalBridge,
    setWorkspaceArea,
    sidePanelPosition: s.sidePanelPosition,
    sidePanelWidth: s.sidePanelWidth,
    sftpActiveHost,
    sftpHostForTab,
    shouldMarkSessionActivity: s.shouldMarkSessionActivity,
    sidePanelOpenTabs,
    splitHorizontalHandlersRef: s.splitHorizontalHandlersRef,
    splitVerticalHandlersRef: s.splitVerticalHandlersRef,
    terminalRendererCwdBySessionRef: s.terminalRendererCwdBySessionRef,
    toggleScriptsSidePanelRef: s.toggleScriptsSidePanelRef,
    toggleSidePanelRef: s.toggleSidePanelRef,
    toggleHistorySidePanelRef: s.toggleHistorySidePanelRef,
    validAIScopeTargetIds: s.validAIScopeTargetIds,
    validSessionActivityIds: s.validSessionActivityIds,
    window,
    workspaceBroadcastHandlersRef: s.workspaceBroadcastHandlersRef,
    workspaceFocusHandlersRef: s.workspaceFocusHandlersRef,
    workspaceInnerRef,
    workspaces: s.workspaces,
  });

  const ctx = useMemo(() => ({
    accentMode: s.accentMode,
    activeHostIdForSidebar,
    activeResizers,
    activeSidePanelTab,
    activeTabId,
    activeTerminalCwd,
    activeTerminalSessionIdForSftp,
    activeWorkspace,
    AIChatPanelsHost: s.AIChatPanelsHost,
    AISidePanelStateRoot: s.AISidePanelStateRoot,
    aiContextsByTabId,
    Array: s.Array,
    Button: s.Button,
    cn,
    composeBarThemeColors: themeState.composeBarThemeColors,
    computeSplitHint,
    customAccent: s.customAccent,
    customGroups: s.customGroups,
    draggingSessionId: s.draggingSessionId,
    dropHint,
    editorWordWrap: s.editorWordWrap,
    effectiveHosts: s.effectiveHosts,
    findSplitNode,
    focusedFontFamilyId: themeState.focusedFontFamilyId,
    focusedFontFamilyOverridden: themeState.focusedFontFamilyOverridden,
    focusedFontSize: themeState.focusedFontSize,
    focusedFontSizeOverridden: themeState.focusedFontSizeOverridden,
    focusedFontWeight: themeState.focusedFontWeight,
    focusedFontWeightOverridden: themeState.focusedFontWeightOverridden,
    focusedHost,
    focusedSessionId,
    focusedThemeOverridden: themeState.focusedThemeOverridden,
    FolderTree: s.FolderTree,
    followAppTerminalTheme: s.followAppTerminalTheme,
    handleHistoryPaste: s.handleHistoryPaste,
    handleHistoryRun: s.handleHistoryRun,
    handleCloseCommandHistoryPopup: s.handleCloseCommandHistoryPopup,
    commandHistoryPopupOpen: s.commandHistoryPopupOpen,
    fontSize: s.fontSize,
    getTerminalCwd: s.getTerminalCwd,
    insertPathIntoTerminal: s.insertPathIntoTerminal,
    getSftpRememberedPath: s.getSftpRememberedPath,
    handleAddKnownHost: s.handleAddKnownHost,
    handleAddSelectionToAI: s.handleAddSelectionToAI,
    handleBroadcastInput: s.handleBroadcastInput,
    handleCloseSession: s.handleCloseSession,
    handleCloseSidePanel: s.handleCloseSidePanel,
    handleCommandExecuted: s.handleCommandExecuted,
    handleCommandSubmitted: s.handleCommandSubmitted,
    handleComposeSend: s.handleComposeSend,
    handleOpenWorkspaceBatchExec: s.handleOpenWorkspaceBatchExec,
    handleFontFamilyChangeForFocusedSession: themeState.handleFontFamilyChangeForFocusedSession,
    handleFontFamilyResetForFocusedSession: themeState.handleFontFamilyResetForFocusedSession,
    handleFontSizeChangeForFocusedSession: themeState.handleFontSizeChangeForFocusedSession,
    handleFontSizeResetForFocusedSession: themeState.handleFontSizeResetForFocusedSession,
    handleFontWeightChangeForFocusedSession: themeState.handleFontWeightChangeForFocusedSession,
    handleFontWeightResetForFocusedSession: themeState.handleFontWeightResetForFocusedSession,
    handleOpenAI: s.handleOpenAI,
    handleOpenNotes: s.handleOpenNotes,
    handleOpenSystem: s.handleOpenSystem,
    handleOpenHistory: s.handleOpenHistory,
    handleOpenScripts: s.handleOpenScripts,
    activeTerminalSessionForSystem,
    activeSystemSessionHost,
    handleOpenSftp: s.handleOpenSftp,
    handleOpenTheme: s.handleOpenTheme,
    handleBackFromNotes: s.handleBackFromNotes,
    handleOpenHostFromNotes: s.handleOpenHostFromNotes,
    History: s.History,
    historySessionId,
    focusedHostHistoryState,
    HistorySidePanel: s.HistorySidePanel,
    handleOsDetected: s.handleOsDetected,
    handlePendingTerminalSelectionConsumed: s.handlePendingTerminalSelectionConsumed,
    handlePendingUploadHandled: s.handlePendingUploadHandled,
    handleSessionExit: s.handleSessionExit,
    handleSftpCurrentPathChange: s.handleSftpCurrentPathChange,
    handleSftpInitialLocationApplied: s.handleSftpInitialLocationApplied,
    persistSidePanelWidth: s.persistSidePanelWidth,
    setSidePanelWidth: s.setSidePanelWidth,
    handleSnippetClickForFocusedSession: s.handleSnippetClickForFocusedSession,
    handleSnippetFromPanel: s.handleSnippetFromPanel,
    handleRunScriptFromPanel: s.handleRunScriptFromPanel,
    handleRunScriptOnWorkspace: s.handleRunScriptOnWorkspace,
    handleStartRecordingFromPanel: s.handleStartRecordingFromPanel,
    scriptRuns: s.scriptRuns,
    handleStopScriptRun: s.handleStopScriptRun,
    handlePauseScriptRun: s.handlePauseScriptRun,
    handleResumeScriptRun: s.handleResumeScriptRun,
    handleSnippetExecutorChange: s.handleSnippetExecutorChange,
    handleBroadcastInterruptPriorityChange: s.handleBroadcastInterruptPriorityChange,
    handleProgrammaticCommandLogRewriteChange: s.handleProgrammaticCommandLogRewriteChange,
    handleStatusChange: s.handleStatusChange,
    handleTerminalCwdChange: s.handleTerminalCwdChange,
    handleTerminalTitleChange: s.handleTerminalTitleChange,
    handleTerminalBell: s.handleTerminalBell,
    handleTerminalOutput: s.handleTerminalOutput,
    handleTerminalDataCapture: s.handleTerminalDataCapture,
    handleTerminalContextReaderChange,
    handleTerminalFontSizeChange: s.handleTerminalFontSizeChange,
    handleThemeChangeForFocusedSession: themeState.handleThemeChangeForFocusedSession,
    handleThemeResetForFocusedSession: themeState.handleThemeResetForFocusedSession,
    handleToggleSftpFromBar: s.handleToggleSftpFromBar,
    handleToggleWorkspaceComposeBar: s.handleToggleWorkspaceComposeBar,
    handleUpdateHost: s.handleUpdateHost,
    handleWorkspaceDrop,
    hosts: s.hosts,
    hotkeyScheme: s.hotkeyScheme,
    disableTerminalFontZoom: s.disableTerminalFontZoom,
    restoreTerminalCwd: s.restoreTerminalCwd,
    identities: s.identities,
    isBroadcastEnabled: s.isBroadcastEnabled,
    isComposeBarOpen: s.isComposeBarOpen,
    isFocusMode,
    isSidePanelOpenForCurrentTab,
    isTerminalLayerVisible,
    keyBindings: s.keyBindings,
    keys: s.keys,
    knownHosts: s.knownHosts,
    MessageSquare: s.MessageSquare,
    mountedAiTabIds: s.mountedAiTabIds,
    mountedSftpTabIds: s.mountedSftpTabIds,
    notesMountedTabIds: s.notesMountedTabIds,
    notesOpenNoteByTab: s.notesOpenNoteByTab,
    NotesManager: s.NotesManager,
    noteGroups: s.noteGroups,
    notes: s.notes,
    scriptsMountedTabIds: s.scriptsMountedTabIds,
    systemMountedTabIds: s.systemMountedTabIds,
    themeMountedTabIds: s.themeMountedTabIds,
    onConnectToHost: s.onConnectToHost,
    onCreateLocalTerminal: s.onCreateLocalTerminal,
    onHotkeyAction: s.onHotkeyAction,
    onReorderWorkspaceSessions: s.onReorderWorkspaceSessions,
    onReorderTabs: s.onReorderTabs,
    onCopySession: s.onCopySession,
    onCopySessionToNewWindow: s.onCopySessionToNewWindow,
    onUpdateSessionRestoreCwd: s.onUpdateSessionRestoreCwd,
    onUpdateSessionDynamicTitle: s.onUpdateSessionDynamicTitle,
    onUpdateSessionCodingCliProvider: s.onUpdateSessionCodingCliProvider,
    onRequestAddToWorkspace: s.onRequestAddToWorkspace,
    onSetWorkspaceFocusedSession: s.onSetWorkspaceFocusedSession,
    onStartSessionRename: s.onStartSessionRename,
    onSubmitSessionRename: s.onSubmitSessionRename,
    onRemoveSessionFromWorkspace: s.onRemoveSessionFromWorkspace,
    onOpenVaultNoteFromChat: s.onOpenVaultNoteFromChat,
    onOpenVaultHostFromChat: s.onOpenVaultHostFromChat,
    onOpenVaultSectionFromChat: s.onOpenVaultSectionFromChat,
    onOpenVaultSnippetFromChat: s.onOpenVaultSnippetFromChat,
    onStartSessionDrag: s.onStartSessionDrag,
    onEndSessionDrag: s.onEndSessionDrag,
    onSplitSession: s.onSplitSession,
    onOpenBatchExec: s.onOpenBatchExec,
    onToggleWorkspaceViewMode: s.onToggleWorkspaceViewMode,
    Palette: s.Palette,
    PanelLeft: s.PanelLeft,
    PanelRight: s.PanelRight,
    pendingTerminalSelectionForAI: s.pendingTerminalSelectionForAI,
    previewedOrVisibleThemeId: themeState.previewedOrVisibleThemeId,
    refocusActiveTerminalSession: s.refocusActiveTerminalSession,
    refocusTerminalSession: s.refocusTerminalSession,
    remoteHistory: s.remoteHistory,
    shellHistory: s.shellHistory,
    resizing,
    resolveAIExecutorContext,
    resolvedPreviewTheme: themeState.resolvedPreviewTheme,
    ScriptsSidePanel: s.ScriptsSidePanel,
    sessionChainHostsMap: s.sessionChainHostsMap,
    sessionHostsMap,
    resolvedSessionHostIds: s.resolvedSessionHostIds,
    sessionLogConfig: s.sessionLogConfig,
    sessionSudoAutofillPasswordsMap: s.sessionSudoAutofillPasswordsMap,
    sessions,
    setDropHint,
    setEditorWordWrap: s.setEditorWordWrap,
    setIsComposeBarOpen: s.setIsComposeBarOpen,
    setResizing,
    showHostTreeSidebar,
    setSidePanelPosition: s.setSidePanelPosition,
    setSftpFollowTerminalCwd: s.setSftpFollowTerminalCwd,
    setSftpHostForTab: s.setSftpHostForTab,
    sftpActiveHost,
    sftpHostForTab,
    sftpAutoSync: s.sftpAutoSync,
    sftpDefaultViewMode: s.sftpDefaultViewMode,
    sftpDoubleClickBehavior: s.sftpDoubleClickBehavior,
    sftpFollowTerminalCwd: s.sftpFollowTerminalCwd,
    sftpInitialLocationForTab: s.sftpInitialLocationForTab,
    sftpPendingUploadsForTab: s.sftpPendingUploadsForTab,
    sftpShowHiddenFiles: s.sftpShowHiddenFiles,
    SftpSidePanel: s.SftpSidePanel,
    sftpUseCompressedUpload: s.sftpUseCompressedUpload,
    sidePanelPosition: s.sidePanelPosition,
    sidePanelWidth: s.sidePanelWidth,
    sidePanelOpenTabs,
    snippetPackages: s.snippetPackages,
    snippets: s.snippets,
    updateSnippetPackages: s.updateSnippetPackages,
    updateSnippets: s.updateSnippets,
    updateNoteGroups: s.updateNoteGroups,
    updateNotes: s.updateNotes,
    splitHorizontalHandlersRef: s.splitHorizontalHandlersRef,
    splitVerticalHandlersRef: s.splitVerticalHandlersRef,
    sshDebugLogsEnabled: s.sshDebugLogsEnabled,
    t: s.t,
    TerminalComposeBar: s.TerminalComposeBar,
    terminalFontFamilyId: s.terminalFontFamilyId,
    TerminalPanesHost: s.TerminalPanesHost,
    terminalSettings: s.terminalSettings,
    terminalTheme: s.terminalTheme,
    terminalThemeId: s.terminalThemeId,
    resolveSessionAppearance: s.resolveSessionAppearance,
    hostMap: s.hostMap,
    ThemeSidePanel: s.ThemeSidePanel,
    Tooltip: s.Tooltip,
    TooltipContent: s.TooltipContent,
    TooltipTrigger: s.TooltipTrigger,
    updateHosts: s.updateHosts,
    validAIScopeTargetIds: s.validAIScopeTargetIds,
    workspaceBroadcastHandlersRef: s.workspaceBroadcastHandlersRef,
    workspaceById,
    workspaceFocusHandlersRef: s.workspaceFocusHandlersRef,
    workspaceInnerRef,
    workspaceOuterRef,
    workspaceOverlayRef,
    workspaceRectsById,
    X: s.X,
    Zap: s.Zap,
    // stableRef fields are intentionally omitted from deps — they update every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    activeHostIdForSidebar,
    activeResizers,
    activeSidePanelTab,
    activeTabId,
    activeTerminalCwd,
    activeTerminalSessionIdForSftp,
    activeWorkspace,
    aiContextsByTabId,
    computeSplitHint,
    dropHint,
    focusedHost,
    focusedHostHistoryState,
    focusedSessionId,
    s.commandHistoryPopupOpen,
    s.shellHistory,
    s.restoreTerminalCwd,
    s.notes,
    s.noteGroups,
    handleWorkspaceDrop,
    handleTerminalContextReaderChange,
    historySessionId,
    isFocusMode,
    isSidePanelOpenForCurrentTab,
    isTerminalLayerVisible,
    resizing,
    resolveAIExecutorContext,
    sessionHostsMap,
    s.resolvedSessionHostIds,
    sessions,
    s.terminalSettings,
    showHostTreeSidebar,
    sftpActiveHost,
    s.sftpFollowTerminalCwd,
    themeState,
    workspaceById,
    workspaceInnerRef,
    workspaceOuterRef,
    workspaceOverlayRef,
    workspaceRectsById,
    s.terminalTheme,
    s.resolveSessionAppearance,
    s.hostMap,
    s.scriptRuns,
  ]);

  return <TerminalLayerView ctx={ctx} />;
}
