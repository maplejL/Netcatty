import type { MultilinePasteConfirmRequest, MultilinePasteConfirmResult } from "./MultilinePasteConfirmDialog";

type Listener = (request: MultilinePasteConfirmRequest | null) => void;

let pending: MultilinePasteConfirmRequest | null = null;
const listeners = new Set<Listener>();

const notify = () => {
  for (const listener of listeners) listener(pending);
};

export function subscribeMultilinePasteConfirm(listener: Listener): () => void {
  listeners.add(listener);
  listener(pending);
  return () => {
    listeners.delete(listener);
  };
}

export function getMultilinePasteConfirmRequest(): MultilinePasteConfirmRequest | null {
  return pending;
}

export function clearMultilinePasteConfirmRequest(): void {
  pending = null;
  notify();
}

/**
 * Ask the user to confirm/edit multi-line paste content.
 * Concurrent requests are cancelled so only the latest prompt stays open.
 */
export function requestMultilinePasteConfirm(text: string): Promise<MultilinePasteConfirmResult> {
  if (pending) {
    pending.resolve({ action: "cancel" });
    pending = null;
  }

  return new Promise<MultilinePasteConfirmResult>((resolve) => {
    pending = {
      text,
      resolve: (result) => {
        pending = null;
        notify();
        resolve(result);
      },
    };
    notify();
  });
}
