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
  metadataBase: new URL("https://oval.run"),
  title: "OVAL - Brand Intelligence",
  applicationName: "OVAL",
  description:
    "Unified brand intelligence to analyze social sentiment, detect public backlash, block unauthorized piracy, and eliminate brand fraud in real time.",
  icons: {
    icon: [{ url: "/brand/oval-favicon.png", type: "image/png", sizes: "512x512" }],
    shortcut: "/brand/oval-favicon.png",
    apple: [{ url: "/brand/oval-favicon.png", sizes: "512x512", type: "image/png" }],
  },
  openGraph: {
    title: "OVAL - Brand Intelligence",
    description:
      "What people say today shapes what happens tomorrow. Understand conversations, detect risk, and protect the brand in real time.",
    url: "https://oval.run",
    siteName: "OVAL",
    locale: "en_IN",
    type: "website",
    images: [
      {
        url: "/brand/oval-share-mark.png",
        width: 1507,
        height: 1044,
        alt: "OVAL Brand Intelligence mark",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OVAL - Brand Intelligence",
    description:
      "What people say today shapes what happens tomorrow. Brand intelligence for conversations, risk, and protection.",
    images: ["/brand/oval-share-mark.png"],
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
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
