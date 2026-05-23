/** Stable unique id for records. crypto.randomUUID is available in Safari 15.4+. */
export function newId(): string {
  return crypto.randomUUID();
}
