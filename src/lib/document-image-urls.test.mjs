import { expect, it } from "vitest";
import { documentImageKeyFromUrl, encodedKeyPattern } from "./document-image-urls.mjs";
const key = "project-documents/p/00000000-0000-4000-8000-000000000001.png";
const settings = { bucket: "test", endpoint: "http://localhost:9135/storage", region: "us-east-1" };
it("resolves local proxy and configured legacy paths including queries, fragments and encodings", () => {
  for (const value of [key, `/api/assets?key=${encodeURIComponent(key)}`, `http://localhost:9135/storage/test/${key}?v=2#download`, `http://localhost:9135/storage/test/${key.replace("project", "%70roject")}`]) expect(documentImageKeyFromUrl(value, settings)).toBe(key);
  expect(documentImageKeyFromUrl(`https://test.s3.us-east-1.amazonaws.com/${key}#download`, { bucket: "test", endpoint: "", region: "us-east-1" })).toBe(key);
  expect(documentImageKeyFromUrl(`https://evil.test/test/${key}`, settings)).toBeUndefined();
  expect(documentImageKeyFromUrl(`http://localhost:9135/storage/other/${key}`, settings)).toBeUndefined();
});
it("matches raw, mixed percent and double encoded reference forms without fetching documents", () => {
  const pattern = new RegExp(encodedKeyPattern(key), "i");
  for (const value of [key, encodeURIComponent(key), encodeURIComponent(encodeURIComponent(key)), key.replace("project", "%70roject")]) expect(pattern.test(value)).toBe(true);
});
