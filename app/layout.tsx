import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import "./workspace.css";
import "./split-progress.css";
import "./filename-pattern.css";
import "./brand.css";
import "./merge.css";
import "./rename.css";
import "./extractor.css";
import "./account.css";
import "./settings.css";
import "./ai-choice.css";
import "./preview.css";
import "./pdf-preview.css";
import "./animations.css";
import "./certificate-warning.css";
import "./preview-drag.css";
const manrope = Manrope({ variable: "--font", subsets: ["latin"] });
export const metadata: Metadata = {
  title: "Nadia’s Tools — Workspace PDF & Excel",
  description:
    "Workspace internal untuk mengolah PDF dan Excel dengan cepat, rapi, dan mudah diperiksa.",
  icons: {
    icon: "/brand/nadias-tools-mark.svg",
    shortcut: "/brand/nadias-tools-mark.svg",
    apple: "/brand/nadias-tools-mark.svg",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={manrope.variable}>{children}</body>
    </html>
  );
}
