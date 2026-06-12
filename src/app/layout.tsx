import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenBeats",
  description: "OpenUI control layouts on a live declarative drum engine (Tone.js)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
