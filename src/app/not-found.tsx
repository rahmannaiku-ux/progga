import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { DoodleStar, DoodleSparkle } from "@/components/marketing/cartoon-doodles";

export default function NotFound() {
  return (
    <div className="hero-backdrop flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="comic-panel halftone-dots relative max-w-md overflow-hidden bg-surface p-10">
        <DoodleStar className="pointer-events-none absolute -left-4 top-6 h-10 w-10 -rotate-12 opacity-70" />
        <DoodleSparkle className="pointer-events-none absolute -right-2 -top-2 h-9 w-9 opacity-70" />

        <p className="font-display text-6xl font-extrabold leading-none text-primary">404</p>

        <ProggyMascot state="confused" className="mx-auto -mt-4 h-36 w-36" groundShadow />

        <h1 className="mt-2 flex items-center justify-center gap-1.5 font-display text-xl font-extrabold text-foreground">
          <Search className="h-5 w-5 text-accent" /> Oops! Page not found
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
          The page you're looking for seems to have gone on an adventure — it's not where you left it.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="accent" size="lg" className="comic-btn">
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="comic-btn">
            <Link href="/courses">Explore missions</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
