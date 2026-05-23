async function dirHandle(): Promise<FileSystemDirectoryHandle> {
  if (!navigator.storage?.getDirectory) {
    throw new Error("OPFS is not supported in this browser");
  }
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("media", { create: true });
}

export async function writeBlob(path: string, blob: Blob): Promise<string> {
  const dir = await dirHandle();
  const handle = await dir.getFileHandle(path, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return path;
}

export async function readBlob(path: string): Promise<Blob> {
  const dir = await dirHandle();
  const handle = await dir.getFileHandle(path);
  return handle.getFile();
}

export async function deleteFile(path: string): Promise<void> {
  const dir = await dirHandle();
  await dir.removeEntry(path).catch(() => {});
}

/** Object URL for display; caller must URL.revokeObjectURL when done. */
export async function objectUrl(path: string): Promise<string> {
  return URL.createObjectURL(await readBlob(path));
}
