import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  certificateVerifyPath,
  certificateVerifyUrl,
  generateCertificateNo,
  normalizeCertificateNo,
} from "@/lib/certificate/certificate-no";
import { balanceTitle, cleanCertificateText, renderCertificatePdf } from "@/lib/certificate/generate-certificate";

describe("certificate numbers", () => {
  it("generates unique IDs in the PRG-XXXX-XXXX-XXXX format", () => {
    const ids = new Set(Array.from({ length: 500 }, generateCertificateNo));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^PRG(-[A-HJ-NP-Z2-9]{4}){3}$/);
  });

  it("normalizes typed input", () => {
    expect(normalizeCertificateNo("  prg-7k2m- qx9d-4htc ")).toBe("PRG-7K2M-QX9D-4HTC");
  });

  it("builds a verify path and absolute URL", () => {
    expect(certificateVerifyPath("PRG-AAAA-BBBB-CCCC")).toBe("/certificates/verify/PRG-AAAA-BBBB-CCCC");
    expect(certificateVerifyUrl("PRG-AAAA-BBBB-CCCC", "https://example.com")).toBe(
      "https://example.com/certificates/verify/PRG-AAAA-BBBB-CCCC"
    );
  });
});

describe("certificate text cleaning", () => {
  it("strips emoji and control characters, keeps Bangla", () => {
    expect(cleanCertificateText("Rahim 🎉\n  Uddin", 50)).toBe("Rahim Uddin");
    expect(cleanCertificateText("আব্দুর রহিম", 50)).toBe("আব্দুর রহিম");
  });

  it("truncates overlong text", () => {
    expect(cleanCertificateText("a".repeat(200), 20)).toHaveLength(20);
  });
});

describe("balanceTitle", () => {
  it("leaves short titles alone", () => {
    expect(balanceTitle("Python Basics")).toBe("Python Basics");
  });

  it("breaks long titles at spaces into balanced lines, never mid-word", () => {
    const title = "Complete Web Development Bootcamp: HTML, CSS, JavaScript, React, Node.js and Databases";
    const lines = balanceTitle(title).split("\n");
    expect(lines.length).toBe(2);
    expect(lines.join(" ")).toBe(title);
    expect(Math.abs((lines[0] ?? "").length - (lines[1] ?? "").length)).toBeLessThan(12);
  });
});

describe("certificate PDF", () => {
  const base = {
    mentorName: "Nusrat Jahan",
    completedDate: "September 30, 2026",
    certificateNo: "PRG-7K2M-QX9D-4HTC",
  };
  const cases: Record<string, { studentName: string; courseTitle: string }> = {
    short: { studentName: "Rahim Uddin", courseTitle: "Python Basics" },
    bangla: { studentName: "আব্দুর রহিম চৌধুরী", courseTitle: "প্রোগ্রামিং এর হাতেখড়ি" },
    long: {
      studentName: "Muhammad Abdullah Al Mamun Ibn Rahman Chowdhury Mohammad Kamrul Hasan Siddique",
      courseTitle:
        "Complete Web Development Bootcamp: HTML, CSS, JavaScript, React, Node.js and Databases for Absolute Beginners",
    },
  };

  for (const [name, c] of Object.entries(cases)) {
    it(`renders a one-page PDF (${name})`, async () => {
      const pdf = await renderCertificatePdf({ ...base, ...c });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(10_000);
      const dir = process.env.CERT_PREVIEW_DIR;
      if (dir) fs.writeFileSync(path.join(dir, `certificate-${name}.pdf`), pdf);
    }, 30_000);
  }
});
