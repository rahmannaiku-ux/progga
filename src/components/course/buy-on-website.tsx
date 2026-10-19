import { ExternalLink } from "lucide-react";
import { openInBrowserHref } from "@/lib/apps";

/**
 * What the Proggaa apps show instead of the purchase panel: paid missions
 * are bought on prooggaa.com in the person's browser, where checkout lives.
 * The link opens the browser (the apps catch proggaa://browser links).
 */
export function BuyOnWebsite({ priceLabel, url, pending }: { priceLabel: string; url: string; pending: boolean }) {
  return (
    <div className="space-y-2.5 text-center lg:text-left">
      <p className="font-display text-2xl font-extrabold text-foreground">{priceLabel}</p>
      <a
        href={openInBrowserHref(url)}
        className="comic-btn flex h-12 w-full items-center justify-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground"
      >
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        {pending ? "Finish your payment on prooggaa.com" : "Buy on prooggaa.com"}
      </a>
      <p className="text-xs text-muted-foreground">
        Missions are bought on the website. Once it&apos;s paid, the mission opens here in the app too.
      </p>
    </div>
  );
}
