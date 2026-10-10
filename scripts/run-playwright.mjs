import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

export function redactAuthHeaders(line) {
  return line.replace(/\b(cookie|set-cookie|authorization|proxy-authorization)(\s*:\s*).*$/i, "$1$2[REDACTED]");
}

export function relayRedacted(input, output) {
  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on("line", (line) => output.write(`${redactAuthHeaders(line)}\n`));
  return lines;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve("@playwright/test/package.json")), "cli.js");
  const child = spawn(process.execPath, [cli, "test", ...process.argv.slice(2)], { stdio: ["inherit", "pipe", "pipe"] });
  // Playwright includes cookie headers in failed API-request call logs.
  relayRedacted(child.stdout, process.stdout);
  relayRedacted(child.stderr, process.stderr);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("error", () => { console.error("Playwright could not be started."); process.exitCode = 1; });
  child.on("close", (code) => { process.exitCode = code ?? 1; });
}
