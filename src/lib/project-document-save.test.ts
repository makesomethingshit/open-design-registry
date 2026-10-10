import { beforeEach, expect, it, vi } from "vitest";
const exists = vi.hoisted(() => vi.fn());
vi.mock("./storage", () => ({ documentImageExists: exists }));
import { validateDocumentImages, validateDocumentImageReferences } from "./project-document-save";
const key = "project-documents/project/00000000-0000-4000-8000-000000000001.png";
const image = `![image](/api/assets?key=${encodeURIComponent(key)})`;
const deletion = { findFirst: vi.fn().mockResolvedValue(null) };
beforeEach(() => { exists.mockReset(); exists.mockResolvedValue(true); });
it("locks before checking rendered local images and deduplicates repeated references", async () => {
  const lock = vi.fn(async () => { expect(exists).not.toHaveBeenCalled(); });
  expect(await validateDocumentImages({ $queryRaw: lock, documentImageDeletion: deletion } as never, `${image}\n${image}`)).toBe(true);
  expect(lock).toHaveBeenCalledOnce();
  expect(exists).toHaveBeenCalledExactlyOnceWith(key, expect.any(AbortSignal));
});
it("validates configured legacy URLs and bounds parallel object checks", async () => {
  vi.stubEnv("S3_BUCKET", "test"); vi.stubEnv("S3_ENDPOINT", "http://local");
  let active = 0, max = 0;
  const checker = vi.fn(async () => { active++; max = Math.max(max, active); await new Promise((resolve) => setImmediate(resolve)); active--; return true; });
  const urls = Array.from({ length: 20 }, (_, i) => `http://local/test/project-documents/p/00000000-0000-4000-8000-${String(i).padStart(12, "0")}.png?v=1#image`);
  expect(await validateDocumentImageReferences({ $queryRaw: vi.fn(), documentImageDeletion: deletion } as never, urls, checker)).toBe(true);
  expect(checker).toHaveBeenCalledTimes(20); expect(max).toBe(8);
  vi.unstubAllEnvs();
});
it("does not require objects for examples, code or external images", async () => {
  expect(await validateDocumentImages({ $queryRaw: vi.fn() } as never, `\`${image}\`\n\n![external](https://example.com/image.png)`)).toBe(true);
  expect(exists).not.toHaveBeenCalled();
});
it("does not check another registry's absolute proxy image against local storage", async () => {
  vi.stubEnv("BETTER_AUTH_URL", "https://registry.example");
  const tx = { $queryRaw: vi.fn() } as never;
  expect(await validateDocumentImages(tx, `![remote](https://other.example/api/assets?key=${encodeURIComponent(key)})`)).toBe(true);
  expect(exists).not.toHaveBeenCalled(); vi.unstubAllEnvs();
});
it("rejects missing objects while preserving storage outages", async () => {
  const tx = { $queryRaw: vi.fn(), documentImageDeletion: deletion } as never;
  exists.mockResolvedValue(false);
  expect(await validateDocumentImages(tx, image)).toBe(false);
  exists.mockRejectedValue(new Error("S3 unavailable"));
  await expect(validateDocumentImages(tx, image)).rejects.toThrow("S3 unavailable");
});
it("rejects a committed deletion intent even while the object still exists", async () => {
  const tx = { $queryRaw: vi.fn(), documentImageDeletion: { findFirst: vi.fn().mockResolvedValue({ key }) } } as never;
  expect(await validateDocumentImages(tx, image)).toBe(false);
  expect(exists).not.toHaveBeenCalled();
});
it("rejects marked absolute legacy images rendered in the document", async () => {
  vi.stubEnv("S3_BUCKET", "test"); vi.stubEnv("S3_ENDPOINT", "http://local");
  const tx = { $queryRaw: vi.fn(), documentImageDeletion: { findFirst: vi.fn().mockResolvedValue({ key }) } } as never;
  expect(await validateDocumentImages(tx, `![image](http://local/test/${key}?version=1#preview)`)).toBe(false);
  expect(exists).not.toHaveBeenCalled(); vi.unstubAllEnvs();
});
