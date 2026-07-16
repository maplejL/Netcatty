import React from "react";
import { summarizeHostNotes } from "../../domain/hostNotes";
import { cn } from "../../lib/utils";

export interface HostNotesSummaryLineProps {
  notes?: string;
  className?: string;
  maxLength?: number;
}

/** One-line plain-text host notes excerpt for list/card scan. */
export const HostNotesSummaryLine: React.FC<HostNotesSummaryLineProps> = ({
  notes,
  className,
  maxLength,
}) => {
  const excerpt = summarizeHostNotes(notes, maxLength === undefined ? undefined : { maxLength });
  if (!excerpt) return null;

  return (
    <div
      className={cn(
        "text-[11px] text-muted-foreground truncate leading-4",
        className,
      )}
      title={excerpt}
    >
      {excerpt}
    </div>
  );
};
