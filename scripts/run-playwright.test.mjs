import { PassThrough } from "node:stream";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { redactAuthHeaders, relayRedacted } from "./run-playwright.mjs";

describe("Playwright public log redaction", () => {
  it.each(["cookie", "Set-Cookie", "Authorization", "Proxy-Authorization"])("removes %s values while retaining the diagnostic header", (header) => {
    expect(redactAuthHeaders(`  - ${header}: disposable-sensitive-value`)).toBe(`  - ${header}: [REDACTED]`);
  });

  it("retains unrelated failure diagnostics", () => {
    const line = "Error: apiRequestContext.get: read ECONNRESET";
    expect(redactAuthHeaders(line)).toBe(line);
  });

  it("redacts headers split across chunks and an unterminated final line", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let text = "";
    output.on("data", (chunk) => { text += chunk; });
    const reader = relayRedacted(input, output);
    input.write("request failed\r\n - cook");
    input.write("ie: disposable-");
    input.end("sensitive-value");
    await once(reader, "close");
    expect(text).toBe("request failed\n - cookie: [REDACTED]\n");
  });
});
