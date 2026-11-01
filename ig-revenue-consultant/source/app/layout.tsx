import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IG Revenue Consultant | Instagram収益最大化AI",
  description: "収益源の発見、実験、投稿、報酬・費用、AI改善をつなぐ個人ワークスペース。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
