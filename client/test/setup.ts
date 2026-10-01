import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

beforeEach(() => {
  if (typeof window === "undefined") return;
  if (!Element.prototype.getClientRects) {
    Element.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
  }
  if (!document.elementFromPoint) {
    document.elementFromPoint = () => null;
  }
  window.localStorage.clear();
  window.document.documentElement.removeAttribute("data-theme");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => cleanup());
