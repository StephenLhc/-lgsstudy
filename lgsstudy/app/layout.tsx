import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers"; // 👈 載入 Providers

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "每日靈修分享",
  description: "靈修文章與搜尋庫",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-HK" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}