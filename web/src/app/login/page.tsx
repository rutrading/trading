"use client";

import { SignInForm } from "@/components/sign-in-form";
import { SignUpForm } from "@/components/sign-up-form";
import { useState } from "react";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-4">
        <h1 className="text-center text-2xl font-bold">R U Trading</h1>

        {mode === "signin" ? <SignInForm /> : <SignUpForm />}

        <p className="text-center text-sm text-gray-500">
          {mode === "signin" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                onClick={() => setMode("signup")}
                className="underline hover:text-gray-800 dark:hover:text-gray-200"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => setMode("signin")}
                className="underline hover:text-gray-800 dark:hover:text-gray-200"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
