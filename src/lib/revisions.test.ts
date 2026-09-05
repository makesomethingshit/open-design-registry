import { describe, expect, it } from "vitest";
import { toPublicRevision } from "./revisions";

describe("public revision serialization", () => {
  it("hides storage state and exposes proxy URLs", () => {
    const revision = toPublicRevision({
      license: "MIT",
      id: "revision-1",
      projectId: "project-1",
      number: 1,
      parentId: null,
      title: "Initial design",
      changeDescription: "First release",
      sourceKey: "revisions/project-1/source.zip",
      sourceUrl: null,
      isPublished: true,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      previews: [{
        id: "preview-1",
        revisionId: "revision-1",
        position: 0,
        key: "revisions/project-1/preview.png",
        url: "revisions/project-1/preview.png",
        mimeType: "image/png",
        size: 123,
        altText: "Landing page",
        createdAt: new Date("2026-09-01T00:00:00Z"),
      }],
    });

    expect(revision).not.toHaveProperty("sourceKey");
    expect(revision).not.toHaveProperty("isPublished");
    expect(revision.sourceUrl).toBe("/api/assets?key=revisions%2Fproject-1%2Fsource.zip");
    expect(revision.previews[0].url).toBe("/api/assets?key=revisions%2Fproject-1%2Fpreview.png");
  });
});
