import { customAlphabet } from "nanoid";
import { publicSiteUrl } from "@/lib/sms/messages";

// No 0/O/1/I, so an ID read off a printed certificate is hard to mistype.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomGroup = customAlphabet(ALPHABET, 4);

/**
 * A new unguessable certificate ID, e.g. `PRG-7K2M-QX9D-4HTC` (32^12
 * combinations). Older certificates keep their `HLMS-XXXXXXXXXX` IDs, which
 * `normalizeCertificateNo` and the verify page still accept.
 */
export function generateCertificateNo(): string {
  return `PRG-${randomGroup()}-${randomGroup()}-${randomGroup()}`;
}

/** Trims and upper-cases typed input so lookups ignore case and stray spaces. */
export function normalizeCertificateNo(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

/** Public page that confirms a certificate is genuine. */
export function certificateVerifyPath(certificateNo: string): string {
  return `/certificates/verify/${encodeURIComponent(certificateNo)}`;
}

export function certificateVerifyUrl(certificateNo: string, baseUrl: string = publicSiteUrl()): string {
  return `${baseUrl}${certificateVerifyPath(certificateNo)}`;
}
