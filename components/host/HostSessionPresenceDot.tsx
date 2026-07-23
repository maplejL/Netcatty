import React from 'react';

import type { HostSessionPresence } from '../../domain/hostSessionPresence';
import { cn } from '../../lib/utils';

const PRESENCE_TONE: Record<Exclude<HostSessionPresence, 'none'>, string> = {
  connected: 'bg-emerald-400',
  connecting: 'bg-amber-400',
  'open-disconnected': 'bg-rose-500',
};

export function HostSessionPresenceDot({
  presence,
  className,
}: {
  presence: HostSessionPresence;
  className?: string;
}) {
  if (presence === 'none') return null;
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full ring-2 ring-background',
        PRESENCE_TONE[presence],
        className,
      )}
      data-host-presence={presence}
      aria-hidden
    />
  );
}

/** Distro avatar with a bottom-right session presence indicator. */
export function HostAvatarWithPresence({
  presence,
  className,
  children,
}: {
  presence: HostSessionPresence;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {children}
      <HostSessionPresenceDot
        presence={presence}
        className="absolute -bottom-0.5 -right-0.5"
      />
    </span>
  );
}
