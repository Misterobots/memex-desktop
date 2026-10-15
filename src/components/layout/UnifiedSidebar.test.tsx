import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UnifiedSidebar } from "./UnifiedSidebar";

describe("UnifiedSidebar", () => {
  it("renders Projects section with create project button", () => {
    const markup = renderToStaticMarkup(<UnifiedSidebar />);
    expect(markup).toContain("Projects");
    expect(markup).toContain("Create project");
    expect(markup).toContain("Project settings");
  });
});
