import { DoodleBlob, DoodleStar } from "@/components/marketing/cartoon-doodles";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="halftone-dots container py-14">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-bold text-foreground">
          About Proggaa
        </h1>

        <div className="comic-panel relative mt-6 space-y-4 overflow-hidden bg-surface p-8 text-sm leading-relaxed text-muted-foreground">
          <DoodleBlob className="pointer-events-none absolute -right-10 -top-10 h-40 w-40" />
          <DoodleStar className="pointer-events-none absolute -bottom-4 -left-4 h-12 w-12 -rotate-12 opacity-70" />

          <p className="relative">
            Proggaa exists because most online courses get abandoned around
            lesson three. We think structure and a little momentum — clear
            missions, visible progress, a streak worth protecting — closes
            that gap better than another autoplay video ever will.
          </p>
          <p className="relative">
            Underneath the comic-book energy is a serious learning platform:
            modular course authoring for mentors, timed and proctored exams,
            graded assignments with rubrics, and certificates that actually
            verify. The gamification is a layer on top of real outcomes, not
            a replacement for them.
          </p>
          <p className="relative">
            Every visual on this site — the mascot, the iconography, the
            color system — is an original design made for this product.
          </p>
        </div>
      </div>
    </div>
  );
}
