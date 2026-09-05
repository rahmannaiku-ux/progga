import { generate } from "@pdfme/generator";
import { text } from "@pdfme/schemas";
import { BLANK_A4_PDF } from "@pdfme/common";

// A4 landscape in mm, matching BLANK_A4_PDF's default portrait dims swapped.
const PAGE_WIDTH = 297;
const PAGE_HEIGHT = 210;

const template = {
  basePdf: { ...BLANK_A4_PDF, width: PAGE_WIDTH, height: PAGE_HEIGHT },
  schemas: [
    [
      {
        name: "kicker",
        type: "text",
        position: { x: 0, y: 40 },
        width: PAGE_WIDTH,
        height: 10,
        fontSize: 14,
        alignment: "center",
        fontColor: "#7C3AED",
      },
      {
        name: "studentName",
        type: "text",
        position: { x: 0, y: 70 },
        width: PAGE_WIDTH,
        height: 20,
        fontSize: 32,
        alignment: "center",
        fontColor: "#0a0a14",
      },
      {
        name: "courseLine",
        type: "text",
        position: { x: 20, y: 100 },
        width: PAGE_WIDTH - 40,
        height: 15,
        fontSize: 15,
        alignment: "center",
        fontColor: "#333333",
      },
      {
        name: "mentorName",
        type: "text",
        position: { x: 20, y: 150 },
        width: 120,
        height: 10,
        fontSize: 11,
        alignment: "left",
        fontColor: "#555555",
      },
      {
        name: "issuedDate",
        type: "text",
        position: { x: PAGE_WIDTH - 140, y: 150 },
        width: 120,
        height: 10,
        fontSize: 11,
        alignment: "right",
        fontColor: "#555555",
      },
      {
        name: "certificateNo",
        type: "text",
        position: { x: 0, y: 190 },
        width: PAGE_WIDTH,
        height: 8,
        fontSize: 9,
        alignment: "center",
        fontColor: "#999999",
      },
    ],
  ],
};

export async function renderCertificatePdf(input: {
  studentName: string;
  courseTitle: string;
  mentorName: string;
  issuedDate: string;
  certificateNo: string;
}): Promise<Buffer> {
  const pdfBytes = await generate({
    template,
    inputs: [
      {
        kicker: "CERTIFICATE OF COMPLETION",
        studentName: input.studentName,
        courseLine: `has successfully completed the mission "${input.courseTitle}" on Proggaa`,
        mentorName: `Mentor: ${input.mentorName}`,
        issuedDate: `Issued: ${input.issuedDate}`,
        certificateNo: `Verification code: ${input.certificateNo}`,
      },
    ],
    plugins: { text },
  });

  return Buffer.from(pdfBytes);
}
