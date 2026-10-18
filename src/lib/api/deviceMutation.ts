/** HttpOnly identity is invisible to JS. Serialize every identity-creating request across tabs,
 * so the next request sends the cookie established by the previous one. */
export async function withDeviceMutationLock<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) {
    throw new Error("Saving needs a current browser on HTTPS or localhost. Your edits remain on this page.");
  }
  return navigator.locks.request("saffron:device-mutation", { mode: "exclusive", signal }, run);
}
