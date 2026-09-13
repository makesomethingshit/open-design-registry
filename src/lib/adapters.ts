import type { UnitKind } from "./revision-bundle";

export type AdapterConfidence = "high" | "medium" | "low" | "not_assessed";
export type AdapterSuggestion = {
  kind: UnitKind;
  confidence: AdapterConfidence;
  adapterId: string;
  adapterVersion: string;
  maturity: "beta";
};
export type AdapterResult = { status: "available"; suggestion: AdapterSuggestion } | { status: "unsupported" };
export type AdapterInput = { name: string; mimeType: string; content: string };

const svgRoot = /^\uFEFF?\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b/i;

export const svgAdapter = {
  suggest(input: AdapterInput): AdapterResult {
    const looksLikeSvg = input.mimeType.toLowerCase() === "image/svg+xml" || input.name.toLowerCase().endsWith(".svg");
    if (!looksLikeSvg || !svgRoot.test(input.content)) return { status: "unsupported" };
    return { status: "available", suggestion: { kind: "artboard", confidence: "low", adapterId: "svg", adapterVersion: "0.4", maturity: "beta" } };
  },
};

export const adapterRegistry = {
  suggest(input: AdapterInput): AdapterResult {
    return svgAdapter.suggest(input);
  },
};

export async function suggestFile(file: Pick<File, "name" | "type" | "slice">): Promise<AdapterResult> {
  return adapterRegistry.suggest({ name: file.name, mimeType: file.type, content: await file.slice(0, 8192).text() });
}
