import { useEffect, type RefObject } from "react";

const focusable =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function useDialogA11y(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  backgroundSelector = "#today-content",
  fallbackFocusSelector?: string,
): void {
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = [...document.querySelectorAll<HTMLElement>(backgroundSelector)];
    const fallbackFocus = fallbackFocusSelector
      ? document.querySelector<HTMLElement>(fallbackFocusSelector)
      : null;
    for (const element of background) element.inert = true;
    const first = dialogRef.current?.querySelector<HTMLElement>(focusable);
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>(focusable)];
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items.at(-1);
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem?.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      for (const element of background) element.inert = false;
      if (previousFocus?.isConnected) previousFocus.focus();
      else fallbackFocus?.focus();
    };
  }, [backgroundSelector, dialogRef, fallbackFocusSelector, onClose]);
}
