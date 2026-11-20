import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Memecoin Intelligence Terminal",
  description:
    "Paste a contract address. Get holder concentration, funding clusters, deployer history, flow quality and an evidence-based risk verdict.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning on <html> and <body> only silences attribute
    // mismatches on those exact elements. Browser extensions (Bitdefender,
    // Grammarly, password managers) inject attributes like bis_skin_checked and
    // __processed_*__ into <body> before React hydrates, which otherwise
    // surfaces as two "Issues" in the dev overlay on every single page load.
    // It hides nothing real: child-tree mismatches still report normally.
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable} h-full`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full bg-[#07080a] text-slate-200 antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
