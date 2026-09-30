import fs from "node:fs";
import path from "node:path";
import { generate } from "@pdfme/generator";
import { text, image, line, rectangle, svg, barcodes } from "@pdfme/schemas";
import { certificateVerifyUrl } from "@/lib/certificate/certificate-no";

// A4 landscape, in mm.
const PAGE_WIDTH = 297;
const PAGE_HEIGHT = 210;

// Proggaa brand palette (globals.css light theme): deep purple, golden
// yellow, warm cream and the near-black purple ink.
const PURPLE = "#5A3296";
const GOLD = "#F2A900";
const CREAM = "#FBF8EE";
const INK = "#1B1233";
const MUTED = "#655A80";

const FONT_REGULAR = "HindSiliguri";
const FONT_BOLD = "HindSiliguriBold";

export type CertificateInput = {
  studentName: string;
  courseTitle: string;
  mentorName: string;
  /** Already formatted in Dhaka time, e.g. "September 30, 2026". */
  completedDate: string;
  certificateNo: string;
};

// Hind Siliguri covers Latin and Bangla. Anything else (emoji, other
// scripts) has no glyph and would make PDF generation throw, so drop it
// rather than fail a student's certificate over one unsupported character.
const UNSUPPORTED = /[^\p{Script=Latin}\p{Script=Bengali}\p{Script=Common}\p{M}]|\p{Extended_Pictographic}/gu;

export function cleanCertificateText(value: string, maxLength: number): string {
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(UNSUPPORTED, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trimEnd()}…` : cleaned;
}

/**
 * Splits a long title into evenly sized lines at spaces. Left to itself,
 * pdfme's wrapper treats a comma as its own word and can start a line
 * with one (", React"), and it fills the first line as full as it can
 * rather than balancing them.
 */
export function balanceTitle(title: string, targetLineLength = 48): string {
  const lineCount = Math.min(3, Math.ceil(title.length / targetLineLength));
  if (lineCount <= 1) return title;
  const breaks: number[] = [];
  for (let i = 1; i < lineCount; i++) {
    const ideal = Math.round((title.length * i) / lineCount);
    let best = -1;
    for (let j = 0; j < title.length; j++) {
      if (title[j] === " " && (best === -1 || Math.abs(j - ideal) < Math.abs(best - ideal))) best = j;
    }
    if (best !== -1 && !breaks.includes(best)) breaks.push(best);
  }
  breaks.sort((a, b) => a - b);
  let result = "";
  let last = 0;
  for (const b of breaks) {
    result += `${title.slice(last, b)}
`;
    last = b + 1;
  }
  return result + title.slice(last);
}

let assets: { regular: Buffer; bold: Buffer; logo: string } | null = null;

// Read from disk once per server instance. next.config.mjs lists these
// files in outputFileTracingIncludes so they ship with serverless builds.
function loadAssets() {
  if (!assets) {
    const fontDir = path.join(process.cwd(), "src", "lib", "certificate", "fonts");
    const logo = fs.readFileSync(path.join(process.cwd(), "public", "branding", "proggaa-logo-512.png"));
    assets = {
      regular: fs.readFileSync(path.join(fontDir, "HindSiliguri-Regular.ttf")),
      bold: fs.readFileSync(path.join(fontDir, "HindSiliguri-Bold.ttf")),
      logo: `data:image/png;base64,${logo.toString("base64")}`,
    };
  }
  return assets;
}

/** A four-point sparkle, the same motif as the one beside the Proggaa logo. */
const SPARKLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="${GOLD}" d="M50 0 C54 34 66 46 100 50 C66 54 54 66 50 100 C46 66 34 54 0 50 C34 46 46 34 50 0 Z"/></svg>`;

type TextOpts = Partial<{
  fontSize: number;
  bold: boolean;
  color: string;
  spacing: number;
  lineHeight: number;
  fit: { min: number; max: number; fit: "horizontal" | "vertical" };
}>;

function textSchema(name: string, x: number, y: number, width: number, height: number, opts: TextOpts = {}) {
  return {
    name,
    type: "text",
    position: { x, y },
    width,
    height,
    fontName: opts.bold ? FONT_BOLD : FONT_REGULAR,
    fontSize: opts.fontSize ?? 11,
    fontColor: opts.color ?? INK,
    alignment: "center",
    verticalAlignment: "middle",
    lineHeight: opts.lineHeight ?? 1.2,
    characterSpacing: opts.spacing ?? 0,
    ...(opts.fit ? { dynamicFontSize: opts.fit } : {}),
  };
}

function lineSchema(name: string, x: number, y: number, width: number, color: string, thickness = 0.4) {
  return { name, type: "line", position: { x, y }, width, height: thickness, color };
}

function sparkle(name: string, x: number, y: number, size: number) {
  return { name, type: "svg", position: { x, y }, width: size, height: size };
}

function buildTemplate() {
  const cx = PAGE_WIDTH / 2;
  const signW = 72;
  return {
    basePdf: { width: PAGE_WIDTH, height: PAGE_HEIGHT, padding: [0, 0, 0, 0] as [number, number, number, number] },
    schemas: [
      [
        // Paper + double frame (thick purple, hairline gold inside).
        { name: "paper", type: "rectangle", position: { x: 0, y: 0 }, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: CREAM, borderColor: CREAM, borderWidth: 0 },
        { name: "frameOuter", type: "rectangle", position: { x: 7, y: 7 }, width: PAGE_WIDTH - 14, height: PAGE_HEIGHT - 14, color: "", borderColor: PURPLE, borderWidth: 2.4, radius: 2 },
        { name: "frameInner", type: "rectangle", position: { x: 11, y: 11 }, width: PAGE_WIDTH - 22, height: PAGE_HEIGHT - 22, color: "", borderColor: GOLD, borderWidth: 0.6 },
        sparkle("cornerTL", 13.5, 13.5, 7),
        sparkle("cornerTR", PAGE_WIDTH - 20.5, 13.5, 7),
        sparkle("cornerBL", 13.5, PAGE_HEIGHT - 20.5, 7),
        sparkle("cornerBR", PAGE_WIDTH - 20.5, PAGE_HEIGHT - 20.5, 7),

        // Header: logo, title, divider.
        { name: "logo", type: "image", position: { x: cx - 20, y: 12.5 }, width: 40, height: 40 },
        textSchema("title", 48, 51, PAGE_WIDTH - 96, 11, {
          fontSize: 26,
          bold: true,
          color: PURPLE,
          spacing: 3,
          fit: { min: 16, max: 26, fit: "horizontal" },
        }),
        lineSchema("dividerLeft", cx - 38, 65.5, 30, GOLD, 0.6),
        sparkle("dividerStar", cx - 3.5, 62, 7),
        lineSchema("dividerRight", cx + 8, 65.5, 30, GOLD, 0.6),

        // Body: who, what.
        textSchema("certifyLine", 48, 70, PAGE_WIDTH - 96, 6, { fontSize: 10, color: MUTED, spacing: 2 }),
        textSchema("studentName", 24, 77, PAGE_WIDTH - 48, 19, {
          fontSize: 42,
          bold: true,
          color: INK,
          fit: { min: 14, max: 42, fit: "horizontal" },
        }),
        lineSchema("nameRule", 62, 97, PAGE_WIDTH - 124, PURPLE, 0.5),
        textSchema("completedLine", 48, 100.5, PAGE_WIDTH - 96, 7, { fontSize: 12, color: MUTED }),
        textSchema("courseTitle", 30, 108, PAGE_WIDTH - 60, 24, {
          fontSize: 24,
          bold: true,
          color: PURPLE,
          lineHeight: 1.15,
          fit: { min: 11, max: 24, fit: "vertical" },
        }),
        textSchema("platformLine", 48, 133, PAGE_WIDTH - 96, 7, { fontSize: 11, color: MUTED }),

        // Signature row: date | QR verification | mentor.
        textSchema("dateValue", 30, 156, signW, 8, { fontSize: 13, bold: true, fit: { min: 9, max: 13, fit: "horizontal" } }),
        lineSchema("dateRule", 30, 165, signW, PURPLE, 0.35),
        textSchema("dateLabel", 30, 166.5, signW, 5, { fontSize: 7.5, color: MUTED, spacing: 1.2 }),

        { name: "qr", type: "qrcode", position: { x: cx - 12, y: 147 }, width: 24, height: 24, barColor: INK, backgroundColor: CREAM },
        textSchema("qrLabel", cx - 30, 172, 60, 5, { fontSize: 7.5, color: MUTED, spacing: 1.2 }),

        textSchema("mentorValue", PAGE_WIDTH - 30 - signW, 156, signW, 8, { fontSize: 13, bold: true, fit: { min: 9, max: 13, fit: "horizontal" } }),
        lineSchema("mentorRule", PAGE_WIDTH - 30 - signW, 165, signW, PURPLE, 0.35),
        textSchema("mentorLabel", PAGE_WIDTH - 30 - signW, 166.5, signW, 5, { fontSize: 7.5, color: MUTED, spacing: 1.2 }),

        // Footer: ID + verify link.
        lineSchema("footerRule", 30, 179, PAGE_WIDTH - 60, GOLD, 0.3),
        textSchema("footer", 30, 181, PAGE_WIDTH - 60, 6, { fontSize: 8, color: MUTED, fit: { min: 6, max: 8, fit: "horizontal" } }),
      ],
    ],
  };
}

export async function renderCertificatePdf(input: CertificateInput): Promise<Buffer> {
  const { regular, bold, logo } = loadAssets();
  const studentName = cleanCertificateText(input.studentName, 90) || "Proggaa Hero";
  const courseTitle = cleanCertificateText(input.courseTitle, 140) || "Proggaa Mission";
  const mentorName = cleanCertificateText(input.mentorName, 60) || "Proggaa Mentor";
  const verifyUrl = certificateVerifyUrl(input.certificateNo);

  const pdfBytes = await generate({
    template: buildTemplate(),
    inputs: [
      {
        paper: "",
        frameOuter: "",
        frameInner: "",
        cornerTL: SPARKLE_SVG,
        cornerTR: SPARKLE_SVG,
        cornerBL: SPARKLE_SVG,
        cornerBR: SPARKLE_SVG,
        logo,
        title: "CERTIFICATE OF COMPLETION",
        dividerLeft: "",
        dividerStar: SPARKLE_SVG,
        dividerRight: "",
        certifyLine: "THIS IS TO CERTIFY THAT",
        studentName,
        nameRule: "",
        completedLine: "has successfully completed the mission",
        courseTitle: balanceTitle(courseTitle),
        platformLine: "on the Proggaa learning platform",
        dateValue: input.completedDate,
        dateRule: "",
        dateLabel: "DATE OF COMPLETION (UTC+06:00)",
        qr: verifyUrl,
        qrLabel: "SCAN TO VERIFY",
        mentorValue: mentorName,
        mentorRule: "",
        mentorLabel: "MENTOR",
        footerRule: "",
        footer: `Certificate ID ${input.certificateNo}  ·  Verify at ${verifyUrl}`,
      },
    ],
    options: {
      font: {
        [FONT_REGULAR]: { data: regular, fallback: true },
        [FONT_BOLD]: { data: bold },
      },
    },
    plugins: { text, image, line, rectangle, svg, qrcode: barcodes.qrcode },
  });

  return Buffer.from(pdfBytes);
}
