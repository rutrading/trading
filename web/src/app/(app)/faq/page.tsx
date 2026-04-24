import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/app/actions/auth";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionPanel,
} from "@/components/ui/accordion";

export const metadata: Metadata = { title: "FAQ - R U Trading" };

function FaqItem({
  value,
  question,
  children,
}: {
  value: string;
  question: string;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger>{question}</AccordionTrigger>
      <AccordionPanel>{children}</AccordionPanel>
    </AccordionItem>
  );
}

function Examples({ items }: { items: [label: string, text: string][] }) {
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5">
      {items.map(([label, text]) => (
        <li key={label}>
          <span className="font-medium text-foreground">{label}:</span> {text}
        </li>
      ))}
    </ul>
  );
}

export default async function FaqPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">FAQ</h1>
        <p className="text-sm text-muted-foreground">
          How R U Trading simulates orders, hours, and crypto markets.
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-8">
        <section className="rounded-2xl bg-accent p-6">
          <h2 className="mb-2 text-lg font-semibold">Stock market hours</h2>
          <Accordion multiple>
            <FaqItem
              value="hours-schedule"
              question="When is the US stock market open?"
            >
              <p>
                Monday through Friday, 9:30 AM – 4:00 PM ET, excluding US
                market holidays (NYSE calendar). Stock orders only fill during
                these hours unless you use a Market-on-Open (OPG) or
                Market-on-Close (CLS) time-in-force.
              </p>
            </FaqItem>
            <FaqItem
              value="hours-after-hours"
              question="Can I place stock orders outside market hours?"
            >
              <p>
                Limit, stop, and stop-limit orders can be placed anytime — they
                sit as &ldquo;open&rdquo; and start trying to fill at the next
                market open, whenever their price conditions are met.
              </p>
              <p className="mt-2">
                Market orders outside of regular hours are only accepted if the
                time-in-force is OPG (fills at the next open) or CLS (fills at
                the next close). Any other market order placed after hours is
                rejected.
              </p>
            </FaqItem>
          </Accordion>
        </section>

        <section className="rounded-2xl bg-accent p-6">
          <h2 className="mb-2 text-lg font-semibold">Order types</h2>
          <Accordion multiple>
            <FaqItem value="type-market" question="Market order">
              <p>
                Fills right away at the best available price. Use when
                execution matters more than price.
              </p>
              <Examples
                items={[
                  [
                    "Buy",
                    "Buy 10 AAPL at market — fills immediately near the current ask.",
                  ],
                  [
                    "Sell",
                    "Sell 10 AAPL at market — fills immediately near the current bid.",
                  ],
                ]}
              />
            </FaqItem>
            <FaqItem value="type-limit" question="Limit order">
              <p>
                Fills only at your limit price or better. Use when price
                matters more than execution speed.
              </p>
              <Examples
                items={[
                  [
                    "Buy",
                    "Buy 10 AAPL with a $180 limit — fills only if the price drops to $180 or below.",
                  ],
                  [
                    "Sell",
                    "Sell 10 AAPL with a $200 limit — fills only if the price rises to $200 or above.",
                  ],
                ]}
              />
            </FaqItem>
            <FaqItem value="type-stop" question="Stop order">
              <p>
                Sits idle until the price touches your stop level, then becomes
                a market order. Commonly used to cap losses or enter on
                breakouts.
              </p>
              <Examples
                items={[
                  [
                    "Sell (stop-loss)",
                    "Hold AAPL bought at $185, place a sell stop at $170 — if price drops to $170 it triggers and fills at market.",
                  ],
                  [
                    "Buy (breakout)",
                    "Place a buy stop at $200 — if price rises to $200 it triggers and fills at market.",
                  ],
                ]}
              />
            </FaqItem>
            <FaqItem value="type-stop-limit" question="Stop-limit order">
              <p>
                Like a stop, but once triggered it becomes a limit order
                instead of a market order. For a buy, the stop must be at or
                below the limit; for a sell, the stop must be at or above the
                limit.
              </p>
              <Examples
                items={[
                  [
                    "Sell",
                    "Stop $170, limit $168 — triggers at $170, then fills only if the price stays at or above $168.",
                  ],
                  [
                    "Buy",
                    "Stop $200, limit $202 — triggers at $200, then fills only if the price stays at or below $202.",
                  ],
                ]}
              />
            </FaqItem>
          </Accordion>
        </section>

        <section className="rounded-2xl bg-accent p-6">
          <h2 className="mb-2 text-lg font-semibold">Time in force (stocks)</h2>
          <Accordion multiple>
            <FaqItem value="tif-day" question="Day">
              <p>
                Expires automatically at 4:00 PM ET on the same trading day.
                The most common choice for intraday orders.
              </p>
            </FaqItem>
            <FaqItem value="tif-gtc" question="Good-til-Cancelled (GTC)">
              <p>
                Stays open indefinitely until it fills or you cancel it. For
                stocks, GTC orders still only fill during regular market hours.
              </p>
            </FaqItem>
            <FaqItem value="tif-opg" question="Market on Open (OPG)">
              <p>
                Fills in a 5-minute window starting at 9:30 AM ET. If placed
                after hours, it waits for the next trading day&apos;s open.
              </p>
            </FaqItem>
            <FaqItem value="tif-cls" question="Market on Close (CLS)">
              <p>
                Fills in a 5-minute window starting at 4:00 PM ET. If placed
                after hours, it waits for the next trading day&apos;s close.
              </p>
            </FaqItem>
          </Accordion>
        </section>

        <section className="rounded-2xl bg-accent p-6">
          <h2 className="mb-2 text-lg font-semibold">Crypto</h2>
          <Accordion multiple>
            <FaqItem
              value="crypto-differences"
              question="How is crypto different from stocks?"
            >
              <p>
                Crypto markets run 24/7 — no market hours, no holidays. Orders
                fill any time price conditions are met.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Only USD pairs (BTC/USD, ETH/USD, etc.) are supported. Other
                  denominations are filtered out of search.
                </li>
                <li>
                  All crypto orders run with GTC time-in-force. Day, OPG, and
                  CLS are not available for crypto.
                </li>
              </ul>
            </FaqItem>
          </Accordion>
        </section>
      </div>
    </div>
  );
}
