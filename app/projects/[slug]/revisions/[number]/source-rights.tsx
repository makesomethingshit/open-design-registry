"use client";

import { type FormEvent, useState } from "react";
import { permissionLabel, rightsItemTypeLabel, sourceLicenseFieldsForMode, unknownRightsCount, type RightsDeclarationInput, type RightsItemInput } from "@/src/lib/rights";

type DeclarationItem = { type: RightsItemInput["type"]; name: string; sourceFileId?: string | null; rightsHolder?: string | null; licenseName?: string | null; licenseUrl?: string | null; sourceUrl?: string | null; redistribution: RightsItemInput["redistribution"]; derivativeUse: RightsItemInput["derivativeUse"]; notes?: string | null };
type Declaration = { id: string; version: number; createdAt: string; sourceRightsMode: RightsDeclarationInput["sourceRightsMode"]; sourceLicenseName?: string | null; sourceLicenseUrl?: string | null; sourceRightsHolder?: string | null; notes?: string | null; items: DeclarationItem[] };
type SourceFile = { id: string; name: string; mimeType: string; size: number; href: string };

const emptyItem = (): RightsItemInput => ({ type: "OTHER", name: "", redistribution: "UNKNOWN", derivativeUse: "UNKNOWN" });
const editableItems = (items: DeclarationItem[]): RightsItemInput[] => items.map((item) => ({
  type: item.type,
  name: item.name,
  sourceFileId: item.sourceFileId ?? undefined,
  rightsHolder: item.rightsHolder ?? undefined,
  licenseName: item.licenseName ?? undefined,
  licenseUrl: item.licenseUrl ?? undefined,
  sourceUrl: item.sourceUrl ?? undefined,
  redistribution: item.redistribution,
  derivativeUse: item.derivativeUse,
  notes: item.notes ?? undefined,
}));

function formatSize(size: number) {
  return `${size.toLocaleString()} bytes`;
}

function sourceModeLabel(mode: RightsDeclarationInput["sourceRightsMode"], revisionLicense: string | null) {
  if (mode === "SAME_AS_REVISION") return `Same as Revision license${revisionLicense ? ` (${revisionLicense})` : ""}`;
  if (mode === "SEPARATE") return "Separate source package rights";
  return "Source package rights not declared";
}

export default function SourceRights({
  slug,
  number,
  revisionLicense,
  sourceHref,
  sourceFiles,
  tool,
  toolVersion,
  sourceChecksum,
  declaration,
  isOwner,
}: {
  slug: string;
  number: number;
  revisionLicense: string | null;
  sourceHref: string | null;
  sourceFiles: SourceFile[];
  tool: string | null;
  toolVersion: string | null;
  sourceChecksum: string | null;
  declaration: Declaration | null;
  isOwner: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<RightsItemInput[]>(() => editableItems(declaration?.items ?? []));
  const [sourceRightsMode, setSourceRightsMode] = useState<RightsDeclarationInput["sourceRightsMode"]>(declaration?.sourceRightsMode ?? "UNKNOWN");
  const [sourceLicenseName, setSourceLicenseName] = useState(declaration?.sourceLicenseName ?? "");
  const [sourceLicenseUrl, setSourceLicenseUrl] = useState(declaration?.sourceLicenseUrl ?? "");
  const [sourceRightsHolder, setSourceRightsHolder] = useState(declaration?.sourceRightsHolder ?? "");
  const [notes, setNotes] = useState(declaration?.notes ?? "");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const unknownCount = declaration ? unknownRightsCount(declaration) : 0;
  const sourceRightsUnknown = declaration?.sourceRightsMode === "UNKNOWN";
  const sameAsRevisionUnavailable = revisionLicense === null;

  function updateItem(index: number, patch: Partial<RightsItemInput>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function selectSourceRightsMode(mode: RightsDeclarationInput["sourceRightsMode"]) {
    setSourceRightsMode(mode);
    const fields = sourceLicenseFieldsForMode(mode, sourceLicenseName, sourceLicenseUrl);
    setSourceLicenseName(fields.sourceLicenseName);
    setSourceLicenseUrl(fields.sourceLicenseUrl);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    const payload = { sourceRightsMode, sourceLicenseName: sourceLicenseName || undefined, sourceLicenseUrl: sourceLicenseUrl || undefined, sourceRightsHolder, notes, items: items.filter((item) => item.name.trim()) };
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(slug)}/revisions/${number}/rights`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setError(result?.error ?? "Rights declaration could not be saved");
        return;
      }
      setStatus("Rights declaration saved");
      setEditing(false);
      window.location.reload();
    } catch {
      setError("Rights declaration could not be saved");
    }
  }

  return <section className="source-rights" aria-labelledby="revision-source-rights">
    <div className="source-rights-heading"><div><h2 id="revision-source-rights">Source &amp; Rights</h2><p className="meta">The source and rights facts below are contributor-supplied declarations.</p></div>
      <div className="source-rights-summary" aria-label="Source and rights summary"><span className="status-badge">{sourceHref || sourceFiles.length ? "Source available" : "No editable source"}</span><span className="status-badge">{declaration ? (sourceRightsUnknown ? "Rights not declared" : unknownCount ? `${unknownCount} unknown dependenc${unknownCount === 1 ? "y" : "ies"}` : "Rights declared") : "Rights not declared"}</span></div>
    </div>
    <div className="source-rights-source">
      <h3>Source</h3>
      {sourceHref || sourceFiles.length ? <>
        {sourceHref && <a className="button secondary" href={sourceHref} {...(sourceHref.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : { download: true })}>{sourceHref.startsWith("http") ? "Open source link" : "Download source"}</a>}
        {sourceFiles.length > 0 && <ul className="commit-previews" aria-label="Revision source files">{sourceFiles.map((file) => <li className="commit-chip" key={file.id}><span>{file.name} · {file.mimeType} · {formatSize(file.size)}</span><a href={file.href}>Download</a></li>)}</ul>}
      </> : <p><strong>No editable source recorded.</strong> This revision can be viewed, but an editable source has not been provided.</p>}
      {(tool || toolVersion || sourceChecksum) && <p className="meta">{tool ?? "Unknown tool"}{toolVersion ? ` ${toolVersion}` : ""}{sourceChecksum ? ` · SHA-256 ${sourceChecksum}` : ""}</p>}
    </div>
    <div className="source-rights-declaration">
      <h3>Rights</h3>
      {declaration?.notes && <p className="meta"><strong>Declaration notes:</strong> {declaration.notes}</p>}
      {declaration ? <>
        <p><strong>Revision license:</strong> {revisionLicense ?? "Not recorded for this legacy revision"}</p>
        <p><strong>Source package:</strong> {sourceModeLabel(declaration.sourceRightsMode, revisionLicense)}</p>
        {declaration.sourceRightsMode !== "SEPARATE" && declaration.sourceRightsHolder && <p className="meta">Rights holder: {declaration.sourceRightsHolder}</p>}
        {declaration.sourceRightsMode === "SEPARATE" && <p className="meta">{declaration.sourceLicenseName}{declaration.sourceRightsHolder ? ` · Rights holder: ${declaration.sourceRightsHolder}` : ""}{declaration.sourceLicenseUrl ? <> · <a href={declaration.sourceLicenseUrl} target="_blank" rel="noreferrer">View source reference</a></> : ""}</p>}
        <p className="meta">Rights declaration Version {declaration.version} · Updated <time dateTime={declaration.createdAt}>{new Date(declaration.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</time></p>
        {declaration.items.length > 0 ? <ul className="rights-items" aria-label="Declared dependencies">{declaration.items.map((item, index) => {
          const restricted = item.redistribution === "RESTRICTED" || item.redistribution === "NOT_ALLOWED" || item.derivativeUse === "RESTRICTED" || item.derivativeUse === "NOT_ALLOWED";
          const sourceFile = item.sourceFileId ? sourceFiles.find((file) => file.id === item.sourceFileId) : null;
          return <li className={restricted ? "rights-item rights-item-restricted" : "rights-item"} key={`${item.name}-${index}`}><div><strong>{item.name}</strong><span className="meta">{rightsItemTypeLabel(item.type)}{item.licenseName ? ` · ${item.licenseName}` : ""}</span>{sourceFile && <span className="meta">Included source: {sourceFile.name}</span>}{item.rightsHolder && <span className="meta">Rights holder: {item.rightsHolder}</span>}{item.notes && <span className="meta">Notes: {item.notes}</span>}</div><div className="rights-item-status"><span>Redistribution: {permissionLabel(item.redistribution)}</span><span>Derivative use: {permissionLabel(item.derivativeUse)}</span>{item.licenseUrl && <a href={item.licenseUrl} target="_blank" rel="noreferrer">View license for {item.name}</a>}{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">View source reference for {item.name}</a>}</div>{restricted && <p className="meta">This asset may require separate access when working from this source.</p>}</li>;
        })}</ul> : <p className="meta">No dependencies declared.</p>}
        {(sourceRightsUnknown || unknownCount > 0) && <p className="rights-warning" role="status">Some rights information is unknown. The revision can still be published, but contributors may need to verify these dependencies.</p>}
      </> : <p><strong>No rights manifest recorded.</strong> Rights for this source or one or more dependencies have not been declared.</p>}
      <p className="meta rights-notice">Rights information is contributor-supplied provenance and does not constitute legal advice.</p>
      {isOwner && <div className="rights-owner-actions">{!editing && <button className="button secondary" type="button" onClick={() => setEditing(true)}>{declaration ? "Add rights information" : "Add rights information"}</button>}{status && <span role="status">{status}</span>}</div>}
    </div>
    {editing && isOwner && <form className="rights-form" onSubmit={submit}>
      <h3>{declaration ? "Add a rights declaration version" : "Add rights information"}</h3>
      <fieldset><legend>Source package rights</legend>
        <label><input type="radio" name="sourceRightsMode" value="SAME_AS_REVISION" checked={sourceRightsMode === "SAME_AS_REVISION"} disabled={sameAsRevisionUnavailable} onChange={() => selectSourceRightsMode("SAME_AS_REVISION")} /> Same as Revision license{sameAsRevisionUnavailable && <span className="meta">Unavailable because this revision has no recorded license.</span>}</label>
        <label><input type="radio" name="sourceRightsMode" value="SEPARATE" checked={sourceRightsMode === "SEPARATE"} onChange={() => selectSourceRightsMode("SEPARATE")} /> Different license</label>
        <label><input type="radio" name="sourceRightsMode" value="UNKNOWN" checked={sourceRightsMode === "UNKNOWN"} onChange={() => selectSourceRightsMode("UNKNOWN")} /> Unknown / not declared</label>
      </fieldset>
      <div className="rights-form-grid">{sourceRightsMode === "SEPARATE" && <><label>License name<input value={sourceLicenseName} onChange={(event) => setSourceLicenseName(event.target.value)} required /></label><label>License/reference URL<input type="url" value={sourceLicenseUrl} onChange={(event) => setSourceLicenseUrl(event.target.value)} /></label></>}<label>Rights holder<input value={sourceRightsHolder} onChange={(event) => setSourceRightsHolder(event.target.value)} /></label></div>
      <label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} /></label>
      <div className="rights-form-heading"><h4>Dependencies &amp; third-party assets</h4><button className="button secondary" type="button" onClick={() => setItems((current) => [...current, emptyItem()])}>Add dependency</button></div>
      {items.map((item, index) => <div className="rights-form-item" key={index}><label>Name<input value={item.name} onChange={(event) => updateItem(index, { name: event.target.value })} required /></label><label>Type<select value={item.type} onChange={(event) => updateItem(index, { type: event.target.value as RightsItemInput["type"] })}>{["SOURCE_FILE", "FONT", "IMAGE", "ILLUSTRATION", "ICON", "TEMPLATE", "OTHER"].map((type) => <option key={type} value={type}>{rightsItemTypeLabel(type as RightsItemInput["type"])}</option>)}</select></label><label>Source bundle file (optional)<select value={item.sourceFileId ?? ""} onChange={(event) => updateItem(index, { sourceFileId: event.target.value || undefined })}><option value="">External dependency</option>{sourceFiles.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</select></label><label>Redistribution<select aria-label={`Redistribution for ${item.name || "dependency"}`} value={item.redistribution} onChange={(event) => updateItem(index, { redistribution: event.target.value as RightsItemInput["redistribution"] })}>{["UNKNOWN", "ALLOWED", "RESTRICTED", "NOT_ALLOWED"].map((permission) => <option key={permission} value={permission}>{permissionLabel(permission as RightsItemInput["redistribution"])}</option>)}</select></label><label>Derivative use<select aria-label={`Derivative use for ${item.name || "dependency"}`} value={item.derivativeUse} onChange={(event) => updateItem(index, { derivativeUse: event.target.value as RightsItemInput["derivativeUse"] })}>{["UNKNOWN", "ALLOWED", "RESTRICTED", "NOT_ALLOWED"].map((permission) => <option key={permission} value={permission}>{permissionLabel(permission as RightsItemInput["derivativeUse"])}</option>)}</select></label><label>License name<input value={item.licenseName ?? ""} onChange={(event) => updateItem(index, { licenseName: event.target.value || undefined })} /></label><label>License/reference URL<input type="url" value={item.licenseUrl ?? ""} onChange={(event) => updateItem(index, { licenseUrl: event.target.value || undefined })} /></label><label>Rights holder<input value={item.rightsHolder ?? ""} onChange={(event) => updateItem(index, { rightsHolder: event.target.value || undefined })} /></label><label>Source reference URL<input type="url" value={item.sourceUrl ?? ""} onChange={(event) => updateItem(index, { sourceUrl: event.target.value || undefined })} /></label><label>Notes<textarea value={item.notes ?? ""} onChange={(event) => updateItem(index, { notes: event.target.value || undefined })} maxLength={2000} /></label><button className="link-button" type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove dependency</button></div>)}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="rights-form-actions"><button className="button" type="submit">Save rights declaration</button><button className="button secondary" type="button" onClick={() => setEditing(false)}>Cancel</button></div>
    </form>}
  </section>;
}
