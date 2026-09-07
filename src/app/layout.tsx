import type { Metadata } from "next";
import {
  DM_Sans,
  JetBrains_Mono,
  Space_Grotesk,
} from "next/font/google";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgentPay x402 Audit",
  description:
    "AI-assisted smart contract security review with x402-style payment verification.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={[
          spaceGrotesk.variable,
          dmSans.variable,
          jetbrainsMono.variable,
        ].join(" ")}
      >
        {children}
      </body>
    </html>
  );
}
