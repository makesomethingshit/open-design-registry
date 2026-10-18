import { describe, expect, it } from "vitest";
import { readBoundedFormData, readBoundedJson } from "./request-body";

function jsonRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
}

describe("bounded request bodies", () => {
  it("parses JSON below the byte limit", async () => {
    expect(await readBoundedJson(jsonRequest('{"ok":true}'), 64)).toEqual({ tooLarge: false, value: { ok: true } });
  });

  it("rejects a declared Content-Length above the limit", async () => {
    expect(await readBoundedJson(jsonRequest('{"ok":true}', { "content-length": "1000" }), 64)).toEqual({ tooLarge: true, value: null });
  });

  it("rejects a streamed body above the limit", async () => {
    expect(await readBoundedJson(jsonRequest('{"value":"' + "x".repeat(100) + '"}'), 64)).toEqual({ tooLarge: true, value: null });
  });

  it("parses multipart form data below the limit", async () => {
    const form = new FormData();
    form.set("title", "Example");
    const request = new Request("http://localhost/api/test", { method: "POST", body: form });
    const result = await readBoundedFormData(request, 1024);
    expect(result.tooLarge).toBe(false);
    expect(result.form?.get("title")).toBe("Example");
  });
});
