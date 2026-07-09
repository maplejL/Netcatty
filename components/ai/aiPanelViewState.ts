import type {
  AIPanelView,
  AISession,
} from "../../infrastructure/ai/types.ts";

const DEFAULT_PANEL_VIEW: AIPanelView = { mode: "draft" };

export function panelViewsEqual(
  left: AIPanelView,
  right: AIPanelView,
): boolean {
  if (left === right) {
    return true;
  }
  if (left.mode !== right.mode) {
    return false;
  }
  if (left.mode === "session" && right.mode === "session") {
    return left.sessionId === right.sessionId;
  }
  return true;
}

interface HistorySessionSelectionActions {
  showSessionView: (sessionId: string) => void;
  setActiveSessionId: (sessionId: string) => void;
  closeHistory?: () => void;
}

interface DraftEntrySelectionActions {
  ensureDraft: () => void;
  showDraftView: () => void;
  preserveSessionView?: boolean;
}

function toKnownSessionIds(knownSessions: AISession[] | ReadonlySet<string>): ReadonlySet<string> {
  return knownSessions instanceof Set
    ? knownSessions
    : new Set(knownSessions.map((session) => session.id));
}

export function resolveDisplayedPanelView(
  panelView: AIPanelView | undefined,
  hasDraft: boolean,
  sessions: AISession[],
  persistedSessionId?: string | null,
  scopeType: "terminal" | "workspace" = "workspace",
  /**
   * Optional broader session id set used only for "does this session still exist?"
   * checks. Scoped history may lag (deferred value / rank filter) while the
   * session is still live in the global store — do not demote to draft then.
   */
  knownSessions: AISession[] | ReadonlySet<string> = sessions,
): AIPanelView {
  const knownSessionIds = toKnownSessionIds(knownSessions);
  if (panelView) {
    return normalizePanelView(panelView, knownSessionIds);
  }

  if (hasDraft) {
    return DEFAULT_PANEL_VIEW;
  }

  // New terminal sessions should always start from a blank draft. History is
  // still available in the drawer, but never auto-resumed into a fresh SSH tab.
  if (scopeType === "terminal") {
    return DEFAULT_PANEL_VIEW;
  }

  // Honour the persisted active-session selection (survives cold mount)
  // before falling back to the newest history entry.
  if (persistedSessionId && knownSessionIds.has(persistedSessionId)) {
    return { mode: "session", sessionId: persistedSessionId };
  }

  if (sessions[0]) {
    return { mode: "session", sessionId: sessions[0].id };
  }

  return DEFAULT_PANEL_VIEW;
}

export function normalizePanelView(
  panelView: AIPanelView,
  knownSessions: AISession[] | ReadonlySet<string>,
): AIPanelView {
  if (panelView.mode !== "session") {
    return panelView;
  }

  const knownSessionIds = toKnownSessionIds(knownSessions);
  return knownSessionIds.has(panelView.sessionId)
    ? panelView
    : DEFAULT_PANEL_VIEW;
}

export function resolveDisplayedSession(
  panelView: AIPanelView,
  sessions: AISession[],
  /**
   * Fallback lookup when the preferred (scoped/history) list does not contain
   * the active session id — e.g. deferred history lag during agent rebind.
   */
  fallbackSessions: AISession[] = sessions,
): AISession | null {
  if (panelView.mode !== "session") {
    return null;
  }

  return (
    sessions.find((session) => session.id === panelView.sessionId)
    ?? fallbackSessions.find((session) => session.id === panelView.sessionId)
    ?? null
  );
}

export function applyHistorySessionSelection(
  sessionId: string,
  actions: HistorySessionSelectionActions,
): void {
  actions.showSessionView(sessionId);
  actions.setActiveSessionId(sessionId);
  actions.closeHistory?.();
}

export function applyDraftEntrySelection(
  actions: DraftEntrySelectionActions,
): void {
  actions.ensureDraft();
  if (!actions.preserveSessionView) {
    actions.showDraftView();
  }
}
