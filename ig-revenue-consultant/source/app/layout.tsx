import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IG Revenue Consultant | Instagram収益の専属AIコンサル",
  description: "あなたの状況を理解し、収益の制約を根拠付きで見抜き、次の一手を一緒に決めて、結果から提案を磨く。Instagram収益化の戦略ルーム。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = { themeColor: "#10161C", colorScheme: "dark" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* 2系統のみ：見出しNoto Serif JP／本文Noto Sans JP。取得できない環境ではOSの日本語書体へフォールバック。 */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=Noto+Serif+JP:wght@500;600&display=swap" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
