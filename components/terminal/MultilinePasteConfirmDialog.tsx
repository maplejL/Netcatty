import React, { useEffect, useState } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import { countPasteLines } from "../../domain/multilinePaste";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Textarea } from "../ui/textarea";

export type MultilinePasteConfirmResult =
  | { action: "confirm"; text: string }
  | { action: "cancel" };

export type MultilinePasteConfirmRequest = {
  text: string;
  resolve: (result: MultilinePasteConfirmResult) => void;
};

export interface MultilinePasteConfirmDialogProps {
  request: MultilinePasteConfirmRequest | null;
  onSettled: () => void;
}

/**
 * Editable confirm dialog for multi-line terminal pastes.
 * Mount once near the app root (or TerminalLayer); call sites enqueue a request
 * and await the resolved action.
 */
export const MultilinePasteConfirmDialog: React.FC<MultilinePasteConfirmDialogProps> = ({
  request,
  onSettled,
}) => {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (request) {
      setDraft(request.text);
    }
  }, [request]);

  const open = !!request;
  const lineCount = countPasteLines(draft);

  const settle = (result: MultilinePasteConfirmResult) => {
    request?.resolve(result);
    onSettled();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) settle({ action: "cancel" });
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("terminal.pasteConfirm.title")}</DialogTitle>
          <DialogDescription>
            {t("terminal.pasteConfirm.description", { lines: lineCount })}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[200px] max-h-[50vh] font-mono text-xs"
          spellCheck={false}
          autoFocus
        />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => settle({ action: "cancel" })}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => settle({ action: "confirm", text: draft })}
            disabled={draft.length === 0}
          >
            {t("terminal.pasteConfirm.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
