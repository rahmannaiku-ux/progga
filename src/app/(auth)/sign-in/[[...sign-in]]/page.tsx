import { SignIn } from "@clerk/nextjs";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { DoodleStar, DoodleSparkle } from "@/components/marketing/cartoon-doodles";

export default function SignInPage() {
  return (
    <div className="relative">
      <DoodleStar className="pointer-events-none absolute -left-6 -top-4 h-10 w-10 -rotate-12 animate-cartoon-twinkle opacity-80" />
      <DoodleSparkle className="pointer-events-none absolute -right-4 top-2 h-8 w-8 animate-cartoon-twinkle opacity-90 [animation-delay:500ms]" />
      <DoodleStar className="pointer-events-none absolute right-10 bottom-10 h-6 w-6 rotate-12 animate-cartoon-twinkle opacity-60 [animation-delay:900ms]" />

      <div className="mb-6 text-center">
        <ProggyMascot state="welcoming" className="mx-auto h-28 w-28" groundShadow priority />
        <h1 className="mt-2 font-display text-2xl font-extrabold text-foreground">
          Welcome back, hero!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Continue your learning adventure 🚀</p>
      </div>

      <div className="comic-panel-bold bg-surface p-2">
        <SignIn
          appearance={{
            elements: {
              rootBox: "mx-auto w-full",
              card: "bg-transparent p-2 shadow-none",
              headerTitle: "hidden",
              headerSubtitle: "hidden",
              socialButtonsBlockButton: "comic-btn border border-border/15 bg-surface text-foreground hover:bg-muted",
              formButtonPrimary: "comic-btn bg-primary text-primary-foreground hover:bg-primary/90",
              formFieldInput: "bg-surface border-border/15 text-foreground",
              footerActionLink: "font-semibold text-primary hover:text-primary/80",
            },
          }}
        />
      </div>
    </div>
  );
}
