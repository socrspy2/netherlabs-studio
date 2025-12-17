import { db } from "./db";

export async function putFrameBlob(id: string, blob: Blob) {
  await db.frameBlobs.put({ id, blob, createdAt: Date.now() });
  return id;
}

export async function getFrameBlob(id: string) {
  return (await db.frameBlobs.get(id))?.blob ?? null;
}
