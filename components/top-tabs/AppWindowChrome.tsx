import { Moon, Settings, Sparkles, Sun } from 'lucide-react';
import React, { memo } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { SyncStatusButton } from '../SyncStatusButton';
import { WindowOpacityButton } from '../WindowOpacityButton';
import { WindowControls } from './TopTabItems';

const dragRegionStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties;

interface AppWindowChromeProps {
  theme: 'dark' | 'light';
  isMacClient: boolean;
  showWindowControls: boolean;
  windowOpacity: number;
  setWindowOpacity: (opacity: number) => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onSyncNow?: () => Promise<void>;
  /** Extra left padding for macOS traffic lights when this bar is the titlebar. */
  paddingLeft?: number;
  className?: string;
}

export const AppWindowChrome: React.FC<AppWindowChromeProps> = memo(({
  theme,
  isMacClient,
  showWindowControls,
  windowOpacity,
  setWindowOpacity,
  onToggleTheme,
  onOpenSettings,
  onSyncNow,
  paddingLeft = 12,
  className,
}) => {
  const { t } = useI18n();

  return (
    <div
      data-section="app-window-chrome"
      className={className ?? 'h-9 w-full flex items-center justify-end gap-0.5 app-drag flex-shrink-0'}
      style={{
        ...dragRegionStyle,
        backgroundColor: 'var(--top-tabs-bg, hsl(var(--secondary)))',
        color: 'var(--top-tabs-fg, hsl(var(--foreground)))',
        paddingLeft,
        paddingRight: showWindowControls ? 0 : 12,
      }}
    >
      <div className="flex-1 h-full app-drag" style={dragRegionStyle} aria-hidden />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 app-no-drag top-tab-utility-btn"
            style={{ color: 'var(--top-tabs-muted, hsl(var(--muted-foreground)))' }}
            onClick={() => window.dispatchEvent(new CustomEvent('netcatty:toggle-ai-panel'))}
          >
            <Sparkles size={16} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('topTabs.aiAssistant')}</TooltipContent>
      </Tooltip>
      <WindowOpacityButton
        windowOpacity={windowOpacity}
        setWindowOpacity={setWindowOpacity}
        className="h-7 w-7 shrink-0 top-tab-utility-btn"
        style={{ color: 'var(--top-tabs-muted, hsl(var(--muted-foreground)))' }}
      />
      <SyncStatusButton
        onOpenSettings={onOpenSettings}
        onSyncNow={onSyncNow}
        className="h-7 w-7 shrink-0 top-tab-utility-btn"
        style={{ color: 'var(--top-tabs-muted, hsl(var(--muted-foreground)))' }}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 app-no-drag top-tab-utility-btn"
            style={{ color: 'var(--top-tabs-muted, hsl(var(--muted-foreground)))' }}
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('topTabs.toggleTheme')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 app-no-drag top-tab-utility-btn"
            style={{ color: 'var(--top-tabs-muted, hsl(var(--muted-foreground)))' }}
            onClick={onOpenSettings}
          >
            <Settings size={16} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('topTabs.openSettings')}</TooltipContent>
      </Tooltip>
      {showWindowControls && <WindowControls />}
      {isMacClient && !showWindowControls && (
        <div className="w-2 h-9 app-drag flex-shrink-0" />
      )}
    </div>
  );
});
AppWindowChrome.displayName = 'AppWindowChrome';
