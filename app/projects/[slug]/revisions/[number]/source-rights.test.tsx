import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SourceRights from "./source-rights";
import RevisionPublishForm from "../../revision-publish-form";

const hookState = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  cursor: 0,
  refCursor: 0,
  overrides: {} as Record<number, unknown>,
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hookState.cursor++;
      if (!(index in hookState.values)) hookState.values[index] = index in hookState.overrides ? hookState.overrides[index] : typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hookState.values[index], (next: unknown) => { hookState.values[index] = typeof next === "function" ? (next as (current: unknown) => unknown)(hookState.values[index]) : next; }] as const;
    },
    useRef: (initial: unknown) => {
      const index = hookState.refCursor++;
      if (!(index in hookState.refs)) hookState.refs[index] = { current: initial };
      return hookState.refs[index];
    },
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function resetHooks(overrides: Record<number, unknown> = {}) {
  hookState.values = [];
  hookState.refs = [];
  hookState.cursor = 0;
  hookState.refCursor = 0;
  hookState.overrides = overrides;
}

function beginRender() {
  hookState.cursor = 0;
  hookState.refCursor = 0;
}

type TestElement = { type: unknown; props?: Record<string, any> };

function elements(value: unknown): TestElement[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as TestElement;
  return [element, ...elements(element.props?.children)];
}

function findElement(root: unknown, predicate: (element: TestElement) => boolean) {
  const element = elements(root).find(predicate);
  if (!element) throw new Error("Expected element was not rendered");
  return element;
}

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (!value || typeof value !== "object" || !("props" in value)) return "";
  return textContent((value as TestElement).props?.children);
}

function isNamedComponent(element: TestElement, name: string) {
  return typeof element.type === "function" && element.type.name === name;
}

function findLabeledInput(root: unknown, label: string) {
  const field = findElement(root, (element) => (element.type === "label" && textContent(element).includes(label)) || (isNamedComponent(element, "Field") && textContent(element.props?.label).includes(label)));
  return findElement(field.props?.children, (element) => element.type === "input" || isNamedComponent(element, "Input"));
}

const declaration = {
  id: "declaration-1",
  version: 2,
  createdAt: "2026-09-13T00:00:00.000Z",
  sourceRightsMode: "SEPARATE" as const,
  sourceLicenseName: "Studio license",
  sourceLicenseUrl: "https://example.com/source-license",
  sourceRightsHolder: "Studio",
  notes: "Verify the source package before reuse.",
  items: [{
    type: "IMAGE" as const,
    name: "Hero image",
    rightsHolder: "Image Studio",
    licenseName: "Custom",
    licenseUrl: "https://example.com/hero-license",
    sourceUrl: "https://example.com/hero",
    redistribution: "RESTRICTED" as const,
    derivativeUse: "UNKNOWN" as const,
    notes: "Do not redistribute the original.",
  }, {
    type: "FONT" as const,
    name: "Font A",
    redistribution: "UNKNOWN" as const,
    derivativeUse: "UNKNOWN" as const,
    notes: "Font A requires a separate license review.",
  }],
};

type SourceRightsDeclaration = NonNullable<Parameters<typeof SourceRights>[0]["declaration"]>;

function props(currentDeclaration: SourceRightsDeclaration | null = declaration, currentRevisionLicense: string | null = "MIT") {
  return {
    slug: "demo",
    number: 2,
    revisionLicense: currentRevisionLicense,
    sourceHref: null,
    sourceFiles: [],
    tool: "penpot",
    toolVersion: "2",
    sourceChecksum: null,
    declaration: currentDeclaration,
    isOwner: true,
  };
}

function render(isOwner: boolean, currentDeclaration: SourceRightsDeclaration = declaration, currentRevisionLicense: string | null = "MIT") {
  resetHooks();
  return renderToStaticMarkup(createElement(SourceRights, { ...props(currentDeclaration, currentRevisionLicense), isOwner }));
}

function renderSourceRightsElement(currentRevisionLicense: string | null = "MIT") {
  resetHooks({ 0: true });
  beginRender();
  return SourceRights(props(declaration, currentRevisionLicense));
}

describe("revision source rights detail", () => {
  it("renders public rights evidence and restricted state", () => {
    const markup = render(false);

    expect(markup).toContain("Image Studio");
    expect(markup).toContain("https://example.com/hero-license");
    expect(markup).toContain("View license for Hero image");
    expect(markup).toContain("Do not redistribute the original.");
    expect(markup).toContain("Verify the source package before reuse.");
    expect(markup).toContain("rights-item-restricted");
    expect(markup).toContain("View source reference");
    const fontStart = markup.indexOf("Font A");
    const fontEnd = markup.indexOf("</li>", fontStart);
    expect(markup.slice(fontStart, fontEnd)).toContain("Notes: Font A requires a separate license review.");
    expect(markup).not.toContain('aria-label="Rights evidence"');
  });

  it("keeps the owner editing affordance on the same detail", () => {
    expect(render(true)).toContain("Add rights information");
  });

  it("renders the null-license edit state with Same as Revision disabled", () => {
    const root = renderSourceRightsElement(null);
    const sameAsRevision = findElement(root, (element) => element.type === "input" && element.props?.value === "SAME_AS_REVISION");
    expect(sameAsRevision.props?.disabled).toBe(true);
    expect(renderToStaticMarkup(root)).toContain("Unavailable because this revision has no recorded license.");
  });

  it.each(["UNKNOWN", "SAME_AS_REVISION"] as const)("removes source license metadata from the submitted %s edit while retaining the holder", async (mode) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "expected test response" }) });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const componentProps = props(declaration, "MIT");
      let root = renderSourceRightsElement("MIT");
      const modeRadio = findElement(root, (element) => element.type === "input" && element.props?.value === mode);
      modeRadio.props?.onChange();
      beginRender();
      root = SourceRights(componentProps);
      const form = findElement(root, (element) => element.type === "form");
      await form.props?.onSubmit({ preventDefault: vi.fn(), currentTarget: { checkValidity: () => true } });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body).not.toHaveProperty("sourceLicenseName");
      expect(body).not.toHaveProperty("sourceLicenseUrl");
      expect(body.sourceRightsHolder).toBe("Studio");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows a source rights holder regardless of source license mode", () => {
    const unknownDeclaration = { ...declaration, sourceRightsMode: "UNKNOWN" as const, sourceLicenseName: null, sourceLicenseUrl: null };
    expect(render(false, unknownDeclaration)).toContain("Rights holder: Studio");
  });

  it.each(["UNKNOWN", "SAME_AS_REVISION"] as const)("publishing form removes source license metadata from the hidden manifest in %s mode", (mode) => {
    resetHooks();
    beginRender();
    let root = RevisionPublishForm({ slug: "demo", existingFiles: [] });
    const separate = findElement(root, (element) => element.type === "input" && element.props?.value === "SEPARATE");
    separate.props?.onChange();
    beginRender();
    root = RevisionPublishForm({ slug: "demo", existingFiles: [] });
    findLabeledInput(root, "License name").props?.onChange({ target: { value: "Studio License" } });
    findLabeledInput(root, "License/reference URL").props?.onChange({ target: { value: "https://example.com/license" } });
    findLabeledInput(root, "Rights holder").props?.onChange({ target: { value: "Studio" } });
    const target = findElement(root, (element) => element.type === "input" && element.props?.value === mode);
    target.props?.onChange();
    beginRender();
    root = RevisionPublishForm({ slug: "demo", existingFiles: [] });
    const manifest = findElement(root, (element) => element.type === "input" && element.props?.name === "rightsManifest");
    const body = JSON.parse(manifest.props?.value as string) as Record<string, unknown>;
    expect(body.sourceRightsMode).toBe(mode);
    expect(body).not.toHaveProperty("sourceLicenseName");
    expect(body).not.toHaveProperty("sourceLicenseUrl");
    expect(body.sourceRightsHolder).toBe("Studio");
  });
});
