import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CreateProjectModal } from "./CreateProjectModal";

describe("CreateProjectModal", () => {
  it("renders nothing when closed", () => {
    const markup = renderToStaticMarkup(
      <CreateProjectModal isOpen={false} onClose={() => {}} onCreate={() => {}} />
    );
    expect(markup).toBe("");
  });

  it("renders modal dialog when open with project name input and source folders section", () => {
    const markup = renderToStaticMarkup(
      <CreateProjectModal isOpen={true} onClose={() => {}} onCreate={() => {}} />
    );
    expect(markup).toContain("Create project");
    expect(markup).toContain("Project name");
    expect(markup).toContain("Source folders");
    expect(markup).toContain("Add a folder on this computer");
    expect(markup).toContain("Cancel");
  });
});
