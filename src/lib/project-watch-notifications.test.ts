import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { notifyProjectWatchers } from "./project-watch-notifications";

describe("project watch notification failures", () => {
  it.each(["lookup", "insert"])("propagates %s failures to the publishing transaction", async (step) => {
    const failure = new Error("Notifications unavailable");
    const findMany = vi.fn().mockResolvedValue([{ userId: "watcher" }]);
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    (step === "lookup" ? findMany : createMany).mockRejectedValue(failure);
    const tx = { projectWatch: { findMany }, notification: { createMany } } as unknown as Prisma.TransactionClient;

    await expect(notifyProjectWatchers(tx, "project", "publisher", { type: "REVISION_PUBLISHED", revisionId: "revision" })).rejects.toBe(failure);
    if (step === "lookup") expect(createMany).not.toHaveBeenCalled();
  });
});
