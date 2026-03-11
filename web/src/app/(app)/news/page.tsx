import { redirect } from "next/navigation";
import { getSession } from "@/app/actions/auth";

export const metadata = { title: "News - R U Trading" };

export default async function NewsPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">News</h1>
        <p className="text-sm text-muted-foreground">
          Financial news and headlines.
        </p>
      </div>
    </div>
  );
}
