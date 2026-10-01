import { describe, expect, it } from "vitest";
import {
  asciiFileName,
  canShowInline,
  decideResourceAccess,
  downloadFileName,
  type ResourceAccessInput,
} from "./resource-download";
import { googleDownloadUrl } from "./google-embed";

const base: ResourceAccessInput = {
  isTeam: false,
  downloadable: true,
  mode: "download",
  enrolled: true,
  isPreview: false,
  unlocked: false,
};

describe("decideResourceAccess", () => {
  it("lets an enrolled student download when the switch is on", () => {
    expect(decideResourceAccess(base).ok).toBe(true);
  });

  it("refuses a download when the switch is off, even for an enrolled student", () => {
    expect(decideResourceAccess({ ...base, downloadable: false })).toMatchObject({ ok: false, status: 403 });
  });

  it("still lets that student view the file", () => {
    expect(decideResourceAccess({ ...base, downloadable: false, mode: "view" }).ok).toBe(true);
  });

  it("refuses someone who is not enrolled, whatever the switch says", () => {
    expect(decideResourceAccess({ ...base, enrolled: false }).ok).toBe(false);
    expect(decideResourceAccess({ ...base, enrolled: false, mode: "view" }).ok).toBe(false);
  });

  it("allows a preview lesson or a coin-store unlock without enrollment", () => {
    expect(decideResourceAccess({ ...base, enrolled: false, isPreview: true }).ok).toBe(true);
    expect(decideResourceAccess({ ...base, enrolled: false, unlocked: true }).ok).toBe(true);
  });

  it("always allows the mission team, even with the switch off", () => {
    expect(decideResourceAccess({ ...base, isTeam: true, enrolled: false, downloadable: false }).ok).toBe(true);
  });
});

describe("canShowInline", () => {
  it("shows PDFs and plain images, never SVG or HTML", () => {
    expect(canShowInline("application/pdf")).toBe(true);
    expect(canShowInline("image/PNG")).toBe(true);
    expect(canShowInline("image/svg+xml")).toBe(false);
    expect(canShowInline("text/html")).toBe(false);
  });
});

describe("downloadFileName", () => {
  it("adds the stored extension when the title has none", () => {
    expect(downloadFileName("Week 1 notes", "scan_0042.pdf")).toBe("Week 1 notes.pdf");
  });
  it("does not double the extension", () => {
    expect(downloadFileName("notes.pdf", "x.pdf")).toBe("notes.pdf");
  });
  it("strips characters that are unsafe in file names", () => {
    expect(downloadFileName('a/b:c"d', "x.zip")).toBe("a b c d.zip");
  });
  it("falls back to a name when the title is empty", () => {
    expect(downloadFileName("  ", "x.pdf")).toBe("lecture-file.pdf");
  });
});

describe("asciiFileName", () => {
  it("replaces non-ASCII characters and drops quotes", () => {
    expect(asciiFileName("পাঠ \"1\".pdf")).toBe("_ 1.pdf");
  });
});

describe("googleDownloadUrl", () => {
  it("returns the original file for a Drive file link", () => {
    expect(googleDownloadUrl("https://drive.google.com/file/d/abc_123/view?usp=sharing")).toBe(
      "https://drive.google.com/uc?export=download&id=abc_123"
    );
  });
  it("exports Docs and Sheets as PDF", () => {
    expect(googleDownloadUrl("https://docs.google.com/document/d/DOC1/edit")).toBe(
      "https://docs.google.com/document/d/DOC1/export?format=pdf"
    );
    expect(googleDownloadUrl("https://docs.google.com/spreadsheets/d/SHEET1/edit#gid=0")).toBe(
      "https://docs.google.com/spreadsheets/d/SHEET1/export?format=pdf"
    );
  });
  it("exports Slides as PDF", () => {
    expect(googleDownloadUrl("https://docs.google.com/presentation/d/SL1/edit")).toBe(
      "https://docs.google.com/presentation/d/SL1/export/pdf"
    );
  });
  it("returns null for folders, other sites and junk", () => {
    expect(googleDownloadUrl("https://drive.google.com/drive/folders/xyz")).toBeNull();
    expect(googleDownloadUrl("https://example.com/file.pdf")).toBeNull();
    expect(googleDownloadUrl("https://evil.example/?u=https://drive.google.com/file/d/abc/view")).toBeNull();
    expect(googleDownloadUrl("not a url")).toBeNull();
  });
});
