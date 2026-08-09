/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "sonner";
import { CommandPalette } from "@/components/ui/command-palette";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OVAL — Brand Intelligence Platform",
  description: "See what they say before it spreads. Brand intelligence across Instagram, Reddit, YouTube, Telegram, and Google.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${outfit.variable} font-sans antialiased`}>
        <ThemeProvider>
          <a href="#main-content" className="skip-link">Skip to main content</a>
          <AppShell>{children}</AppShell>
          <Toaster position="bottom-right" richColors closeButton />
          <CommandPalette />
        </ThemeProvider>
      </body>
    </html>
  );
}
