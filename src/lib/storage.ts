/**
 * Ask the browser to keep our storage durable (best-effort; iOS may decline).
 * Returns whether storage is persisted after the request.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!("storage" in navigator) || !navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
