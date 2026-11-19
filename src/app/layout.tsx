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
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full`}>
      <body className="min-h-full bg-[#07080a] text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
