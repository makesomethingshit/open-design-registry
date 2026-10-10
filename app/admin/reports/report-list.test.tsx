import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ReportList from "./report-list";

const report = { id: "report", reason: "Copyright", details: "Synthetic", status: "OPEN", coverSharedCount: 2, projectHidden: false, coverBlocked: false, reporter: { name: "Reporter", email: "" } };
const hide = "Hide this project and resolve";
const block = "Block shared cover and resolve";

describe("moderation action controls", () => {
  it.each([
    ["OPEN", false, false, true, true, true],
    ["RESOLVED", true, false, false, true, false],
    ["RESOLVED", false, true, true, false, false],
    ["RESOLVED", true, true, false, false, false],
    ["RESOLVED", false, false, false, false, false],
    ["DISMISSED", false, false, false, false, false],
    ["DISMISSED", true, false, false, false, false],
  ] as const)("%s hidden=%s blocked=%s exposes only remaining eligible actions", (status, projectHidden, coverBlocked, canHide, canBlock, canReview) => {
    const html = renderToStaticMarkup(<ReportList reports={[{ ...report, status, projectHidden, coverBlocked }]} />);
    expect(html.includes(hide)).toBe(canHide);
    expect(html.includes(block)).toBe(canBlock);
    expect(html.includes("Mark as reviewed")).toBe(canReview);
    expect(html.includes("Restore project visibility")).toBe(projectHidden);
    expect(html.includes("Lift this report&#x27;s asset blocks")).toBe(coverBlocked);
    if (canHide || canBlock) expect(html).toContain("blocking its underlying object applies globally");
  });

  it("retained decisions only allow restoration after the source report is deleted", () => {
    const html = renderToStaticMarkup(<ReportList reports={[{ ...report, status: "RESOLVED", sourceMissing: true, projectHidden: true }]} />);
    expect(html).not.toContain(block);
    expect(html).toContain("Restore project visibility");
  });
});
