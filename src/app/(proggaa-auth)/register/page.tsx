import { UserX } from "lucide-react";
import { RegisterFlow } from "@/components/auth/register-flow";
import { isFeatureEnabled } from "@/lib/config/feature-flags";

export const metadata = { title: "Create account — Proggaa" };

export default async function RegisterPage() {
  const registrationEnabled = await isFeatureEnabled("registration");

  if (!registrationEnabled) {
    return (
      <div className="comic-panel flex flex-col items-center gap-2 bg-surface p-6 text-center">
        <UserX className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">New sign-ups are paused</p>
        <p className="text-sm text-muted-foreground">
          We're not accepting new accounts right now — please check back soon.
        </p>
      </div>
    );
  }

  return <RegisterFlow />;
}
