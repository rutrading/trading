import { Spinner } from "@/components/ui/spinner";

export default function AppLoading() {
  return (
    <div className="grid min-h-[60vh] place-items-center rounded-2xl bg-accent">
      <div className="grid size-20 place-items-center rounded-xl bg-background/40 backdrop-blur-[1px]">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    </div>
  );
}
