"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { changeActionPresentation, changeKindLabel } from "@/src/components/design/change-item";
import { Badge } from "@/src/components/ui/badge";
import { Banner, EmptyState } from "@/src/components/ui/banner";
import { Button, TextLink } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Dialog } from "@/src/components/ui/dialog";
import { Field, Select } from "@/src/components/ui/field";
import { PageHeader, Panel, SectionHeader, Stack } from "@/src/components/ui/layout";
import type { DetectedUnitChange } from "@/src/lib/revision-bundle";

type BaseRevision = { id: string; number: number; title: string };
type SourceRevision = { id: string; number: number; title: string; projectSlug: string; projectTitle: string; owner: string; sourceUrl: string | null; tool: string | null; projectForkedFromProjectId: string | null; projectForkedFromRevisionId: string | null };
type RelatedIssue = { id: string; title: string; kind?: "ISSUE" | "DESIGN_REQUEST" };
type WorkspaceDraft = { baseRevisionId?: string; sourceRevisionId?: string; selectedChangeKeys?: string[]; relatedIssueId?: string };
type ContributionCapabilityMode = "STRUCTURED" | "WHOLE_DOCUMENT" | "UNKNOWN";
export const maxProposalChanges = 10;

function changeKey(change: DetectedUnitChange) {
  return [change.action, change.targetFileId ?? "", change.sourceFileId ?? "", change.newName ?? ""].join(":");
}

export function canContinueWithContext({ hasBase, hasSource, selectedCount, loading, loadError, loadedKey, currentKey }: { hasBase: boolean; hasSource: boolean; selectedCount: number; loading: boolean; loadError: boolean; loadedKey: string | null; currentKey: string | null }) {
  return Boolean(hasBase && hasSource && selectedCount > 0 && selectedCount <= maxProposalChanges && !loading && !loadError && loadedKey && currentKey && loadedKey === currentKey);
}

export function canContinueWithWholeDocument({ hasBase, hasSource, loading, loadError, loadedKey, currentKey, wholeDocument, sameRevision, copiedBase }: { hasBase: boolean; hasSource: boolean; loading: boolean; loadError: boolean; loadedKey: string | null; currentKey: string | null; wholeDocument: boolean; sameRevision: boolean; copiedBase: boolean }) {
  return Boolean(hasBase && hasSource && wholeDocument && !sameRevision && !copiedBase && !loading && !loadError && loadedKey && currentKey && loadedKey === currentKey);
}

function revisionPairKey(baseId: string, sourceId: string) {
  return JSON.stringify([baseId, sourceId]);
}

export default function ContributionWorkspace({ baseRevisions, initialBaseRevisionId, initialRelatedIssueId, initialSourceRevisionId, project, relatedIssues, sourceRevisions }: { baseRevisions: BaseRevision[]; initialBaseRevisionId?: string; initialRelatedIssueId?: string; initialSourceRevisionId?: string; project: { id: string; slug: string; title: string; owner: string }; relatedIssues: RelatedIssue[]; sourceRevisions: SourceRevision[] }) {
  const router = useRouter();
  const [baseRevisionId, setBaseRevisionId] = useState(initialBaseRevisionId ?? baseRevisions[0]?.id ?? "");
  const [sourceRevisionId, setSourceRevisionId] = useState(initialSourceRevisionId ?? sourceRevisions[0]?.id ?? "");
  const [selectedChangeKeys, setSelectedChangeKeys] = useState<string[]>([]);
  const [relatedIssueId, setRelatedIssueId] = useState(initialRelatedIssueId ?? "");
  const [changes, setChanges] = useState<DetectedUnitChange[]>([]);
  const [wholeDocument, setWholeDocument] = useState(false);
  const [capabilityMode, setCapabilityMode] = useState<ContributionCapabilityMode>("UNKNOWN");
  const [capabilityUnitCount, setCapabilityUnitCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [pendingSourceRevisionId, setPendingSourceRevisionId] = useState<string | null>(null);
  const [hydratedDraft, setHydratedDraft] = useState(false);
  const activeRequest = useRef<symbol | null>(null);
  const baseRevision = baseRevisions.find((revision) => revision.id === baseRevisionId);
  const sourceRevision = sourceRevisions.find((revision) => revision.id === sourceRevisionId);
  const currentKey = baseRevisionId && sourceRevisionId ? revisionPairKey(baseRevisionId, sourceRevisionId) : null;

  useEffect(() => {
    try {
      const draft = JSON.parse(window.sessionStorage.getItem(`contribution:${project.slug}`) ?? "null") as WorkspaceDraft | null;
      if (draft?.baseRevisionId && baseRevisions.some((revision) => revision.id === draft.baseRevisionId)) setBaseRevisionId(draft.baseRevisionId);
      if (draft?.sourceRevisionId && sourceRevisions.some((revision) => revision.id === draft.sourceRevisionId)) setSourceRevisionId(draft.sourceRevisionId);
      if (Array.isArray(draft?.selectedChangeKeys) && draft.selectedChangeKeys.every((value) => typeof value === "string")) setSelectedChangeKeys(draft.selectedChangeKeys);
      if (draft?.relatedIssueId && relatedIssues.some((issue) => issue.id === draft.relatedIssueId)) setRelatedIssueId(draft.relatedIssueId);
    } catch {
      // Ignore an invalid browser-only draft.
    }
    if (initialBaseRevisionId && baseRevisions.some((revision) => revision.id === initialBaseRevisionId)) setBaseRevisionId(initialBaseRevisionId);
    if (initialSourceRevisionId && sourceRevisions.some((revision) => revision.id === initialSourceRevisionId)) setSourceRevisionId(initialSourceRevisionId);
    if (initialBaseRevisionId || initialSourceRevisionId) setSelectedChangeKeys([]);
    if (initialRelatedIssueId !== undefined) setRelatedIssueId(initialRelatedIssueId);
    setHydratedDraft(true);
  }, [baseRevisions, initialBaseRevisionId, initialRelatedIssueId, initialSourceRevisionId, project.slug, relatedIssues, sourceRevisions]);

  useEffect(() => {
    if (!hydratedDraft) return;
    try {
      window.sessionStorage.setItem(`contribution:${project.slug}`, JSON.stringify({ baseRevisionId, sourceRevisionId, selectedChangeKeys, relatedIssueId } satisfies WorkspaceDraft));
    } catch {
      // Browser storage is optional; the in-memory draft remains usable.
    }
  }, [baseRevisionId, hydratedDraft, project.slug, relatedIssueId, selectedChangeKeys, sourceRevisionId]);

  useEffect(() => {
    if (!baseRevisionId || !sourceRevisionId) {
      activeRequest.current = null;
      setChanges([]);
      setWholeDocument(false);
      setCapabilityMode("UNKNOWN");
      setCapabilityUnitCount(null);
      setLoadedKey(null);
      setLoading(false);
      setLoadError(false);
      return;
    }
    const controller = new AbortController();
    const requestKey = revisionPairKey(baseRevisionId, sourceRevisionId);
    const requestToken = Symbol(requestKey);
    activeRequest.current = requestToken;
    setLoadedKey(null);
    setWholeDocument(false);
    setCapabilityMode("UNKNOWN");
    setCapabilityUnitCount(null);
    setLoading(true);
    setLoadError(false);
    void fetch(`/api/projects/${encodeURIComponent(project.slug)}/contribute?${new URLSearchParams({ baseRevisionId, sourceRevisionId })}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { changes?: DetectedUnitChange[]; wholeDocument?: boolean; capabilityMode?: ContributionCapabilityMode; capabilityUnitCount?: number | null } | null;
        if (!response.ok || !Array.isArray(payload?.changes)) throw new Error("Could not load available changes.");
        if (!controller.signal.aborted && activeRequest.current === requestToken) {
          setChanges(payload.changes);
          setWholeDocument(payload.wholeDocument === true);
          setCapabilityMode(payload.capabilityMode === "STRUCTURED" || payload.capabilityMode === "WHOLE_DOCUMENT" ? payload.capabilityMode : "UNKNOWN");
          setCapabilityUnitCount(typeof payload.capabilityUnitCount === "number" ? payload.capabilityUnitCount : null);
          setLoadedKey(requestKey);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && activeRequest.current === requestToken) {
          setLoadedKey(null);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && activeRequest.current === requestToken) setLoading(false);
      });
    return () => {
      controller.abort();
      if (activeRequest.current === requestToken) activeRequest.current = null;
    };
  }, [baseRevisionId, project.slug, retry, sourceRevisionId]);

  const selectedChanges = useMemo(() => changes.filter((change) => selectedChangeKeys.includes(changeKey(change))), [changes, selectedChangeKeys]);
  const canContinue = canContinueWithContext({ currentKey, hasBase: Boolean(baseRevision), hasSource: Boolean(sourceRevision), loadError, loadedKey, loading, selectedCount: selectedChanges.length });
  const copiedBase = Boolean(sourceRevision && baseRevision && sourceRevision.number === 1 && sourceRevision.projectForkedFromProjectId === project.id && sourceRevision.projectForkedFromRevisionId === baseRevision.id);
  const canContinueWholeDocument = changes.length === 0 && canContinueWithWholeDocument({ currentKey, hasBase: Boolean(baseRevision), hasSource: Boolean(sourceRevision), loadError, loadedKey, loading, wholeDocument, sameRevision: sourceRevision?.id === baseRevision?.id, copiedBase });
  const forkParams = new URLSearchParams({ intent: "proposal" });
  if (relatedIssueId) forkParams.set("relatedIssue", relatedIssueId);
  const forkHref = baseRevision ? `/projects/${encodeURIComponent(project.slug)}/revisions/${baseRevision.number}?${forkParams}` : null;
  const workingParams = baseRevision ? new URLSearchParams({ contributionTarget: project.slug, baseRevision: String(baseRevision.number) }) : null;
  if (relatedIssueId) workingParams?.set("relatedIssue", relatedIssueId);
  const workingProjectHref = sourceRevision && workingParams ? `/projects/${encodeURIComponent(sourceRevision.projectSlug)}?${workingParams}#owner-tools` : null;

  function invalidateLoadedChanges() {
    activeRequest.current = null;
    setLoadedKey(null);
  }

  function selectBaseRevision(nextId: string) {
    if (nextId === baseRevisionId) return;
    invalidateLoadedChanges();
    setBaseRevisionId(nextId);
  }

  function requestSourceRevision(nextId: string) {
    if (nextId === sourceRevisionId) return;
    if (selectedChanges.length) {
      setPendingSourceRevisionId(nextId);
      return;
    }
    invalidateLoadedChanges();
    setSourceRevisionId(nextId);
  }

  function toggleChange(change: DetectedUnitChange, checked: boolean) {
    const key = changeKey(change);
    setSelectedChangeKeys((current) => {
      const selectedCount = changes.filter((candidate) => current.includes(changeKey(candidate))).length;
      if (checked && !current.includes(key) && selectedCount >= maxProposalChanges) return current;
      return checked ? [...new Set([...current, key])] : current.filter((value) => value !== key);
    });
  }

  function continueToProposal() {
    if (!canContinue || !baseRevision || !sourceRevision) return;
    const params = new URLSearchParams({
      baseRevision: String(baseRevision.number),
      sourceProject: sourceRevision.projectSlug,
      sourceRevision: String(sourceRevision.number),
      changes: JSON.stringify(selectedChanges.map(({ action, newName, sourceFileId, targetFileId }) => ({ action, ...(targetFileId ? { targetFileId } : {}), ...(sourceFileId ? { sourceFileId } : {}), ...(newName ? { newName } : {}) }))),
    });
    if (relatedIssueId) params.set("relatedIssue", relatedIssueId);
    router.push(`/projects/${project.slug}/proposals/new?${params}`);
  }

  function continueToWholeDocumentProposal() {
    if (!canContinueWholeDocument || !baseRevision || !sourceRevision) return;
    const params = new URLSearchParams({ baseRevision: String(baseRevision.number), sourceProject: sourceRevision.projectSlug, sourceRevision: String(sourceRevision.number) });
    if (relatedIssueId) params.set("relatedIssue", relatedIssueId);
    router.push(`/projects/${project.slug}/proposals/new?${params}`);
  }

  return <article className="detail proposal-page">
    <Stack gap={5}>
      <PageHeader description="Design request → Fork → new Revision → Proposal → review. Prepare changes to propose back to this project." title={`Contribute to ${project.title}`} />
      <Panel aria-labelledby="target-project-heading">
        <Stack gap={3}>
          <SectionHeader id="target-project-heading" title="Target project" />
          <div className="capability-details"><dl><div><dt>Target project</dt><dd>{project.owner} / {project.title}</dd></div><div><dt>Base revision</dt><dd>{baseRevision ? `r${baseRevision.number}` : "No published revision"}</dd></div></dl></div>
          <Field id="base-revision" label="Base revision" description="The latest published revision is selected by default."><Select disabled={!baseRevisions.length} onChange={(event) => selectBaseRevision(event.target.value)} value={baseRevisionId}>{baseRevisions.length ? baseRevisions.map((revision) => <option key={revision.id} value={revision.id}>r{revision.number} · {revision.title}</option>) : <option value="">No published revision</option>}</Select></Field>
        </Stack>
      </Panel>
      <Panel aria-labelledby="working-source-heading">
        <Stack gap={3}>
          <SectionHeader id="working-source-heading" title="Working source" />
          {sourceRevision ? <div className="capability-details"><dl><div><dt>Working source</dt><dd>{sourceRevision.owner} / {sourceRevision.projectTitle}</dd></div><div><dt>Revision</dt><dd>r{sourceRevision.number}</dd></div><div><dt>Source tool</dt><dd>{sourceRevision.tool ?? "Not recorded"}</dd></div></dl></div> : <p className="meta">You have no published source revision to propose yet.</p>}
          <Field id="source-revision" label="Source revision"><Select disabled={!sourceRevisions.length} onChange={(event) => requestSourceRevision(event.target.value)} value={sourceRevisionId}>{sourceRevisions.length ? sourceRevisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.projectSlug} · r{revision.number} · {revision.title}</option>) : <option value="">No published source revisions</option>}</Select></Field>
          {sourceRevision?.sourceUrl && <TextLink href={sourceRevision.sourceUrl} rel="noreferrer" target="_blank">Open working source</TextLink>}
          {loading && <p className="meta" role="status" aria-live="polite">Checking contribution scope for this revision pair…</p>}
          {!loading && !loadError && currentKey && loadedKey === currentKey && capabilityMode === "WHOLE_DOCUMENT" && <Banner title="Whole-document proposal" tone="info">You can propose the complete revised document for review. Individual files, layers, and objects cannot be selected.</Banner>}
          {!loading && !loadError && currentKey && loadedKey === currentKey && capabilityMode === "STRUCTURED" && <Banner title={`${capabilityUnitCount} selectable file ${capabilityUnitCount === 1 ? "unit" : "units"}`} tone="info">This count describes published units in the selected source, not detected changes. Select file-level changes below; layers and objects cannot be selected.</Banner>}
          {!loading && !loadError && currentKey && loadedKey === currentKey && capabilityMode === "UNKNOWN" && <Banner title="Capability not recorded" tone="info">This revision pair has no reliable unit-capability record. Do not infer selectable files; whole-document proposals remain available when unit comparison is unavailable.</Banner>}
        </Stack>
      </Panel>
      <Panel aria-busy={loading} aria-labelledby="changes-to-propose-heading">
        <Stack gap={3}>
          <SectionHeader id="changes-to-propose-heading" title="Changes to propose" />
          <Field id="related-issue" label="Related issue" description="Choose a related Design request or Issue, if any. The project owner reviews your Proposal."><Select onChange={(event) => setRelatedIssueId(event.target.value)} value={relatedIssueId}><option value="">None</option>{relatedIssues.map((issue) => <option key={issue.id} value={issue.id}>{issue.kind === "DESIGN_REQUEST" ? "Design request" : "Issue"} · {issue.title}</option>)}</Select></Field>
          {loadError && <Banner action={<Button onClick={() => { invalidateLoadedChanges(); setRetry((current) => current + 1); }} size="sm" variant="secondary">Retry</Button>} title="Could not load available changes." tone="error" />}
          {!loading && !loadError && changes.length > 0 && <ul className="history" aria-label="Available changes">{changes.map((change) => {
            const presentation = changeActionPresentation({ action: change.action, type: change.action });
            const key = changeKey(change);
            const selected = selectedChangeKeys.includes(key);
            return <li className="change-row" key={key}><Checkbox checked={selected} description={`${changeKindLabel(change.kind ?? null)} · ${presentation.label}`} disabled={!selected && selectedChanges.length >= maxProposalChanges} id={`change-${key}`} label={`Select ${change.name} for proposal`} onChange={(event) => toggleChange(change, event.target.checked)} /><Badge>{presentation.label}</Badge></li>;
          })}</ul>}
          {selectedChanges.length >= maxProposalChanges && <p className="meta" role="status" aria-live="polite">Select up to {maxProposalChanges} changes per proposal. Deselect one before selecting another.</p>}
          {!loading && !loadError && changes.length === 0 && !sourceRevision && <EmptyState action={forkHref ? <TextLink href={forkHref}>Fork Revision {baseRevision?.number} to start</TextLink> : undefined} icon="file" title="Start with a work copy">Fork the selected revision into your public project, edit its source in an external design tool, then publish a new revision. Forking alone does not create a proposal; confirm you can publish it under the displayed license.</EmptyState>}
          {!loading && !loadError && changes.length === 0 && sourceRevision && canContinueWholeDocument && <Banner action={<Button onClick={continueToWholeDocumentProposal} size="sm">Continue with whole document</Button>} title="Whole-document proposal" tone="info">This format has no independently selectable units. The proposal submits the complete document; the server will reject it if it contains no applied change.</Banner>}
          {!loading && !loadError && changes.length === 0 && sourceRevision && !canContinueWholeDocument && (copiedBase ? <Banner title="This fork is still an unchanged copy" tone="warning">Forking alone does not create a change. Edit the source in an external design tool and publish a new revision before proposing.</Banner> : <EmptyState icon="file" title="No selectable changes found">Select another source revision, or edit the working project in an external design tool and publish a new revision.</EmptyState>)}
          {sourceRevision && !loading && !loadError && changes.length === 0 && <Stack gap={2}>{workingProjectHref && <TextLink href={workingProjectHref}>Open working project and publish a revision</TextLink>}{forkHref && <TextLink href={forkHref}>Fork the selected target revision</TextLink>}</Stack>}
          <p className="meta">Propose the changes in your new Revision to the original project. Its owner reviews the Proposal before any change is applied.</p>{canContinueWholeDocument ? null : <Button disabled={!canContinue} onClick={continueToProposal} size="lg">Continue to proposal</Button>}
        </Stack>
      </Panel>
    </Stack>
    <Dialog actions={<><Button data-dialog-initial-focus onClick={() => setPendingSourceRevisionId(null)} size="lg" variant="secondary">Keep current revision</Button><Button onClick={() => { if (pendingSourceRevisionId) { invalidateLoadedChanges(); setSourceRevisionId(pendingSourceRevisionId); } setSelectedChangeKeys([]); setPendingSourceRevisionId(null); }} size="lg">Change revision</Button></>} initialFocus="action" onClose={() => setPendingSourceRevisionId(null)} open={Boolean(pendingSourceRevisionId)} title="Change source revision?">
      Changing source revision will clear the selected changes.
    </Dialog>
  </article>;
}
