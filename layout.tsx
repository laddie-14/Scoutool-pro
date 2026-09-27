import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scoutool Pro – Accurate Shopify Email Scraper",
  description: "Fast & accurate email extraction focused on Shopify stores. Privacy Policy first.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
