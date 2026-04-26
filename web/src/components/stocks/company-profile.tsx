import Image from "next/image";
import type { CompanyProfile } from "@/app/actions/symbols";

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const CompanyProfileCard = ({
  ticker,
  company,
}: {
  ticker: string;
  company: CompanyProfile | null;
}) => {
  const hasData =
    !!company?.description || !!company?.sector || !!company?.industry || !!company?.logoUrl;

  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-sm font-bold text-muted-foreground">Company</h2>

      <div className="space-y-4 rounded-xl bg-card p-4">
        {company?.logoUrl && (
          <div className="flex items-center">
            <Image
              src={company.logoUrl}
              alt={`${ticker} logo`}
              width={48}
              height={48}
              className="size-12 rounded-md object-cover"
              unoptimized
            />
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
