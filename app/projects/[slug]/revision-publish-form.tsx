"use client";

import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CapabilityBadge from "@/app/capability-badge";
import { Banner } from "@/src/components/ui/banner";
import { Button, TextLink } from "@/src/components/ui/button";
import { Field, Input, Select, Textarea } from "@/src/components/ui/field";
import { focusFirstInvalid, invalidFieldErrors } from "@/src/components/ui/form";
import { suggestFile, type AdapterSuggestion } from "@/src/lib/adapters";
import { sourceLicenseFieldsForMode } from "@/src/lib/rights";

type ExistingFile = { id: string; name: string; kind?: string };
type SuggestionState = { status: "detecting" | "unsupported" | "error" | "preserved" } | { status: "available"; suggestion: AdapterSuggestion };
export type RightsDraftItem = { type: "SOURCE_FILE" | "FONT" | "IMAGE" | "ILLUSTRATION" | "ICON" | "TEMPLATE" | "OTHER"; name: string; sourceFileId?: string; rightsHolder?: string; licenseName?: string; licenseUrl?: string; sourceUrl?: string; redistribution: "UNKNOWN" | "ALLOWED" | "RESTRICTED" | "NOT_ALLOWED"; derivativeUse: "UNKNOWN" | "ALLOWED" | "RESTRICTED" | "NOT_ALLOWED"; notes?: string };

export function createNewBundleFileId() {
  return crypto.randomUUID();
}

export function remapRightsSourceFileId(items: RightsDraftItem[], previousId: string | undefined, nextId: string | undefined) {
  if (!previousId || previousId === nextId) return items;
  return items.map((item) => item.sourceFileId === previousId ? { ...item, sourceFileId: nextId || undefined } : item);
}

export function clearRightsSourceFileIds(items: RightsDraftItem[], ids: readonly string[]) {
  const removed = new Set(ids.filter(Boolean));
  return removed.size ? items.map((item) => removed.has(item.sourceFileId ?? "") ? { ...item, sourceFileId: undefined } : item) : items;
}

function kindLabel(kind?: string) {
  return kind ? `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}` : "Asset · legacy";
}

export function nextSuggestionRequest(requests: number[], counter: { current: number }, index: number) {
  const request = counter.current + 1;
  counter.current = request;
  requests[index] = request;
  return request;
}

export function isCurrentSuggestionRequest(requests: readonly number[], index: number, request: number) {
  return requests[index] === request;
}

export function applySuggestedKind(kinds: string[], index: number, request: number, currentRequest: number | undefined) {
  return request === currentRequest ? kinds.map((value, currentIndex) => currentIndex === index && !value ? "auto" : value) : kinds;
}

export default function RevisionPublishForm({ slug, existingFiles, contributionReturn }: { slug: string; existingFiles: ExistingFile[]; contributionReturn?: { targetSlug: string; baseRevision: number; relatedIssueId?: string } }) {
  const router = useRouter();
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [sourceFileIds, setSourceFileIds] = useState<string[]>([]);
  const [sourceBundleFileIds, setSourceBundleFileIds] = useState<string[]>([]);
  const [sourceKinds, setSourceKinds] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionState[]>([]);
  const [previewFiles, setPreviewFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [rightsSourceMode, setRightsSourceMode] = useState<"SAME_AS_REVISION" | "SEPARATE" | "UNKNOWN">("UNKNOWN");
  const [rightsSourceLicenseName, setRightsSourceLicenseName] = useState("");
  const [rightsSourceLicenseUrl, setRightsSourceLicenseUrl] = useState("");
  const [rightsSourceHolder, setRightsSourceHolder] = useState("");
  const [rightsItems, setRightsItems] = useState<RightsDraftItem[]>([]);
  const suggestionRequests = useRef<number[]>([]);
  const suggestionRequestCounter = useRef(0);
  const sourceFileIdsRef = useRef<string[]>([]);
  const sourceBundleFileIdsRef = useRef<string[]>([]);

  function selectRightsSourceMode(mode: "SAME_AS_REVISION" | "SEPARATE" | "UNKNOWN") {
    setRightsSourceMode(mode);
    const fields = sourceLicenseFieldsForMode(mode, rightsSourceLicenseName, rightsSourceLicenseUrl);
    setRightsSourceLicenseName(fields.sourceLicenseName);
    setRightsSourceLicenseUrl(fields.sourceLicenseUrl);
  }

  function updateSuggestion(index: number, suggestion: SuggestionState) {
    setSuggestions((current) => current.map((value, currentIndex) => currentIndex === index ? suggestion : value));
  }

  function detectSuggestion(file: File, index: number) {
    const request = nextSuggestionRequest(suggestionRequests.current, suggestionRequestCounter, index);
    updateSuggestion(index, { status: "detecting" });
    void suggestFile(file).then((result) => {
      if (!isCurrentSuggestionRequest(suggestionRequests.current, index, request)) return;
      if (result.status !== "available" || result.suggestion.confidence === "not_assessed") {
        updateSuggestion(index, { status: "unsupported" });
        return;
      }
      updateSuggestion(index, { status: "available", suggestion: result.suggestion });
      const mapped = existingFiles.find((candidate) => candidate.id === sourceFileIdsRef.current[index]);
      if (!mapped?.kind) setSourceKinds((current) => applySuggestedKind(current, index, request, suggestionRequests.current[index]));
    }).catch(() => {
      if (isCurrentSuggestionRequest(suggestionRequests.current, index, request)) updateSuggestion(index, { status: "error" });
    });
  }

  function selectSources(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const previousBundleIds = [...sourceFileIdsRef.current, ...sourceBundleFileIdsRef.current];
    setRightsItems((current) => clearRightsSourceFileIds(current, previousBundleIds));
    sourceFileIdsRef.current = files.map(() => "");
    sourceBundleFileIdsRef.current = files.map(() => createNewBundleFileId());
    setSourceFiles(files);
    setSourceFileIds(sourceFileIdsRef.current);
    setSourceBundleFileIds(sourceBundleFileIdsRef.current);
    setSourceKinds(files.map(() => ""));
    setSuggestions(files.map(() => ({ status: "detecting" })));
    files.forEach((file, index) => detectSuggestion(file, index));
  }

  function selectExisting(index: number, id: string) {
    const existing = existingFiles.find((file) => file.id === id);
    const previousBundleId = sourceBundleFileIdsRef.current[index];
    const bundleId = id || createNewBundleFileId();
    if (previousBundleId !== bundleId) setRightsItems((current) => remapRightsSourceFileId(current, previousBundleId, bundleId));
    sourceFileIdsRef.current = sourceFileIdsRef.current.map((value, currentIndex) => currentIndex === index ? id : value);
    sourceBundleFileIdsRef.current = sourceBundleFileIdsRef.current.map((value, currentIndex) => currentIndex === index ? bundleId : value);
    setSourceFileIds(sourceFileIdsRef.current);
    setSourceBundleFileIds(sourceBundleFileIdsRef.current);
    setSourceKinds((current) => current.map((value, currentIndex) => currentIndex === index ? "" : value));
    if (existing?.kind) {
      nextSuggestionRequest(suggestionRequests.current, suggestionRequestCounter, index);
      updateSuggestion(index, { status: "preserved" });
    } else if (sourceFiles[index]) {
      detectSuggestion(sourceFiles[index], index);
    }
  }

  function selectPreviews(event: ChangeEvent<HTMLInputElement>) {
    setPreviewFiles(Array.from(event.target.files ?? []));
  }

  function updateRightsItem(index: number, patch: Partial<RightsDraftItem>) {
    setRightsItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!formElement.checkValidity()) {
      setFieldErrors(invalidFieldErrors(formElement));
      focusFirstInvalid(formElement);
      return;
    }
    setFieldErrors({});
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${slug}/revisions`, { method: "POST", body: new FormData(formElement) });
      const payload = await response.json().catch(() => null) as { error?: string; number?: number } | null;
      if (!response.ok) {
        setError(payload?.error ?? "Revision could not be published");
        return;
      }
      if (typeof payload?.number !== "number") {
        setError("Revision could not be published");
        return;
      }
      if (contributionReturn) {
        const params = new URLSearchParams({ baseRevision: String(contributionReturn.baseRevision), sourceProject: slug, sourceRevision: String(payload.number) });
        if (contributionReturn.relatedIssueId) params.set("relatedIssue", contributionReturn.relatedIssueId);
        router.push(`/projects/${encodeURIComponent(contributionReturn.targetSlug)}/contribute?${params}`);
      } else router.push(`/projects/${slug}/revisions/${payload.number}`);
    } catch {
      setError("Revision could not be published");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="form revision-publish-form" onSubmit={submit} aria-busy={submitting}>
    <h2>Publish a revision</h2>
    <p className="meta">A Revision is a new, permanent record of changes in your work project. It does not send a Proposal yet.</p>
    <Banner title="Before you publish" tone="info">Open the source in your design tool, make your changes, then publish the updated source and preview here.</Banner>
    {contributionReturn && <TextLink href={`/projects/${encodeURIComponent(contributionReturn.targetSlug)}/contribute?${new URLSearchParams({ baseRevision: String(contributionReturn.baseRevision), ...(contributionReturn.relatedIssueId ? { relatedIssue: contributionReturn.relatedIssueId } : {}) })}`}>Back to the original contribution</TextLink>}
    <Field error={fieldErrors.title} id="publish-title" invalid={Boolean(fieldErrors.title)} label="Revision title" required><Input name="title" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.title; return next; })} required maxLength={120} /></Field>
    <Field error={fieldErrors.changeDescription} id="publish-description" invalid={Boolean(fieldErrors.changeDescription)} label="Change description" required><Textarea name="changeDescription" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.changeDescription; return next; })} required minLength={1} maxLength={500} /></Field>
    <Field error={fieldErrors.tool} id="publish-tool" invalid={Boolean(fieldErrors.tool)} label="Design tool"><Input name="tool" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.tool; return next; })} maxLength={80} placeholder="Figma, Penpot, or Photoshop" /></Field>
    <Field error={fieldErrors.toolVersion} id="publish-tool-version" invalid={Boolean(fieldErrors.toolVersion)} label="Tool version"><Input name="toolVersion" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.toolVersion; return next; })} maxLength={80} placeholder="Optional" /></Field>
    <Field error={fieldErrors.tags} id="publish-tags" invalid={Boolean(fieldErrors.tags)} label="Tags"><Input name="tags" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.tags; return next; })} maxLength={800} placeholder="ui, landing-page, mobile" /></Field>
    <Field error={fieldErrors.sources} id="publish-sources" invalid={Boolean(fieldErrors.sources)} label="Source files (up to 10 original files)"><Input name="sources" type="file" multiple onChange={selectSources} /></Field>
    <p className="meta">Use a source URL instead when no files are uploaded. ZIP contents are kept as one file.</p>
    <Field error={fieldErrors.sourceUrl} id="publish-source-url" invalid={Boolean(fieldErrors.sourceUrl)} label="Source URL"><Input name="sourceUrl" type="url" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.sourceUrl; return next; })} placeholder="https://example.com/design.zip" /></Field>
    <Field error={fieldErrors.sourceChecksum} id="publish-source-checksum" invalid={Boolean(fieldErrors.sourceChecksum)} label="Source SHA-256 checksum"><Input name="sourceChecksum" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.sourceChecksum; return next; })} inputMode="text" pattern="[a-fA-F0-9]{64}" maxLength={64} placeholder="Optional for one uploaded file" /></Field>
    <fieldset className="rights-form"><legend>Source &amp; rights</legend>
      <p className="meta">Rights are contributor-supplied declarations. Unknown values do not block publication.</p>
      <Field id="publish-rights-same" label="Same as Revision license"><input type="radio" name="rightsSourceMode" value="SAME_AS_REVISION" checked={rightsSourceMode === "SAME_AS_REVISION"} onChange={() => selectRightsSourceMode("SAME_AS_REVISION")} /></Field>
      <Field id="publish-rights-separate" label="Different license"><input type="radio" name="rightsSourceMode" value="SEPARATE" checked={rightsSourceMode === "SEPARATE"} onChange={() => selectRightsSourceMode("SEPARATE")} /></Field>
      <Field id="publish-rights-unknown" label="Unknown / not declared"><input type="radio" name="rightsSourceMode" value="UNKNOWN" checked={rightsSourceMode === "UNKNOWN"} onChange={() => selectRightsSourceMode("UNKNOWN")} /></Field>
      <div className="rights-form-grid">{rightsSourceMode === "SEPARATE" && <><Field id="publish-rights-license-name" label="License name" required><Input value={rightsSourceLicenseName} onChange={(event) => setRightsSourceLicenseName(event.target.value)} required /></Field><Field id="publish-rights-license-url" label="License/reference URL"><Input type="url" value={rightsSourceLicenseUrl} onChange={(event) => setRightsSourceLicenseUrl(event.target.value)} /></Field></>}<Field id="publish-rights-holder" label="Rights holder"><Input value={rightsSourceHolder} onChange={(event) => setRightsSourceHolder(event.target.value)} /></Field></div>
      <div className="rights-form-heading"><h3>Dependencies &amp; third-party assets</h3><Button size="sm" type="button" variant="secondary" onClick={() => setRightsItems((current) => [...current, { type: "OTHER", name: "", redistribution: "UNKNOWN", derivativeUse: "UNKNOWN" }])}>Add dependency</Button></div>
      {rightsItems.map((item, index) => <div className="rights-form-item" key={index}>
        <Field id={`publish-rights-item-${index}-name`} label="Name" required><Input value={item.name} onChange={(event) => updateRightsItem(index, { name: event.target.value })} required /></Field>
        <Field id={`publish-rights-item-${index}-type`} label="Type"><Select value={item.type} onChange={(event) => updateRightsItem(index, { type: event.target.value as RightsDraftItem["type"] })}>{["SOURCE_FILE", "FONT", "IMAGE", "ILLUSTRATION", "ICON", "TEMPLATE", "OTHER"].map((type) => <option key={type} value={type}>{kindLabel(type.toLowerCase())}</option>)}</Select></Field>
        <Field id={`publish-rights-item-${index}-source`} label="Source bundle file (optional)"><Select value={item.sourceFileId ?? ""} onChange={(event) => updateRightsItem(index, { sourceFileId: event.target.value || undefined })}><option value="">External dependency</option>{existingFiles.map((file) => <option key={file.id} value={file.id}>{file.name} - Existing source</option>)}{sourceFiles.map((file, fileIndex) => <option key={sourceBundleFileIds[fileIndex]} value={sourceBundleFileIds[fileIndex]}>{file.name} - New upload</option>)}</Select></Field>
        <Field id={`publish-rights-item-${index}-redistribution`} label="Redistribution"><Select aria-label={`Redistribution for ${item.name || "dependency"}`} value={item.redistribution} onChange={(event) => updateRightsItem(index, { redistribution: event.target.value as RightsDraftItem["redistribution"] })}>{["UNKNOWN", "ALLOWED", "RESTRICTED", "NOT_ALLOWED"].map((value) => <option key={value} value={value}>{value === "UNKNOWN" ? "Unknown" : value === "ALLOWED" ? "Declared allowed" : value === "RESTRICTED" ? "Restricted" : "Declared not allowed"}</option>)}</Select></Field>
        <Field id={`publish-rights-item-${index}-derivative`} label="Derivative use"><Select aria-label={`Derivative use for ${item.name || "dependency"}`} value={item.derivativeUse} onChange={(event) => updateRightsItem(index, { derivativeUse: event.target.value as RightsDraftItem["derivativeUse"] })}>{["UNKNOWN", "ALLOWED", "RESTRICTED", "NOT_ALLOWED"].map((value) => <option key={value} value={value}>{value === "UNKNOWN" ? "Unknown" : value === "ALLOWED" ? "Declared allowed" : value === "RESTRICTED" ? "Restricted" : "Declared not allowed"}</option>)}</Select></Field>
        <Field id={`publish-rights-item-${index}-license`} label="License name"><Input value={item.licenseName ?? ""} onChange={(event) => updateRightsItem(index, { licenseName: event.target.value || undefined })} /></Field>
        <Field id={`publish-rights-item-${index}-license-url`} label="License/reference URL"><Input type="url" value={item.licenseUrl ?? ""} onChange={(event) => updateRightsItem(index, { licenseUrl: event.target.value || undefined })} /></Field>
        <Field id={`publish-rights-item-${index}-holder`} label="Rights holder"><Input value={item.rightsHolder ?? ""} onChange={(event) => updateRightsItem(index, { rightsHolder: event.target.value || undefined })} /></Field>
        <Field id={`publish-rights-item-${index}-source-url`} label="Source reference URL"><Input type="url" value={item.sourceUrl ?? ""} onChange={(event) => updateRightsItem(index, { sourceUrl: event.target.value || undefined })} /></Field>
        <Field id={`publish-rights-item-${index}-notes`} label="Notes"><Textarea value={item.notes ?? ""} onChange={(event) => updateRightsItem(index, { notes: event.target.value || undefined })} maxLength={2000} /></Field>
        <button className="link-button" type="button" onClick={() => setRightsItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove dependency</button>
      </div>)}
      {(rightsSourceMode === "UNKNOWN" || rightsItems.some((item) => item.redistribution === "UNKNOWN" || item.derivativeUse === "UNKNOWN")) && <p className="rights-warning" role="status">Some rights information is unknown. The revision can still be published, but contributors may need to verify these dependencies.</p>}
      <input type="hidden" name="rightsManifest" value={JSON.stringify({ sourceRightsMode: rightsSourceMode, sourceLicenseName: rightsSourceLicenseName || undefined, sourceLicenseUrl: rightsSourceLicenseUrl || undefined, sourceRightsHolder: rightsSourceHolder || undefined, items: rightsItems.filter((item) => item.name.trim()) })} />
    </fieldset>
    <Field id="publish-previews" label="Previews (PNG/JPG/HTML, up to 10)" required><Input name="previews" type="file" accept="image/png,image/jpeg,text/html" multiple required onChange={selectPreviews} /></Field>
    {previewFiles.map((file, index) => <Field id={`publish-alt-text-${index}`} key={`${file.name}-${index}`} label={`Alt text for ${file.name}`} required><Input name="altTexts" required maxLength={500} /></Field>)}
    {sourceFiles.length > 0 ? <CapabilityBadge mode="structured" unitCount={sourceFiles.length} label="Capability" provisional /> : <p className="meta">Add source files to enable file-level units.</p>}
    {sourceFiles.map((file, index) => {
      const existing = existingFiles.find((candidate) => candidate.id === sourceFileIds[index]);
      const suggestion = suggestions[index];
      const selection = sourceKinds[index] ?? "";
      const actualKind = existing?.kind ?? (selection === "auto" && suggestion?.status === "available" ? suggestion.suggestion.kind : selection);
      const selectionMode = existing?.kind ? "preserved" : selection === "auto" ? "auto" : "manual";
      const hintId = `source-kind-${index}-hint`;
      return <section className="file-input-list" key={`${file.name}-${index}`} aria-busy={suggestion?.status === "detecting"}>
        <h3>{file.name}</h3>
        <label>Unit identity<select value={sourceFileIds[index] ?? ""} onChange={(event) => selectExisting(index, event.target.value)}><option value="">New unit</option>{existingFiles.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name} · {kindLabel(candidate.kind)}</option>)}</select></label>
        <input type="hidden" name="sourceFileIds" value={sourceFileIds[index] ?? ""} />
        <input type="hidden" name="sourceBundleFileIds" value={sourceBundleFileIds[index] ?? ""} />
        <input type="hidden" name="sourceKinds" value={actualKind} />
        <input type="hidden" name="sourceKindModes" value={selectionMode} />
        {existing?.kind ? <p className="meta">{kindLabel(existing.kind)} · Preserved from the current revision.</p> : <>
          <label>Kind for {file.name}<select value={selection} onChange={(event) => setSourceKinds((current) => current.map((value, currentIndex) => currentIndex === index ? event.target.value : value))} required aria-describedby={hintId}>
            <option value="">Choose kind</option>
            {suggestion?.status === "available" && <option value="auto">Auto ({suggestion.suggestion.kind})</option>}
            <option value="artboard">Artboard</option><option value="component">Component</option><option value="asset">Asset</option><option value="token">Token</option>
          </select></label>
          <div className="meta" id={hintId} aria-live="polite">
            {suggestion?.status === "detecting" && "Detecting suggestion..."}
            {suggestion?.status === "available" && <>Suggested by {suggestion.suggestion.adapterId.toUpperCase()} adapter · {kindLabel(suggestion.suggestion.maturity)}. Suggestion confidence: {kindLabel(suggestion.suggestion.confidence)}.{suggestion.suggestion.confidence === "low" && " Check this suggestion before publishing."}{selection !== "auto" && <> <button type="button" className="link-button" onClick={() => setSourceKinds((current) => current.map((value, currentIndex) => currentIndex === index ? "auto" : value))}>Use suggestion: {kindLabel(suggestion.suggestion.kind)}</button></>}</>}
            {suggestion?.status === "unsupported" && "No suggestion for this format. Choose a kind."}
            {suggestion?.status === "error" && <>Suggestion unavailable. Choose a kind to continue. <button type="button" className="link-button" onClick={() => sourceFiles[index] && detectSuggestion(sourceFiles[index], index)}>Retry suggestion</button></>}
          </div>
        </>}
        <p className="meta">Choose what this file represents. ODR does not inspect layers or extract units automatically.</p>
        {previewFiles.length > 0 && <label>Preview for {file.name}<select name="sourcePreviewIndexes" defaultValue={Math.min(index, previewFiles.length - 1)} required>{previewFiles.map((preview, previewIndex) => <option value={previewIndex} key={`${preview.name}-${previewIndex}`}>{preview.name}</option>)}</select></label>}
      </section>;
    })}
    {error && <Banner tone="error" title="Revision could not be published">{error}</Banner>}
    <p className="meta">{contributionReturn ? "After publishing, you return to the original project's Contribute screen with this new Revision selected. Choose its changes, then create a Proposal for the owner to review." : "After publishing, you can view this Revision. To send changes to another project, select it in that project's Contribute screen and create a Proposal."}</p>
    <Button loading={submitting} loadingLabel="Publishing revision" type="submit">Publish revision</Button>
  </form>;
}
