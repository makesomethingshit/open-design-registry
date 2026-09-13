"use client";

import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CapabilityBadge from "@/app/capability-badge";
import { suggestFile, type AdapterSuggestion } from "@/src/lib/adapters";

type ExistingFile = { id: string; name: string; kind?: string };
type SuggestionState = { status: "detecting" | "unsupported" | "error" | "preserved" } | { status: "available"; suggestion: AdapterSuggestion };
type RightsDraftItem = { type: "SOURCE_FILE" | "FONT" | "IMAGE" | "ILLUSTRATION" | "ICON" | "TEMPLATE" | "OTHER"; name: string; sourceFileId?: string; rightsHolder?: string; licenseName?: string; licenseUrl?: string; sourceUrl?: string; redistribution: "UNKNOWN" | "ALLOWED" | "RESTRICTED" | "NOT_ALLOWED"; derivativeUse: "UNKNOWN" | "ALLOWED" | "RESTRICTED" | "NOT_ALLOWED"; notes?: string };

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

export default function RevisionPublishForm({ slug, existingFiles }: { slug: string; existingFiles: ExistingFile[] }) {
  const router = useRouter();
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [sourceFileIds, setSourceFileIds] = useState<string[]>([]);
  const [sourceBundleFileIds, setSourceBundleFileIds] = useState<string[]>([]);
  const [sourceKinds, setSourceKinds] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionState[]>([]);
  const [previewFiles, setPreviewFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
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
    sourceFileIdsRef.current = files.map(() => "");
    sourceBundleFileIdsRef.current = files.map(() => crypto.randomUUID());
    setSourceFiles(files);
    setSourceFileIds(sourceFileIdsRef.current);
    setSourceBundleFileIds(sourceBundleFileIdsRef.current);
    setSourceKinds(files.map(() => ""));
    setSuggestions(files.map(() => ({ status: "detecting" })));
    files.forEach((file, index) => detectSuggestion(file, index));
  }

  function selectExisting(index: number, id: string) {
    const existing = existingFiles.find((file) => file.id === id);
    const bundleId = id || sourceBundleFileIdsRef.current[index] || crypto.randomUUID();
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
      router.push(`/projects/${slug}/revisions/${payload.number}`);
    } catch {
      setError("Revision could not be published");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="form revision-publish-form" onSubmit={submit} aria-busy={submitting}>
    <h2>Publish a revision</h2>
    <label>Revision title<input name="title" required maxLength={120} /></label>
    <label>Change description<textarea name="changeDescription" required minLength={1} maxLength={500} /></label>
    <label>Design tool<input name="tool" maxLength={80} placeholder="Figma, Penpot, or Photoshop" /></label>
    <label>Tool version<input name="toolVersion" maxLength={80} placeholder="Optional" /></label>
    <label>Tags<input name="tags" maxLength={800} placeholder="ui, landing-page, mobile" /></label>
    <label>Source files (up to 10 original files)<input name="sources" type="file" multiple onChange={selectSources} /></label>
    <p className="meta">Use a source URL instead when no files are uploaded. ZIP contents are kept as one file.</p>
    <label>Source URL<input name="sourceUrl" type="url" placeholder="https://example.com/design.zip" /></label>
    <label>Source SHA-256 checksum<input name="sourceChecksum" inputMode="text" pattern="[a-fA-F0-9]{64}" maxLength={64} placeholder="Optional for one uploaded file" /></label>
    <fieldset className="rights-form"><legend>Source &amp; rights</legend>
      <p className="meta">Rights are contributor-supplied declarations. Unknown values do not block publication.</p>
      <label><input type="radio" name="rightsSourceMode" value="SAME_AS_REVISION" checked={rightsSourceMode === "SAME_AS_REVISION"} onChange={() => setRightsSourceMode("SAME_AS_REVISION")} /> Same as Revision license</label>
      <label><input type="radio" name="rightsSourceMode" value="SEPARATE" checked={rightsSourceMode === "SEPARATE"} onChange={() => setRightsSourceMode("SEPARATE")} /> Different license</label>
      <label><input type="radio" name="rightsSourceMode" value="UNKNOWN" checked={rightsSourceMode === "UNKNOWN"} onChange={() => setRightsSourceMode("UNKNOWN")} /> Unknown / not declared</label>
      {rightsSourceMode === "SEPARATE" && <div className="rights-form-grid"><label>License name<input value={rightsSourceLicenseName} onChange={(event) => setRightsSourceLicenseName(event.target.value)} required /></label><label>License/reference URL<input type="url" value={rightsSourceLicenseUrl} onChange={(event) => setRightsSourceLicenseUrl(event.target.value)} /></label><label>Rights holder<input value={rightsSourceHolder} onChange={(event) => setRightsSourceHolder(event.target.value)} /></label></div>}
      <div className="rights-form-heading"><h3>Dependencies &amp; third-party assets</h3><button className="button secondary" type="button" onClick={() => setRightsItems((current) => [...current, { type: "OTHER", name: "", redistribution: "UNKNOWN", derivativeUse: "UNKNOWN" }])}>Add dependency</button></div>
      {rightsItems.map((item, index) => <div className="rights-form-item" key={index}><label>Name<input value={item.name} onChange={(event) => updateRightsItem(index, { name: event.target.value })} required /></label><label>Type<select value={item.type} onChange={(event) => updateRightsItem(index, { type: event.target.value as RightsDraftItem["type"] })}>{["SOURCE_FILE", "FONT", "IMAGE", "ILLUSTRATION", "ICON", "TEMPLATE", "OTHER"].map((type) => <option key={type} value={type}>{kindLabel(type.toLowerCase())}</option>)}</select></label><label>Source bundle file (optional)<select value={item.sourceFileId ?? ""} onChange={(event) => updateRightsItem(index, { sourceFileId: event.target.value || undefined })}><option value="">External dependency</option>{existingFiles.map((file) => <option key={file.id} value={file.id}>{file.name} · Existing source</option>)}{sourceFiles.map((file, fileIndex) => <option key={sourceBundleFileIds[fileIndex]} value={sourceBundleFileIds[fileIndex]}>{file.name} · New upload</option>)}</select></label><label>Redistribution<select aria-label={`Redistribution for ${item.name || "dependency"}`} value={item.redistribution} onChange={(event) => updateRightsItem(index, { redistribution: event.target.value as RightsDraftItem["redistribution"] })}>{["UNKNOWN", "ALLOWED", "RESTRICTED", "NOT_ALLOWED"].map((value) => <option key={value} value={value}>{value === "UNKNOWN" ? "Unknown" : value === "ALLOWED" ? "Declared allowed" : value === "RESTRICTED" ? "Restricted" : "Declared not allowed"}</option>)}</select></label><label>Derivative use<select aria-label={`Derivative use for ${item.name || "dependency"}`} value={item.derivativeUse} onChange={(event) => updateRightsItem(index, { derivativeUse: event.target.value as RightsDraftItem["derivativeUse"] })}>{["UNKNOWN", "ALLOWED", "RESTRICTED", "NOT_ALLOWED"].map((value) => <option key={value} value={value}>{value === "UNKNOWN" ? "Unknown" : value === "ALLOWED" ? "Declared allowed" : value === "RESTRICTED" ? "Restricted" : "Declared not allowed"}</option>)}</select></label><label>License name<input value={item.licenseName ?? ""} onChange={(event) => updateRightsItem(index, { licenseName: event.target.value || undefined })} /></label><label>License/reference URL<input type="url" value={item.licenseUrl ?? ""} onChange={(event) => updateRightsItem(index, { licenseUrl: event.target.value || undefined })} /></label><label>Rights holder<input value={item.rightsHolder ?? ""} onChange={(event) => updateRightsItem(index, { rightsHolder: event.target.value || undefined })} /></label><label>Source reference URL<input type="url" value={item.sourceUrl ?? ""} onChange={(event) => updateRightsItem(index, { sourceUrl: event.target.value || undefined })} /></label><label>Notes<textarea value={item.notes ?? ""} onChange={(event) => updateRightsItem(index, { notes: event.target.value || undefined })} maxLength={2000} /></label><button className="link-button" type="button" onClick={() => setRightsItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove dependency</button></div>)}
      {(rightsSourceMode === "UNKNOWN" || rightsItems.some((item) => item.redistribution === "UNKNOWN" || item.derivativeUse === "UNKNOWN")) && <p className="rights-warning" role="status">Some rights information is unknown. The revision can still be published, but contributors may need to verify these dependencies.</p>}
      <input type="hidden" name="rightsManifest" value={JSON.stringify({ sourceRightsMode: rightsSourceMode, sourceLicenseName: rightsSourceLicenseName || undefined, sourceLicenseUrl: rightsSourceLicenseUrl || undefined, sourceRightsHolder: rightsSourceHolder || undefined, items: rightsItems.filter((item) => item.name.trim()) })} />
    </fieldset>
    <label>Previews (PNG/JPG/HTML, up to 10)<input name="previews" type="file" accept="image/png,image/jpeg,text/html" multiple required onChange={selectPreviews} /></label>
    {previewFiles.map((file, index) => <label key={`${file.name}-${index}`}>Alt text for {file.name}<input name="altTexts" required maxLength={500} /></label>)}
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
            {suggestion?.status === "detecting" && "Detecting suggestion…"}
            {suggestion?.status === "available" && <>Suggested by {suggestion.suggestion.adapterId.toUpperCase()} adapter · {kindLabel(suggestion.suggestion.maturity)}. Suggestion confidence: {kindLabel(suggestion.suggestion.confidence)}.{suggestion.suggestion.confidence === "low" && " Check this suggestion before publishing."}{selection !== "auto" && <> <button type="button" className="link-button" onClick={() => setSourceKinds((current) => current.map((value, currentIndex) => currentIndex === index ? "auto" : value))}>Use suggestion: {kindLabel(suggestion.suggestion.kind)}</button></>}</>}
            {suggestion?.status === "unsupported" && "No suggestion for this format. Choose a kind."}
            {suggestion?.status === "error" && <>Suggestion unavailable. Choose a kind to continue. <button type="button" className="link-button" onClick={() => sourceFiles[index] && detectSuggestion(sourceFiles[index], index)}>Retry suggestion</button></>}
          </div>
        </>}
        <p className="meta">Choose what this file represents. ODR does not inspect layers or extract units automatically.</p>
        {previewFiles.length > 0 && <label>Preview for {file.name}<select name="sourcePreviewIndexes" defaultValue={Math.min(index, previewFiles.length - 1)} required>{previewFiles.map((preview, previewIndex) => <option value={previewIndex} key={`${preview.name}-${previewIndex}`}>{preview.name}</option>)}</select></label>}
      </section>;
    })}
    {error && <p className="error" role="alert">{error}</p>}
    <button className="button" disabled={submitting}>{submitting ? "Publishing…" : "Publish revision"}</button>
  </form>;
}
