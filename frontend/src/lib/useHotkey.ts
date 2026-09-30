"use client";

import { useEffect } from "react";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useHotkey(
  isMatch: (e: KeyboardEvent) => boolean,
  handler: () => void,
  options?: { enabled?: boolean; allowInInputs?: boolean }
) {
  const enabled = options?.enabled ?? true;
  const allowInInputs = options?.allowInInputs ?? true;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (!allowInInputs && isTypingTarget(e.target)) return;
      if (!isMatch(e)) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isMatch, handler, enabled, allowInInputs]);
}

export const isAltN = (e: KeyboardEvent) =>
  e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key.toLowerCase() === "n" || e.code === "KeyN");

export const isModS = (e: KeyboardEvent) =>
  (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s";
