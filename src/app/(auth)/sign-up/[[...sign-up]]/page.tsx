import { SignUp } from "@clerk/nextjs";
import { UserX } from "lucide-react";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { DoodleStar, DoodleSparkle } from "@/components/marketing/cartoon-doodles";
import { isFeatureEnabled } from "@/lib/config/feature-flags";

export default async function SignUpPage() {
  const registrationEnabled = await isFeatureEnabled("registration");

  return (
    <div>
      <div className="relative mb-6 text-center">
        <DoodleSparkle className="pointer-events-none absolute -left-1 top-2 h-7 w-7 opacity-70" />
        <DoodleStar className="pointer-events-none absolute -right-2 top-0 h-9 w-9 rotate-12 opacity-70" />
        <ProggyMascot state="welcoming" className="mx-auto h-24 w-24" groundShadow priority />
        <h1 className="mt-2 font-display text-2xl font-extrabold text-foreground">
          Create your hero account!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Join Proggaa and start leveling up 🌟</p>
      </div>

      {registrationEnabled ? (
        <SignUp
          appearance={{
            elements: {
              rootBox: "mx-auto w-full",
              card: "comic-panel bg-surface p-2 shadow-none",
              headerTitle: "hidden",
              headerSubtitle: "hidden",
              socialButtonsBlockButton: "comic-btn border-border text-foreground hover:bg-muted",
              formButtonPrimary: "comic-btn bg-primary text-primary-foreground hover:bg-primary/90",
              formFieldInput: "bg-surface border-border text-foreground",
              footerActionLink: "font-semibold text-accent hover:text-accent/80",
            },
          }}
        />
      ) : (
        <div className="comic-panel flex flex-col items-center gap-2 bg-surface p-6 text-center">
          <UserX className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">New sign-ups are paused</p>
          <p className="text-sm text-muted-foreground">
            We're not accepting new accounts right now — please check back soon.
          </p>
        </div>
      )}
    </div>
  );
}
