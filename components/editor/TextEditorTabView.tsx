/**
 * TextEditorTabView — thin wrapper that binds an editorTab entry to TextEditorPane.
 *
 * Each tab has its own instance (keyed by tabId), so Monaco is never torn down
 * on tab-switch — we just toggle CSS visibility via the `isVisible` prop.
 * When a compare pair is active (#830), both panes stay visible side-by-side.
 */
import type * as Monaco from 'monaco-editor';
import React, { useCallback, useMemo } from 'react';
import { Columns2, X } from 'lucide-react';

import { useI18n } from '../../application/i18n/I18nProvider';
import { saveEditorTab } from '../../application/state/editorTabSave';
import {
  editorTabStore,
  useEditorComparePair,
  useEditorTab,
  type EditorTabId,
} from '../../application/state/editorTabStore';
import { useIsEditorTabActive } from '../../application/state/activeTabStore';
import { useTerminalHostTreeLayoutWidth } from '../../application/state/terminalHostTreeStore';
import type { HotkeyScheme, KeyBinding } from '../../domain/models';
import type { Host } from '../../types';
import { Button } from '../ui/button';
import { toast } from '../ui/toast';
import { TextEditorPane } from './TextEditorPane';

export interface TextEditorTabViewProps {
  tabId: EditorTabId;
  hotkeyScheme: HotkeyScheme;
  keyBindings: KeyBinding[];
  /** Host lookup for building the `host:remotePath` subtitle next to the filename. */
  hostById: Map<string, Host>;
  /** Routed into Monaco's Cmd/Ctrl+W command so closing the editor tab works
   * even when focus is inside the editor (Monaco otherwise swallows the event). */
  onRequestClose: (tabId: EditorTabId) => void;
}

export function getTextEditorTabShellStyle(
  isVisible: boolean,
  hostTreeLayoutWidth: number,
  layout?: { left?: string | number; width?: string | number; right?: string | number },
): React.CSSProperties {
  return {
    ...(isVisible ? null : { pointerEvents: 'none', visibility: 'hidden' }),
    zIndex: 20,
    left: layout?.left ?? hostTreeLayoutWidth,
    ...(layout?.width != null ? { width: layout.width } : null),
    ...(layout?.right != null ? { right: layout.right } : null),
  };
}

export const TextEditorTabView: React.FC<TextEditorTabViewProps> = ({
  tabId,
  hotkeyScheme,
  keyBindings,
  hostById,
  onRequestClose,
}) => {
  const { t } = useI18n();
  const tab = useEditorTab(tabId);
  // Self-subscribe visibility so switching tabs only re-renders this editor
  // instance, not AppView/App.
  const isActive = useIsEditorTabActive(tabId);
  const comparePair = useEditorComparePair();
  const hostTreeLayoutWidth = useTerminalHostTreeLayoutWidth();

  const compareSide = useMemo<"left" | "right" | null>(() => {
    if (!comparePair) return null;
    if (comparePair[0] === tabId) return "left";
    if (comparePair[1] === tabId) return "right";
    return null;
  }, [comparePair, tabId]);

  const isVisible = isActive || compareSide !== null;

  const shellLayout = useMemo(() => {
    if (!comparePair || compareSide === null) {
      return { left: hostTreeLayoutWidth, right: 0 as const };
    }
    // Side-by-side: each pane takes half of the content area right of the host tree.
    const half = `calc((100% - ${hostTreeLayoutWidth}px) / 2)`;
    if (compareSide === "left") {
      return { left: hostTreeLayoutWidth, width: half };
    }
    return { left: `calc(${hostTreeLayoutWidth}px + ${half})`, width: half };
  }, [comparePair, compareSide, hostTreeLayoutWidth]);

  const handleContentChange = useCallback(
    (content: string, viewState: Monaco.editor.ICodeEditorViewState | null) => {
      editorTabStore.updateContent(tabId, content, viewState);
    },
    [tabId],
  );

  const handleLanguageChange = useCallback(
    (lang: string) => {
      editorTabStore.setLanguage(tabId, lang);
    },
    [tabId],
  );

  const handleToggleWordWrap = useCallback(() => {
    const current = editorTabStore.getTab(tabId);
    if (!current) return;
    editorTabStore.setWordWrap(tabId, !current.wordWrap);
  }, [tabId]);

  const handleSave = useCallback(async () => {
    const ok = await saveEditorTab(tabId);
    if (ok) {
      toast.success(t('sftp.editor.saved'), 'SFTP');
    } else {
      const msg = editorTabStore.getTab(tabId)?.saveError ?? t('sftp.editor.saveFailed');
      toast.error(msg, 'SFTP');
    }
  }, [tabId, t]);

  const handleRequestClose = useCallback(() => {
    onRequestClose(tabId);
  }, [onRequestClose, tabId]);

  // Tab has been closed — render nothing (parent should remove this instance,
  // but guard here in case of a transient render before unmount).
  if (!tab) return null;

  const isDirty = tab.content !== tab.baselineContent;
  // Subtitle shown next to the filename in the Pane header, e.g.
  // "Rainyun-114.66.26.174:/root/hello-server.go". Falls back to hostId when
  // we don't have a Host record (session may have been removed).
  const host = hostById.get(tab.hostId);
  const hostLabel = host?.label ?? tab.hostId;
  const subtitle = `${hostLabel}:${tab.remotePath}`;

  return (
    // Sibling tab panels (VaultView, SftpView, TerminalLayerMount, LogView)
    // all fill their flex-1 parent via `absolute inset-0`. Match that here so
    // an inactive editor tab doesn't collapse to zero height in normal flow,
    // and an active one fills the viewport instead of stacking beneath others.
    // z-index high enough to stay above the terminal workspace while leaving
    // room for the shared host sidebar when it is open.
    <div
      style={getTextEditorTabShellStyle(isVisible, hostTreeLayoutWidth, shellLayout)}
      className={`absolute top-0 bottom-0 min-h-0 flex flex-col bg-background ${
        compareSide === "left" ? "border-r border-border/60" : ""
      } ${compareSide === null ? "right-0" : ""}`}
    >
      {compareSide !== null && (
        <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-border/60 shrink-0 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 truncate">
            <Columns2 size={12} />
            {t("sftp.editor.compareMode")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={() => editorTabStore.clearComparePair()}
          >
            <X size={12} className="mr-1" />
            {t("sftp.editor.exitCompare")}
          </Button>
        </div>
      )}
      <TextEditorPane
        chrome="tab"
        fileName={`${tab.fileName}${isDirty ? ' *' : ''}`}
        subtitle={subtitle}
        onRequestClose={handleRequestClose}
        content={tab.content}
        languageId={tab.languageId}
        wordWrap={tab.wordWrap}
        saving={tab.savingState === 'saving'}
        saveError={tab.saveError}
        hotkeyScheme={hotkeyScheme}
        keyBindings={keyBindings}
        onContentChange={handleContentChange}
        onLanguageChange={handleLanguageChange}
        onToggleWordWrap={handleToggleWordWrap}
        onSave={handleSave}
        initialViewState={tab.viewState}
      />
    </div>
  );
};

export default TextEditorTabView;
