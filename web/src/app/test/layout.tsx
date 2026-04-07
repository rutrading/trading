import { Header } from "./_components/header";

export default function TestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 py-4">
        <Header />
        {children}
      </div>
    </div>
  );
}
