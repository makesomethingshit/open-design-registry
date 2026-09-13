"use client";

import { useState } from "react";
import { Badge, StatusBadge, Tag, TagLink } from "@/src/components/ui/badge";
import { Banner, EmptyState } from "@/src/components/ui/banner";
import { Button, IconButton, TextLink } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Dialog, Drawer } from "@/src/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/src/components/ui/field";
import { Icon } from "@/src/components/ui/icon";
import { Divider, Inline, PageHeader, Panel, SectionHeader, Stack } from "@/src/components/ui/layout";
import { RouteNav, SectionNav } from "@/src/components/ui/section-nav";
import { SegmentedControl } from "@/src/components/ui/segmented-control";
import { Tabs } from "@/src/components/ui/tabs";
import { DesignPreview } from "@/src/components/design/design-preview";
import { ProjectCard } from "@/src/components/design/project-card";
import { ProjectHeader } from "@/src/components/design/project-header";
import { RevisionItem } from "@/src/components/design/revision-item";
import type { ReviewChange } from "@/src/components/design/review-types";
import ProposalReview from "@/app/proposals/[id]/proposal-review";
import ContributeDialog from "@/app/projects/[slug]/contribute-dialog";
import { proposalStatuses, type ChangeReviewStatusValue } from "@/src/lib/proposal-status";
import { changeReviewStatusPresentation, proposalStatusPresentation } from "@/src/lib/ui/status-presentation";
import styles from "./catalog.module.css";

const changeStatuses: ChangeReviewStatusValue[] = ["PENDING", "APPROVED", "CHANGES_REQUESTED"];

function fixtureImage(label: string, surface: string, width = 800, height = 600) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${surface}"/><rect x="12%" y="16%" width="76%" height="68%" fill="none" stroke="currentColor" stroke-width="6"/><text x="50%" y="52%" fill="currentColor" font-family="sans-serif" font-size="54" text-anchor="middle">${label}</text></svg>`)}`;
}

function fixturePreview(id: string, label: string, surface: string, width = 800, height = 600): ReviewChange["sourcePreviews"][number] {
  return { id, position: 0, url: fixtureImage(label, surface, width, height), mimeType: "image/png", altText: `${label} fixture` };
}

const fixtureBasePreviews = [fixturePreview("fixture-base", "BASE", "white")];
const fixtureSourcePreviews = [fixturePreview("fixture-proposal", "PROPOSAL", "white")];
const fixtureLatestPreviews = [fixturePreview("fixture-latest", "LATEST", "white", 600, 800)];

const fixtureChanges: ReviewChange[] = [
  { id: "fixture-pending", type: "MODIFY_UNIT", action: "MODIFY_UNIT", target: "A deliberately long pending poster name for responsive review verification", targetFileId: "pending", name: "A deliberately long pending poster name for responsive review verification", newName: null, kind: "artboard", mimeType: "image/png", size: 284000, reviewStatus: "PENDING", reviewComment: null, reviewedBy: null, appliedRevision: null, latestAvailable: true, latestName: "A deliberately long pending poster name for responsive review verification", conflictStatus: "NO_CONFLICT", conflictReason: "No upstream conflict.", checkedLatestRevisionId: "fixture-r13", reviewHistory: [], sourcePreviews: fixtureSourcePreviews, basePreviews: fixtureBasePreviews, latestPreviews: fixtureLatestPreviews },
  { id: "fixture-poster", type: "MODIFY_UNIT", action: "MODIFY_UNIT", target: "A deliberately long approved poster name for responsive review verification", targetFileId: "poster", name: "A deliberately long approved poster name for responsive review verification", newName: null, kind: "artboard", mimeType: "image/png", size: 284000, reviewStatus: "APPROVED", reviewComment: "The revised grid is ready to apply.", reviewedBy: { name: "Fixture reviewer" }, appliedRevision: null, latestAvailable: true, latestName: "A deliberately long approved poster name for responsive review verification", conflictStatus: "NO_CONFLICT", conflictReason: "No upstream conflict.", checkedLatestRevisionId: "fixture-r13", reviewHistory: [], sourcePreviews: fixtureSourcePreviews, basePreviews: fixtureBasePreviews, latestPreviews: fixtureLatestPreviews },
  { id: "fixture-add", type: "ADD_UNIT", action: "ADD_UNIT", target: "A deliberately long added unit name for application copy verification", targetFileId: "added", name: "A deliberately long added unit name for application copy verification", newName: null, kind: "component", mimeType: "image/png", size: 284000, reviewStatus: "APPROVED", reviewComment: null, reviewedBy: { name: "Fixture reviewer" }, appliedRevision: null, latestAvailable: true, latestName: "A deliberately long added unit name for application copy verification", conflictStatus: "NO_CONFLICT", conflictReason: "No upstream conflict.", checkedLatestRevisionId: "fixture-r13", reviewHistory: [], sourcePreviews: fixtureSourcePreviews, basePreviews: [], latestPreviews: [] },
  { id: "fixture-remove", type: "REMOVE_UNIT", action: "REMOVE_UNIT", target: "A deliberately long removable unit name for application copy verification", targetFileId: "removable", name: "A deliberately long removable unit name for application copy verification", newName: null, kind: "component", mimeType: "image/png", size: 284000, reviewStatus: "APPROVED", reviewComment: null, reviewedBy: { name: "Fixture reviewer" }, appliedRevision: null, latestAvailable: true, latestName: "A deliberately long removable unit name for application copy verification", conflictStatus: "NO_CONFLICT", conflictReason: "No upstream conflict.", checkedLatestRevisionId: "fixture-r13", reviewHistory: [], sourcePreviews: [], basePreviews: fixtureBasePreviews, latestPreviews: fixtureLatestPreviews },
  { id: "fixture-rename", type: "RENAME_UNIT", action: "RENAME_UNIT", target: "A deliberately long renameable unit name for application copy verification", targetFileId: "renameable", name: "A deliberately long renameable unit name for application copy verification", newName: "A renamed fixture unit", kind: "component", mimeType: "image/png", size: 284000, reviewStatus: "APPROVED", reviewComment: null, reviewedBy: { name: "Fixture reviewer" }, appliedRevision: null, latestAvailable: true, latestName: "A deliberately long renameable unit name for application copy verification", conflictStatus: "NO_CONFLICT", conflictReason: "No upstream conflict.", checkedLatestRevisionId: "fixture-r13", reviewHistory: [], sourcePreviews: fixtureSourcePreviews, basePreviews: fixtureBasePreviews, latestPreviews: fixtureLatestPreviews },
  { id: "fixture-name", type: "RENAME_UNIT", action: "RENAME_UNIT", target: "A deliberately long requested caption name for responsive review verification", targetFileId: "caption", name: "A deliberately long requested caption name for responsive review verification", newName: "Exhibition caption", kind: "component", mimeType: null, size: null, reviewStatus: "CHANGES_REQUESTED", reviewComment: "Please confirm the editorial wording.", reviewedBy: { name: "Fixture reviewer" }, appliedRevision: null, latestAvailable: true, latestName: "A deliberately long requested caption name for responsive review verification", conflictStatus: "NO_CONFLICT", conflictReason: "No upstream conflict.", checkedLatestRevisionId: "fixture-r13", reviewHistory: [], sourcePreviews: [], basePreviews: [], latestPreviews: [] },
  { id: "fixture-applied", type: "REMOVE_UNIT", action: "REMOVE_UNIT", target: "A deliberately long applied asset name for responsive review verification", targetFileId: "applied", name: "A deliberately long applied asset name for responsive review verification", newName: null, kind: "asset", mimeType: "image/png", size: 284000, reviewStatus: "APPROVED", reviewComment: null, reviewedBy: { name: "Fixture reviewer" }, appliedRevision: { id: "fixture-r13", number: 13, title: "Applied fixture revision" }, latestAvailable: true, latestName: "A deliberately long applied asset name for responsive review verification", conflictStatus: "NO_CONFLICT", conflictReason: "No upstream conflict.", checkedLatestRevisionId: "fixture-r13", reviewHistory: [], sourcePreviews: [], basePreviews: fixtureBasePreviews, latestPreviews: fixtureLatestPreviews },
  { id: "fixture-document", type: "REPLACE_DOCUMENT", action: "REPLACE_DOCUMENT", target: "whole_document", targetFileId: null, name: null, newName: null, kind: null, mimeType: null, size: null, reviewStatus: "APPROVED", reviewComment: null, reviewedBy: null, appliedRevision: null, latestAvailable: true, latestName: null, conflictStatus: null, conflictReason: null, checkedLatestRevisionId: "fixture-r13", reviewHistory: [], sourcePreviews: fixtureSourcePreviews, basePreviews: fixtureBasePreviews, latestPreviews: fixtureLatestPreviews },
];

export default function DesignSystemCatalog() {
  const [name, setName] = useState("");
  const [showNameError, setShowNameError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("side-by-side");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fixtureOwner, setFixtureOwner] = useState(true);
  const [fixtureStale, setFixtureStale] = useState(false);
  const [fixtureClosed, setFixtureClosed] = useState(false);

  return <Stack className={styles.catalog} gap={7}>
    <PageHeader eyebrow="Foundation / Catalog" title="ODR design system" description="Development fixtures only. Theme is controlled from the global header; production requests return 404." />

    <section aria-labelledby="buttons-heading">
      <SectionHeader id="buttons-heading" title="Buttons and links" />
      <div className={styles.matrix}>
        <StateCell label="Default"><Button>Contribute</Button></StateCell>
        <StateCell label="Hover"><Button data-preview-state="hover">Contribute</Button></StateCell>
        <StateCell label="Pressed"><Button data-preview-state="pressed">Contribute</Button></StateCell>
        <StateCell label="Focus visible"><Button data-preview-state="focus">Contribute</Button></StateCell>
        <StateCell label="Disabled"><Button disabled>Contribute</Button></StateCell>
        <StateCell label="Loading"><Button loading loadingLabel="Saving…">Save revision</Button></StateCell>
      </div>
      <Inline className={styles.variants} gap={2}><Button variant="secondary">Approve</Button><Button variant="ghost">Close</Button><Button variant="danger">Delete draft</Button><IconButton label="Search"><Icon name="search" /></IconButton><TextLink href="#buttons-heading">Read button guidance</TextLink></Inline>
    </section>

    <section aria-labelledby="forms-heading">
      <SectionHeader id="forms-heading" title="Fields" />
      <form className={styles.formGrid} onSubmit={(event) => { event.preventDefault(); setShowNameError(!name.trim()); }}>
        <Field description="Use the project name contributors will recognize." error={showNameError ? "Enter a project name before continuing." : undefined} id="catalog-project-name" label="Project name" required><Input onChange={(event) => { setName(event.target.value); setShowNameError(false); }} placeholder="Poster archive" value={name} /></Field>
        <Field id="catalog-description" label="Description"><Textarea placeholder="A concise description remains visible while the error is shown." /></Field>
        <Field id="catalog-license" label="License"><Select defaultValue="CC BY 4.0"><option>CC BY 4.0</option><option>MIT</option></Select></Field>
        <Field description="Disabled is distinct from a pending submission." id="catalog-disabled" label="Unavailable field"><Input disabled value="Revision already published" readOnly /></Field>
        <Checkbox checked={busy} description="This is a fixture-only busy state." label="Show busy submission" onChange={(event) => setBusy(event.target.checked)} />
        <Checkbox indeterminate label="Some changes selected" onChange={() => undefined} />
        <Inline gap={2}><Button loading={busy} loadingLabel="Applying…" type="submit">Apply selection</Button><Button onClick={() => { setName(""); setShowNameError(false); }} variant="secondary">Reset</Button></Inline>
      </form>
    </section>

    <section aria-labelledby="statuses-heading">
      <SectionHeader id="statuses-heading" title="Status presentations" />
      <div className={styles.statusGrid}>
        <Panel><h3>Proposal status</h3><Stack gap={2}>{proposalStatuses.map((status) => { const presentation = proposalStatusPresentation(status, status === "PARTIALLY_ACCEPTED" ? 2 : undefined, status === "PARTIALLY_ACCEPTED" ? 5 : undefined); return <StatusBadge icon={presentation.icon} key={status} tone={presentation.tone}>{presentation.label}</StatusBadge>; })}</Stack></Panel>
        <Panel><h3>Change review status</h3><Stack gap={2}>{changeStatuses.map((status) => { const presentation = changeReviewStatusPresentation(status); return <StatusBadge icon={presentation.icon} key={status} tone={presentation.tone}>{presentation.label}</StatusBadge>; })}<StatusBadge icon="check" tone="accent">{changeReviewStatusPresentation("APPROVED", 14).label}</StatusBadge></Stack></Panel>
        <Panel><h3>Properties and tags</h3><Inline gap={2}><Badge>Public</Badge><Badge>Private</Badge><Tag>Typeface</Tag><TagLink href="#statuses-heading">Editorial</TagLink></Inline></Panel>
      </div>
    </section>

    <section aria-labelledby="navigation-heading">
      <SectionHeader id="navigation-heading" title="Navigation choices" />
      <Stack gap={4}>
        <SectionNav currentHref="#history" items={[{ href: "#overview", label: "Overview" }, { href: "#history", label: "History" }, { href: "#proposals", label: "Proposals" }]} label="Project sections" />
        <RouteNav currentHref="/design-system" items={[{ href: "/design-system", label: "Catalog" }, { href: "/projects", label: "Projects" }]} label="Catalog routes" />
        <Tabs label="Loaded examples" items={[{ value: "tokens", label: "Tokens", panel: <p>Tabs switch already-loaded panels with arrow keys, Home, and End.</p> }, { value: "accessibility", label: "Accessibility", panel: <p>Route navigation and section navigation remain ordinary links.</p> }]} />
        <SegmentedControl label="Comparison view" items={[{ value: "side-by-side", label: "Side by side" }, { value: "overlay", label: "Overlay" }]} onChange={setSelected} value={selected} />
        <p className={styles.meta}>Selected comparison fixture: {selected === "overlay" ? "Overlay" : "Side by side"}.</p>
      </Stack>
    </section>

    <section aria-labelledby="feedback-heading">
      <SectionHeader id="feedback-heading" title="Feedback and empty states" />
      <Stack gap={3}><Banner tone="info" title="Preview details">A preview background is independent from the application theme.</Banner><Banner tone="success" title="Revision applied">Revision 14 is now the current project revision.</Banner><Banner tone="warning" title="Review required">Two selected changes need a current revision check.</Banner><Banner tone="error" title="Could not save comment" action={<Button size="sm" variant="secondary">Retry</Button>}>The draft remains in this fixture.</Banner><EmptyState action={<Button size="sm" variant="secondary">Clear filters</Button>} icon="image" title="No preview available">The selected unit has no accessible preview asset.</EmptyState></Stack>
    </section>

    <section aria-labelledby="dialog-heading">
      <SectionHeader id="dialog-heading" title="Dialog and drawer" />
      <Inline gap={2}><Button onClick={() => setDialogOpen(true)}>Open long dialog</Button><Button onClick={() => setDrawerOpen(true)} variant="secondary">Open drawer</Button></Inline>
      <Dialog actions={<><Button data-dialog-initial-focus onClick={() => setDialogOpen(false)} variant="secondary">Cancel</Button><Button onClick={() => setDialogOpen(false)}>Confirm application</Button></>} initialFocus="action" onClose={() => setDialogOpen(false)} open={dialogOpen} title="Apply selected changes">
        <Stack gap={4}><p>Applying selected units preserves units not included in this application. This deliberately long fixture confirms the dialog body scrolls independently at short viewport heights.</p><Divider /><p>Each proposed unit remains named in full so that an operator can evaluate the exact scope before confirming the action.</p><p>Network errors remain inside this dialog. A failure does not imply success or clear the selection.</p><p>The cancel action receives initial focus because this is a consequential operation.</p><p>Esc closes the dialog and returns focus to the trigger.</p></Stack>
      </Dialog>
      <Drawer actions={<Button onClick={() => setDrawerOpen(false)}>Done</Button>} onClose={() => setDrawerOpen(false)} open={drawerOpen} title="Review details"><Stack gap={4}><p>A drawer is a focused inspection surface, not a replacement for a route or a tab.</p><Badge>Fixture only</Badge></Stack></Drawer>
    </section>

    <section aria-labelledby="previews-heading">
      <SectionHeader id="previews-heading" title="Preview fixtures" description="Explicit fictional fixtures exercise aspect ratio and state without reading production or private data." />
      <div className={styles.previewGrid}><PreviewFixture aspect="3 / 4" label="Portrait poster" /><PreviewFixture aspect="16 / 9" label="Landscape spread" /><PreviewFixture aspect="1 / 1" label="Square identity" /><PreviewFixture aspect="4 / 3" label="Transparent asset" state="checker" /><PreviewFixture aspect="4 / 3" label="Missing preview" state="missing" /><PreviewFixture aspect="4 / 3" label="Unsupported format" state="unsupported" /></div>
    </section>

    <section aria-labelledby="project-components-heading">
      <SectionHeader id="project-components-heading" title="Project and Explore fixtures" description="Development-only fixtures for the ProjectCard, ProjectHeader, and RevisionItem components. Production receives visible project data from server queries." />
      <div className={styles.projectFixture}>
        <ProjectHeader actions={<><ContributeDialog revisionNumber={14} signedIn slug="fixture-project" /><ContributeDialog initialIntent="fork" revisionNumber={14} signedIn slug="fixture-project" /></>} description="A fixture project demonstrates the project information hierarchy without representing a production project." license="CC BY 4.0" owner="Fixture owner" revisionCount={14} slug="fixture-project" title="Fixture project overview" visibility="public" />
        <ol className={styles.fixtureRevisionList}><RevisionItem capability={<Badge>Structured · 4 units</Badge>} changeDescription="Refined the poster layout for narrow screens." createdAt={new Date("2026-09-06T00:00:00.000Z")} href="#project-components-heading" id="fixture-revision" number={14} owner="Fixture owner" tags={["poster", "mobile"]} title="Responsive poster layout" tool="Penpot 2.0" /></ol>
      </div>
      <div className={styles.projectCardGrid}><ProjectCard coverUrl={fixtureImage("POSTER", "white", 600, 800)} description="A vertical project cover remains entirely visible inside the gallery frame." href="#project-components-heading" license="CC BY 4.0" owner="Fixture owner" priority tags={["poster", "print"]} title="Portrait poster" updatedAt={new Date("2026-09-06T00:00:00.000Z")} /><ProjectCard coverUrl={fixtureImage("SPREAD", "white", 1200, 600)} description="A wide spread keeps its own aspect ratio while the gallery frame stays 4:3." href="#project-components-heading" license="MIT" owner="Fixture contributor" tags={["editorial", "web"]} title="Landscape spread" updatedAt={new Date("2026-09-05T00:00:00.000Z")} /></div>
    </section>

    <PreviewCacheFixture />

    <section aria-labelledby="review-workspace-heading">
      <SectionHeader id="review-workspace-heading" title="Proposal workspace fixture" description="Development-only presentation fixture. Production review receives the same component props from visible server data." />
      <Inline gap={4}><Checkbox checked={fixtureOwner} id="fixture-owner" label="Fixture owner" onChange={(event) => setFixtureOwner(event.target.checked)} /><Checkbox checked={fixtureStale} id="fixture-stale" label="Show stale revision state" onChange={(event) => setFixtureStale(event.target.checked)} /><Checkbox checked={fixtureClosed} id="fixture-closed" label="Show closed proposal state" onChange={(event) => setFixtureClosed(event.target.checked)} /></Inline>
      <ProposalReview baseRevision={{ id: "fixture-r11", number: 11, title: "Original", previews: fixtureBasePreviews }} canClose={false} changes={fixtureChanges} comments={[]} isOwner={fixtureOwner} knownConflictCount={0} latestRevision={fixtureStale ? { id: "fixture-r13", number: 13, title: "Latest", previews: fixtureLatestPreviews } : null} latestUnitCount={4} projectSlug="fixture" proposalId="fixture-proposal" signedIn={false} sourceRevision={{ id: "fixture-r12", number: 12, title: "Proposal", previews: fixtureSourcePreviews }} stale={fixtureStale} status={fixtureClosed ? "CLOSED" : "OPEN"} unavailableConflictCount={0} />
    </section>
  </Stack>;
}

function StateCell({ children, label }: { children: React.ReactNode; label: string }) {
  return <div className={styles.stateCell}><span>{label}</span>{children}</div>;
}

function PreviewCacheFixture() {
  const [currentKind, setCurrentKind] = useState<"broken" | "healthy" | "mismatched">("broken");
  const current: ReviewChange["sourcePreviews"][number] = currentKind === "broken"
    ? { id: "fixture-preview-broken", position: 0, url: "data:image/png;base64,invalid-preview", mimeType: "image/png", altText: "Broken preview fixture" }
    : currentKind === "healthy"
      ? fixturePreview("fixture-preview-healthy", "HEALTHY", "white")
      : fixturePreview("fixture-preview-mismatched", "MISMATCHED", "white", 600, 800);
  const previous = fixturePreview("fixture-preview-previous", "PREVIOUS", "white");

  return <section aria-labelledby="preview-cache-heading">
    <SectionHeader id="preview-cache-heading" title="Preview cache regression fixture" description="Switches same-position assets to prove failed and dimension state belongs to each asset identity." />
    <Inline gap={2}><Button onClick={() => setCurrentKind("healthy")} variant="secondary">Show healthy replacement</Button><Button onClick={() => setCurrentKind("mismatched")} variant="secondary">Show mismatched replacement</Button></Inline>
    <DesignPreview current={[current]} currentLabel="Proposal" currentNumber={12} previous={[previous]} previousLabel="Original" previousNumber={11} />
  </section>;
}

function PreviewFixture({ aspect, label, state = "loaded" }: { aspect: string; label: string; state?: "loaded" | "checker" | "missing" | "unsupported" }) {
  return <figure className={styles.previewFixture}><div className={styles.previewCanvas} data-state={state} style={{ aspectRatio: aspect }}><div className={styles.fixtureArtwork}>{state === "loaded" || state === "checker" ? <span aria-hidden="true">ODR</span> : <span>{state === "missing" ? "Preview unavailable" : "Unsupported format"}</span>}</div></div><figcaption>{label} · {state === "loaded" || state === "checker" ? "Loaded fixture" : state}</figcaption></figure>;
}
