import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EvalOS",
  description: "Open-source eval analytics for AI agent traces."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
