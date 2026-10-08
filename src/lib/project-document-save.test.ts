import { beforeEach, expect, it, vi } from "vitest";
const exists = vi.hoisted(() => vi.fn());
vi.mock("./storage", () => ({ documentImageExists: exists }));
import { validateDocumentImages } from "./project-document-save";
const key = "project-documents/project/00000000-0000-4000-8000-000000000001.png";
const image = `![image](/api/assets?key=${encodeURIComponent(key)})`;
beforeEach(() => { exists.mockReset(); exists.mockResolvedValue(true); });
it("locks before checking rendered local images and deduplicates repeated references", async () => {
  const lock = vi.fn(async () => { expect(exists).not.toHaveBeenCalled(); });
  expect(await validateDocumentImages({ $queryRaw: lock } as never, `${image}\n${image}`)).toBe(true);
  expect(lock).toHaveBeenCalledOnce();
  expect(exists).toHaveBeenCalledExactlyOnceWith(key);
});
it("does not require objects for examples, code or external images", async () => {
  expect(await validateDocumentImages({ $queryRaw: vi.fn() } as never, `\`${image}\`\n\n![external](https://example.com/image.png)`)).toBe(true);
  expect(exists).not.toHaveBeenCalled();
});
it("rejects missing objects while preserving storage outages", async () => {
  const tx = { $queryRaw: vi.fn() } as never;
  exists.mockResolvedValue(false);
  expect(await validateDocumentImages(tx, image)).toBe(false);
  exists.mockRejectedValue(new Error("S3 unavailable"));
  await expect(validateDocumentImages(tx, image)).rejects.toThrow("S3 unavailable");
});
