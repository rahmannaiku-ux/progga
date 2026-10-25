import type { Metadata } from "next";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { JsonLd } from "@/components/shared/json-ld";
import { breadcrumbJsonLd, faqJsonLd } from "@/lib/seo/structured-data";

export const metadata: Metadata = {
  title: "FAQ: HSC & Admission Courses, Payment, Classes and Exams",
  description:
    "Answers for students and parents: how to enroll in an HSC or admission Mission, paying with bKash, live and recorded classes, the app, MCQ exams, certificates and support.",
};

// The questions students and parents ask most about online HSC and admission coaching in
// Bangladesh, answered for how Proggaa actually works. Kept as plain text so the same copy
// feeds the page and the FAQPage structured data.
const sections: { title: string; items: { q: string; a: string }[] }[] = [
  {
    title: "Getting started",
    items: [
      {
        q: "What is Proggaa?",
        a: "Proggaa is an online learning platform for Bangladeshi students, built around HSC and university admission preparation. Each course is a Mission made of Operations and Patrols (lessons) with video, notes, resources, exams and XP, so you always know what to study next and how far you've come.",
      },
      {
        q: "Who is Proggaa for?",
        a: "Mainly HSC students (Class 11 and 12) and students preparing for university, engineering and medical admission tests. Anyone can browse the Missions and join a free one.",
      },
      {
        q: "How do I create an account?",
        a: "Sign up with your mobile number. We send a one-time code by SMS to confirm it, then you set a password and fill in a short profile (college and HSC batch).",
      },
      {
        q: "Is there anything free?",
        a: "Yes. Every account can browse the full catalog and enroll in free Missions straight away, no payment needed. Paid Missions show their price before you buy.",
      },
      {
        q: "Are classes in Bangla or English?",
        a: "Both. Missions are made for the Bangla or the English version of the curriculum, and each Mission page shows which one it follows.",
      },
    ],
  },
  {
    title: "Payment and enrollment",
    items: [
      {
        q: "How do I buy a Mission?",
        a: "Open the Mission, press Enroll, pay the amount shown with bKash or another mobile banking option shown at checkout, and enter the transaction ID you receive. The Mission unlocks as soon as the payment is matched.",
      },
      {
        q: "How long does it take to get access after paying?",
        a: "Your Mission unlocks as soon as the payment is matched to your transaction ID. Until then it shows as awaiting verification on your Payments page, and you can contact Support if it takes longer than expected.",
      },
      {
        q: "I entered the wrong transaction ID. What now?",
        a: "Contact Support with the correct transaction ID and the number you paid from. Each transaction ID can be used only once, and a false or someone else's ID is rejected.",
      },
      {
        q: "Can I use a coupon or discount?",
        a: "Yes. When a Mission has an active discount the reduced price is shown on its page, and you can enter a coupon code at checkout if you have one.",
      },
      {
        q: "Can I get a refund?",
        a: "Send a refund request through Support. Every request is looked at individually.",
      },
      {
        q: "How long do I keep access to a Mission?",
        a: "Once you're enrolled, the Mission stays in My Missions. There's no countdown on your access, so you can revise right up to the exam.",
      },
    ],
  },
  {
    title: "Classes and study",
    items: [
      {
        q: "Are classes live or recorded?",
        a: "Both. Patrols are recorded video lessons you can watch any time, at your own pace, as often as you like. Some Missions also run live classes, which appear on your Live Classes page and calendar.",
      },
      {
        q: "Can I study on my phone?",
        a: "Yes. Proggaa works in any phone browser, and there are Android and Windows apps on the Download page that can send you phone notifications.",
      },
      {
        q: "Can I use one account on several devices?",
        a: "Your account can be signed in on one device at a time. Signing in somewhere new signs the old device out, which keeps your account and your results yours.",
      },
      {
        q: "Where do I ask questions about a lesson?",
        a: "Ask in the Community: join a study group for your subject or batch, or post your question. Live classes are another place to ask your teacher directly.",
      },
      {
        q: "Can I take notes and save lessons?",
        a: "Yes. You can write notes on each lesson and bookmark the ones you want to come back to before an exam.",
      },
    ],
  },
  {
    title: "Exams, results and certificates",
    items: [
      {
        q: "Are there MCQ exams and model tests?",
        a: "Yes. Missions include quizzes and timed exams (Encounters and Challenges). You get your score and can review your answers on the Results page.",
      },
      {
        q: "How are exams kept fair?",
        a: "Exams use timers, attempt limits and checks such as leaving the exam window. Sharing questions or getting someone else to sit an exam can cancel the attempt and suspend the account.",
      },
      {
        q: "Do I get a certificate?",
        a: "When you finish every Patrol, Encounter and Challenge in a Mission, a certificate (Medal) is generated with a unique code that anyone can check on the certificate verification page.",
      },
      {
        q: "What are XP, streaks and the leaderboard?",
        a: "You earn XP for finishing lessons and exams. Your streak counts the days in a row you study, and the leaderboard shows how you compare with other Heroes. Missing a day only restarts the streak; your XP and finished Missions are never lost.",
      },
    ],
  },
  {
    title: "Teachers",
    items: [
      {
        q: "I'm a teacher. How do I teach on Proggaa?",
        a: "Apply for a Mentor account from your profile settings. Once approved, you get a Mission builder to set up modules, chapters and lessons, add YouTube videos and notes, and create exams.",
      },
    ],
  },
];

const allItems = sections.flatMap((s) => s.items);

export default function FaqPage() {
  return (
    <div className="container max-w-2xl py-14">
      <JsonLd
        data={[
          faqJsonLd(allItems),
          breadcrumbJsonLd([
            { name: "Home", path: "" },
            { name: "FAQ", path: "/faq" },
          ]),
        ]}
      />
      <h1 className="font-display text-3xl font-semibold text-foreground">Frequently asked questions</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        About HSC and admission Missions, payments, classes, exams and certificates.
      </p>
      {sections.map((section) => (
        <section key={section.title} className="mt-8">
          <h2 className="font-display text-lg font-bold text-foreground">{section.title}</h2>
          <div className="mt-3 glass-panel px-6">
            <Accordion type="single" collapsible>
              {section.items.map((item) => (
                <AccordionItem key={item.q} value={item.q}>
                  <AccordionTrigger>{item.q}</AccordionTrigger>
                  <AccordionContent>{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      ))}
    </div>
  );
}
