import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "크라임씬플레이 | 부산 서면 롤플레잉 추리게임",
    template: "%s | 크라임씬플레이",
  },
  description:
    "용의자가 되어 현장을 조사하고, 진술을 엇갈리게 만들며, 진범을 찾아내는 90분 롤플레잉 추리게임.",
  other: {
    "codex-preview": "development",
  },
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
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
