import { Spinner } from "@/components/ui/spinner";

export default function AppLoading() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}
