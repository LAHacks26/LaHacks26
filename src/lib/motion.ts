import { useSyncExternalStore } from "react";

/**
 * Motion easing curves. These match the --ease-* tokens in src/app/globals.css,
 * so Tailwind utilities and Motion code use the same curves.
 */
export const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
export const EASE_IN_OUT: [number, number, number, number] = [0.77, 0, 0.175, 1];
export const EASE_DRAWER: [number, number, number, number] = [0.32, 0.72, 0, 1];

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduce(onChange: () => void) {
  const query = window.matchMedia(REDUCE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isReduce() {
  return window.matchMedia(REDUCE_QUERY).matches;
}

function serverNotReduced() {
  return false;
}

/**
 * useReducedMotion from motion, but false on the server and during hydration.
 * Motion reads the media query on the first client render, so a reduced-motion
 * user got different markup from the server (a hydration mismatch). Here the
 * preference applies from the first client commit after hydration.
 */
export function useSafeReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduce, isReduce, serverNotReduced);
}
