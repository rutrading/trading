import Image from "next/image";
import type { CompanyProfile } from "@/app/actions/symbols";

const logoDevPublicKey = process.env.NEXT_PUBLIC_LOGO_DEV_PUBLIC_KEY;

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const buildLogoDevUrl = (ticker: string, theme: "light" | "dark") => {
  if (!logoDevPublicKey) return null;

  const [cryptoSymbol] = ticker.split("/");
  const lookupPath = ticker.includes("/")
    ? `crypto/${encodeURIComponent(cryptoSymbol)}`
    : `ticker/${encodeURIComponent(ticker)}`;

  return `https://img.logo.dev/${lookupPath}?token=${logoDevPublicKey}&size=128&format=png&fallback=404&theme=${theme}`;
};

export const CompanyProfileCard = ({
  ticker,
  company,
}: {
  ticker: string;
  company: CompanyProfile | null;
}) => {
  const hasData =
    !!company?.description || !!company?.sector || !!company?.industry;
  const lightLogoUrl = buildLogoDevUrl(ticker, "light");
  const darkLogoUrl = buildLogoDevUrl(ticker, "dark");

  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-sm font-bold text-muted-foreground">Company</h2>

      <div className="space-y-4 rounded-xl bg-card p-4">
        {lightLogoUrl && darkLogoUrl && (
          <div className="flex items-center gap-3">
            <Image
              src={lightLogoUrl}
              alt={`${ticker} logo`}
              width={48}
              height={48}
              className="size-12 rounded-md object-cover dark:hidden"
              unoptimized
            />
            <Image
              src={darkLogoUrl}
              alt={`${ticker} logo`}
              width={48}
              height={48}
              className="hidden size-12 rounded-md object-cover dark:block"
              unoptimized
            />
            <a
              href="https://logo.dev"
              className="text-[10px] font-medium text-muted-foreground underline-offset-2 hover:underline"
              title="Logo API"
            >
              Logos provided by Logo.dev
            </a>
          </div>
        )}
        {(company?.sector || company?.industry) && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="font-bold text-muted-foreground">Sector</p>
              <p className="font-normal">{company?.sector ? toTitleCase(company.sector) : "-"}</p>
            </div>
            <div>
              <p className="font-bold text-muted-foreground">Industry</p>
              <p className="font-normal">{company?.industry ? toTitleCase(company.industry) : "-"}</p>
            </div>
          </div>
        )}

        {company?.description && (
          <div className="space-y-1">
            <p className="text-xs font-bold text-muted-foreground">Description</p>
            <p className="text-sm leading-6 font-normal">{company.description}</p>
          </div>
        )}

        {!hasData && (
          <p className="text-sm text-muted-foreground">
            We couldn't pull any company details yet, check again later.
          </p>
        )}
      </div>
    </div>
  );
};
