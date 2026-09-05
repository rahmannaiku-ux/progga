import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

export const metadata = { title: "FAQ" };

const faqs = [
  {
    q: "What does 'mission-based learning' actually mean?",
    a: "It's ordinary structured learning — courses, modules, lessons, quizzes, exams — wrapped in a mission/patrol/encounter vocabulary and an XP system. Under the hood your mentor is tracking real completion and grades, same as any LMS.",
  },
  {
    q: "Do I need to pay to start?",
    a: "No. Every account can browse the catalog and enroll in free missions immediately. Paid missions and the Hero plan unlock the rest of the catalog and certificates.",
  },
  {
    q: "How do certificates work?",
    a: "When you complete every patrol, encounter, and challenge in a mission, a certificate (medal) is generated automatically with a unique verification code you can share.",
  },
  {
    q: "Can I lose my streak?",
    a: "Streaks track consecutive days with at least one completed patrol or encounter. Miss a day and the streak resets to zero — your XP and completed missions are never affected.",
  },
  {
    q: "I'm an instructor — how do I publish a mission?",
    a: "Apply for a mentor account from your profile settings. Once approved, you get a mission builder to structure modules, chapters, and lessons, and paste in YouTube video URLs directly.",
  },
];

export default function FaqPage() {
  return (
    <div className="container max-w-2xl py-14">
      <h1 className="font-display text-3xl font-semibold text-foreground">
        Frequently asked questions
      </h1>
      <div className="mt-8 glass-panel px-6">
        <Accordion type="single" collapsible>
          {faqs.map((item, i) => (
            <AccordionItem key={i} value={String(i)}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
