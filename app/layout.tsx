import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bitwise — M0",
  description: "AI-authored interactive math lessons, live.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
