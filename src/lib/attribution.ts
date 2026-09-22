import { prisma } from "./prisma";
import { isVisible, visibleProposalWhere } from "./proposal-handlers";

export type AttributionRole = "OWNER" | "PUBLISHER" | "CONTRIBUTOR" | "REVIEWER";

export type AttributionPerson = {
  id: string;
  name: string;
  roles: AttributionRole[];
  appliedChanges: number;
  appliedRevisions: number;
  reviewedChanges: number;
  publishedRevisions: number;
};

type Person = { id: string; name: string };
type AppliedChange = { appliedRevisionId: string | null; reviewedBy: Person | null };
type ProjectAttributionData = {
  owner: Person;
  revisions: Array<{ publishedBy: Person | null }>;
  proposals: Array<{ author: Person; changeSet: { changes: AppliedChange[] } | null }>;
};

const roleOrder: AttributionRole[] = ["OWNER", "PUBLISHER", "CONTRIBUTOR", "REVIEWER"];

export function aggregateProjectAttribution({ owner, revisions, proposals }: ProjectAttributionData): AttributionPerson[] {
  const people = new Map<string, AttributionPerson & { revisionIds: Set<string> }>();
  const person = (actor: Person) => {
    let value = people.get(actor.id);
    if (!value) {
      value = { ...actor, roles: [], appliedChanges: 0, appliedRevisions: 0, reviewedChanges: 0, publishedRevisions: 0, revisionIds: new Set() };
      people.set(actor.id, value);
    }
    return value;
  };
  const addRole = (actor: Person, role: AttributionRole) => {
    const value = person(actor);
    if (!value.roles.includes(role)) value.roles.push(role);
    return value;
  };

  addRole(owner, "OWNER");
  for (const revision of revisions) {
    if (revision.publishedBy) addRole(revision.publishedBy, "PUBLISHER").publishedRevisions += 1;
  }
  for (const proposal of proposals) {
    const changes = proposal.changeSet?.changes.filter((change) => change.appliedRevisionId) ?? [];
    if (!changes.length) continue;
    const contributor = addRole(proposal.author, "CONTRIBUTOR");
    contributor.appliedChanges += changes.length;
    for (const change of changes) contributor.revisionIds.add(change.appliedRevisionId!);
    for (const change of changes) {
      if (change.reviewedBy) addRole(change.reviewedBy, "REVIEWER").reviewedChanges += 1;
    }
  }

  return [...people.values()]
    .map(({ revisionIds, ...value }) => ({ ...value, appliedRevisions: revisionIds.size, roles: roleOrder.filter((role) => value.roles.includes(role)) }))
    .sort((left, right) => Number(right.roles.includes("OWNER")) - Number(left.roles.includes("OWNER")) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export async function listProjectAttribution(projectId: string, userId?: string) {
  const [project, proposals] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        owner: { select: { id: true, name: true } },
        revisions: { where: { isPublished: true }, select: { publishedBy: { select: { id: true, name: true } } } },
      },
    }),
    prisma.proposal.findMany({
      where: { ...visibleProposalWhere(projectId, userId), changeSet: { changes: { some: { appliedRevisionId: { not: null } } } } },
      select: {
        author: { select: { id: true, name: true } },
        changeSet: { select: { changes: { where: { appliedRevisionId: { not: null } }, select: { appliedRevisionId: true, reviewedBy: { select: { id: true, name: true } } } } } },
      },
    }),
  ]);
  return project ? aggregateProjectAttribution({ owner: project.owner, revisions: project.revisions, proposals }) : [];
}

type RevisionAttributionInput = {
  id: string;
  publishedBy: Person | null;
  appliedProposal: (Parameters<typeof isVisible>[0] & { id: string; proposalNumber: number; author: Person }) | null;
  appliedChanges: Array<AppliedChange & { id: string }>;
};

export function revisionAttribution(revision: RevisionAttributionInput, userId?: string) {
  const proposal = revision.appliedProposal && isVisible(revision.appliedProposal, userId) ? revision.appliedProposal : null;
  const reviewers = new Map<string, Person>();
  if (proposal) {
    for (const change of revision.appliedChanges) {
      if (change.appliedRevisionId === revision.id && change.reviewedBy) reviewers.set(change.reviewedBy.id, change.reviewedBy);
    }
  }
  return {
    publisher: revision.publishedBy,
    contributor: proposal?.author ?? null,
    proposal: proposal ? { id: proposal.id, proposalNumber: proposal.proposalNumber } : null,
    reviewers: [...reviewers.values()],
  };
}
