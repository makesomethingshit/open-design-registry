import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Icon, type IconName } from "./icon";
import { octicons } from "./octicons";

describe("Octicons", () => {
  it("renders every supported icon on its native grid without exposing decorative SVGs", () => {
    for (const name of Object.keys(octicons) as IconName[]) {
      for (const size of [16, 24] as const) {
        const markup = renderToStaticMarkup(createElement(Icon, { name, size }));
        expect(markup).toContain(`width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"`);
        expect(markup).toContain('fill="currentColor"');
        expect(markup).toContain('aria-hidden="true"');
        expect(markup).toContain('focusable="false"');
        expect(markup).toContain("<path");
        expect(markup).not.toContain('stroke=');
        expect(markup).not.toContain('role="img"');
      }
    }
  });

  it("exposes an accessible name for standalone meaningful icons", () => {
    const markup = renderToStaticMarkup(createElement(Icon, { name: "warning", title: "Warning" }));
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Warning"');
    expect(markup).toContain("<title>Warning</title>");
    expect(markup).not.toContain("aria-hidden");
  });

  it("keeps notification subscriptions distinct from document preview", () => {
    for (const size of [16, 24] as const) {
      expect(renderToStaticMarkup(createElement(Icon, { name: "bell", size })))
        .not.toEqual(renderToStaticMarkup(createElement(Icon, { name: "eye", size })));
    }
  });
});
