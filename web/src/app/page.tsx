import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">R U Trading</h1>
        <p className="text-gray-500">Paper trading for Rutgers students</p>
        <Link
          href="/login"
          className="inline-block rounded bg-black px-6 py-2 text-white dark:bg-white dark:text-black"
        >
          Get Started
        </Link>
      </div>
    </div>
  );
}
