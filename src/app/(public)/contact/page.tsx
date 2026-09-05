import { ContactForm } from "@/components/marketing/contact-form";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <div className="container max-w-xl py-14">
      <h1 className="font-display text-3xl font-semibold text-foreground">
        Get in touch
      </h1>
      <p className="mt-2 text-muted-foreground">
        Questions about missions, billing, or becoming a mentor — we read
        every message.
      </p>
      <div className="mt-8 glass-panel p-6">
        <ContactForm />
      </div>
    </div>
  );
}
