import { Megaphone } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { AdStudio } from "@/components/admin-dashboard/ad-studio";

export const metadata = { title: "Ad Studio" };

export default async function AdStudioPage() {
  await requireRole("ADMIN");
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Megaphone className="h-6 w-6 text-primary" aria-hidden="true" />
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Ad Studio</h1>
          <p className="text-sm text-muted-foreground">
            Pick a template, fill in the text, and download a ready-to-post picture for Facebook, Instagram or YouTube.
          </p>
        </div>
      </div>
      <AdStudio />
    </div>
  );
}
