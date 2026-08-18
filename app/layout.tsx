import type { Metadata } from "next";
import "./globals.css";
import "./clarity-notice.css";

export const metadata: Metadata = {
  title: {
    default: "크라임씬플레이 | 부산 서면 크라임씬 추리게임",
    template: "%s | 크라임씬플레이",
  },
  description:
    "사건 속 인물이 되어 현장을 조사하고 단서와 진술을 바탕으로 범인을 찾는 부산 서면 크라임씬 추리게임.",
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
