import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "R U Trading",
  description: "Paper trading for Rowan students",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ToastProvider>
          <AnchoredToastProvider>
            {children}
          </AnchoredToastProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
