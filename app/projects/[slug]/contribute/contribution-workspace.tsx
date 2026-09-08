"use client";

import { useEffect, useMemo, useState } from "react";
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
type SourceRevision = { id: string; number: number; title: string; projectSlug: string; projectTitle: string; owner: string; sourceUrl: string | null; tool: string | null };
type RelatedIssue = { id: string; title: string };
type WorkspaceDraft = { baseRevisionId?: string; sourceRevisionId?: string; selectedChangeKeys?: string[]; relatedIssueId?: string };

function changeKey(change: DetectedUnitChange) {
  return [change.action, change.targetFileId ?? "", change.sourceFileId ?? "", change.newName ?? ""].join(":");
}

export default function ContributionWorkspace({ baseRevisions, project, relatedIssues, sourceRevisions }: { baseRevisions: BaseRevision[]; project: { slug: string; title: string; owner: string }; relatedIssues: RelatedIssue[]; sourceRevisions: SourceRevision[] }) {
  const router = useRouter();
  const [baseRevisionId, setBaseRevisionId] = useState(baseRevisions[0]?.id ?? "");
  const [sourceRevisionId, setSourceRevisionId] = useState(sourceRevisions[0]?.id ?? "");
  const [selectedChangeKeys, setSelectedChangeKeys] = useState<string[]>([]);
  const [relatedIssueId, setRelatedIssueId] = useState("");
  const [changes, setChanges] = useState<DetectedUnitChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pendingSourceRevisionId, setPendingSourceRevisionId] = useState<string | null>(null);
  const [hydratedDraft, setHydratedDraft] = useState(false);
  const baseRevision = baseRevisions.find((revision) => revision.id === baseRevisionId);
  const sourceRevision = sourceRevisions.find((revision) => revision.id === sourceRevisionId);

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
    setHydratedDraft(true);
  }, [baseRevisions, project.slug, relatedIssues, sourceRevisions]);

  useEffect(() => {
    if (!hydratedDraft) return;
    window.sessionStorage.setItem(`contribution:${project.slug}`, JSON.stringify({ baseRevisionId, sourceRevisionId, selectedChangeKeys, relatedIssueId } satisfies WorkspaceDraft));
  }, [baseRevisionId, hydratedDraft, project.slug, relatedIssueId, selectedChangeKeys, sourceRevisionId]);

  useEffect(() => {
    if (!baseRevisionId || !sourceRevisionId) {
      setChanges([]);
      setLoading(false);
      setLoadError(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    void fetch(`/api/projects/${encodeURIComponent(project.slug)}/contribute?${new URLSearchParams({ baseRevisionId, sourceRevisionId })}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { changes?: DetectedUnitChange[] } | null;
        if (!response.ok || !Array.isArray(payload?.changes)) throw new Error("Could not load available changes.");
        if (!controller.signal.aborted) setChanges(payload.changes);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [baseRevisionId, project.slug, retry, sourceRevisionId]);

  const selectedChanges = useMemo(() => changes.filter((change) => selectedChangeKeys.includes(changeKey(change))), [changes, selectedChangeKeys]);
  const canContinue = Boolean(baseRevision && sourceRevision && selectedChanges.length && !loading);

  function requestSourceRevision(nextId: string) {
    if (nextId === sourceRevisionId) return;
    if (selectedChanges.length) {
      setPendingSourceRevisionId(nextId);
      return;
    }
    setSourceRevisionId(nextId);
  }

  function toggleChange(change: DetectedUnitChange, checked: boolean) {
    const key = changeKey(change);
    setSelectedChangeKeys((current) => checked ? [...new Set([...current, key])] : current.filter((value) => value !== key));
  }

  function continueToProposal() {
    if (!baseRevision || !sourceRevision || !selectedChanges.length) return;
    const params = new URLSearchParams({
      baseRevision: String(baseRevision.number),
      sourceProject: sourceRevision.projectSlug,
      sourceRevision: String(sourceRevision.number),
      changes: JSON.stringify(selectedChanges.map(({ action, newName, sourceFileId, targetFileId }) => ({ action, ...(targetFileId ? { targetFileId } : {}), ...(sourceFileId ? { sourceFileId } : {}), ...(newName ? { newName } : {}) }))),
    });
    if (relatedIssueId) params.set("relatedIssue", relatedIssueId);
    router.push(`/projects/${project.slug}/proposals/new?${params}`);
  }

  return <article className="detail proposal-page">
    <Stack gap={5}>
      <PageHeader description="Prepare changes to propose back to this project." title={`Contribute to ${project.title}`} />
      <Panel aria-labelledby="target-project-heading">
        <Stack gap={3}>
          <SectionHeader id="target-project-heading" title="Target project" />
          <div className="capability-details"><dl><div><dt>Target project</dt><dd>{project.owner} / {project.title}</dd></div><div><dt>Base revision</dt><dd>{baseRevision ? `r${baseRevision.number}` : "No published revision"}</dd></div></dl></div>
          <Field id="base-revision" label="Base revision" description="The latest published revision is selected by default."><Select disabled={!baseRevisions.length} onChange={(event) => setBaseRevisionId(event.target.value)} value={baseRevisionId}>{baseRevisions.length ? baseRevisions.map((revision) => <option key={revision.id} value={revision.id}>r{revision.number} · {revision.title}</option>) : <option value="">No published revision</option>}</Select></Field>
        </Stack>
      </Panel>
      <Panel aria-labelledby="working-source-heading">
        <Stack gap={3}>
          <SectionHeader id="working-source-heading" title="Working source" />
          {sourceRevision ? <div className="capability-details"><dl><div><dt>Working source</dt><dd>{sourceRevision.owner} / {sourceRevision.projectTitle}</dd></div><div><dt>Revision</dt><dd>r{sourceRevision.number}</dd></div><div><dt>Source tool</dt><dd>{sourceRevision.tool ?? "Not recorded"}</dd></div></dl></div> : <p className="meta">Publish a revision in one of your projects to prepare a proposal.</p>}
          <Field id="source-revision" label="Source revision"><Select disabled={!sourceRevisions.length} onChange={(event) => requestSourceRevision(event.target.value)} value={sourceRevisionId}>{sourceRevisions.length ? sourceRevisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.projectSlug} · r{revision.number} · {revision.title}</option>) : <option value="">No published source revisions</option>}</Select></Field>
          {sourceRevision?.sourceUrl && <TextLink href={sourceRevision.sourceUrl} rel="noreferrer" target="_blank">Open working source</TextLink>}
        </Stack>
      </Panel>
      <Panel aria-busy={loading} aria-labelledby="changes-to-propose-heading">
        <Stack gap={3}>
          <SectionHeader id="changes-to-propose-heading" title="Changes to propose" />
          <Field id="related-issue" label="Related issue"><Select onChange={(event) => setRelatedIssueId(event.target.value)} value={relatedIssueId}><option value="">None</option>{relatedIssues.map((issue) => <option key={issue.id} value={issue.id}>{issue.title}</option>)}</Select></Field>
          {loading && <p className="meta" role="status">Loading changes…</p>}
          {loadError && <Banner action={<Button onClick={() => setRetry((current) => current + 1)} size="sm" variant="secondary">Retry</Button>} title="Could not load available changes." tone="error" />}
          {!loading && !loadError && changes.length > 0 && <ul className="history" aria-label="Available changes">{changes.map((change) => {
            const presentation = changeActionPresentation({ action: change.action, type: change.action });
            const key = changeKey(change);
            return <li className="change-row" key={key}><Checkbox checked={selectedChangeKeys.includes(key)} description={`${changeKindLabel(change.kind ?? null)} · ${presentation.label}`} id={`change-${key}`} label={`Select ${change.name} for proposal`} onChange={(event) => toggleChange(change, event.target.checked)} /><Badge>{presentation.label}</Badge></li>;
          })}</ul>}
          {!loading && !loadError && changes.length === 0 && <EmptyState icon="file" title="No changes prepared yet.">Publish or select a source revision with compatible units before creating a proposal.</EmptyState>}
          <Button disabled={!canContinue} onClick={continueToProposal} size="lg">Continue to proposal</Button>
        </Stack>
      </Panel>
    </Stack>
    <Dialog actions={<><Button data-dialog-initial-focus onClick={() => setPendingSourceRevisionId(null)} size="lg" variant="secondary">Keep current revision</Button><Button onClick={() => { if (pendingSourceRevisionId) setSourceRevisionId(pendingSourceRevisionId); setSelectedChangeKeys([]); setPendingSourceRevisionId(null); }} size="lg">Change revision</Button></>} initialFocus="action" onClose={() => setPendingSourceRevisionId(null)} open={Boolean(pendingSourceRevisionId)} title="Change source revision?">
      Changing source revision will clear the selected changes.
    </Dialog>
  </article>;
}
