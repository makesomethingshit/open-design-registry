import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findProject: vi.fn(), findProposals: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, proposal: { findMany: mocks.findProposals } } }));

import { aggregateProjectAttribution, listProjectAttribution, revisionAttribution } from "./attribution";

const alice = { id: "alice", name: "Alice" };
const bob = { id: "bob", name: "Bob" };
const carol = { id: "carol", name: "Carol" };

describe("project attribution", () => {
  it("does not include owners or publishers without applied proposal activity", () => {
    expect(aggregateProjectAttribution({ proposals: [] })).toEqual([]);
  });

  it("merges applied author and final reviewer roles and counts only applied changes", () => {
    const historyOnlyChange = {
      appliedRevisionId: "r5",
      reviewedBy: null,
      reviewHistory: [{ author: carol, eventType: "INVALIDATED_UPSTREAM" }],
    };
    const people = aggregateProjectAttribution({
      proposals: [
        { author: bob, changeSet: { changes: [
          { appliedRevisionId: "r5", reviewedBy: alice },
          { appliedRevisionId: "r5", reviewedBy: alice },
          { appliedRevisionId: "r6", reviewedBy: carol },
          { appliedRevisionId: "r6", reviewedBy: bob },
          historyOnlyChange,
          { appliedRevisionId: null, reviewedBy: carol },
        ] } },
        { author: { id: "unapplied", name: "Unapplied" }, changeSet: { changes: [{ appliedRevisionId: null, reviewedBy: carol }] } },
      ],
    });

    expect(people).toEqual([
      { ...alice, roles: ["REVIEWER"], appliedChanges: 0, appliedRevisions: 0, reviewedChanges: 2 },
      { ...bob, roles: ["CONTRIBUTOR", "REVIEWER"], appliedChanges: 5, appliedRevisions: 2, reviewedChanges: 1 },
      { ...carol, roles: ["REVIEWER"], appliedChanges: 0, appliedRevisions: 0, reviewedChanges: 1 },
    ]);
  });

  it("uses the proposal visibility boundary without querying project owners or publishers", async () => {
    mocks.findProposals.mockResolvedValue([{ author: bob, changeSet: { changes: [{ appliedRevisionId: "r5", reviewedBy: carol }] } }]);

    const people = await listProjectAttribution("project", "viewer");

    expect(mocks.findProject).not.toHaveBeenCalled();
    expect(mocks.findProposals).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      projectId: "project",
      baseRevision: { projectId: "project", isPublished: true },
      sourceRevision: { isPublished: true, project: { OR: [{ isPublic: true }, { ownerId: "viewer" }] } },
    }) }));
    expect(people.map((person) => person.id)).toEqual(["bob", "carol"]);
  });
});

describe("revision attribution", () => {
  const visibleProposal = {
    id: "proposal",
    proposalNumber: 14,
    project: { id: "project", ownerId: "owner", isPublic: true },
    baseRevision: { projectId: "project", isPublished: true },
    sourceRevision: { isPublished: true, project: { ownerId: "bob", isPublic: true } },
    author: bob,
  };

  it("uses only final reviewers on changes applied to the selected partial revision", () => {
    const base = {
      publishedBy: alice,
      appliedProposal: visibleProposal,
      appliedChanges: [
        { id: "a", appliedRevisionId: "r5", reviewedBy: alice },
        { id: "b", appliedRevisionId: "r5", reviewedBy: alice },
        { id: "c", appliedRevisionId: "r6", reviewedBy: carol },
        { id: "d", appliedRevisionId: null, reviewedBy: bob },
        { id: "invalidated", appliedRevisionId: "r5", reviewedBy: null, reviewHistory: [{ author: carol, eventType: "INVALIDATED_UPSTREAM" }] },
      ],
    };

    expect(revisionAttribution({ ...base, id: "r5" }, "viewer").reviewers).toEqual([alice]);
    expect(revisionAttribution({ ...base, id: "r6" }, "viewer").reviewers).toEqual([carol]);
  });

  it("does not expose an invisible proposal author and accepts a legacy null publisher", () => {
    const attribution = revisionAttribution({
      id: "r5",
      publishedBy: null,
      appliedProposal: { ...visibleProposal, sourceRevision: { isPublished: true, project: { ownerId: "bob", isPublic: false } } },
      appliedChanges: [{ id: "a", appliedRevisionId: "r5", reviewedBy: carol }],
    }, "viewer");

    expect(attribution.publisher).toBeNull();
    expect(attribution.contributor).toBeNull();
    expect(attribution.proposal).toBeNull();
    expect(attribution.reviewers).toEqual([]);
  });
});
