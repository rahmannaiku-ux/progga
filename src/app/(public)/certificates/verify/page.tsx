import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import {
  certificateVerifyPath,
  normalizeCertificateNo,
} from "@/lib/certificate/certificate-no";

export const metadata = {
  title: "Verify a Certificate",
  robots: { index: false, follow: false },
};

export default function VerifyCertificateIndexPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const id = normalizeCertificateNo(searchParams.id ?? "");
  if (id) redirect(certificateVerifyPath(id));

  return (
    <div className="container max-w-lg py-14">
      <div className="comic-panel bg-surface p-6 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-3 font-display text-2xl font-extrabold text-foreground">Verify a certificate</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the Certificate ID printed at the bottom of the certificate, or scan its QR code.
        </p>
        <form method="get" className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            name="id"
            required
            maxLength={40}
            placeholder="PRG-XXXX-XXXX-XXXX"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm uppercase text-foreground"
          />
          <button type="submit" className="comic-btn bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">
            Verify
          </button>
        </form>
      </div>
    </div>
  );
}
