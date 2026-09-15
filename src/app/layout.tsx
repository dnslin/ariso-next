import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Ariso · 工程状态",
  description: "Ariso 单用户自托管图床，当前正在建设运行基础。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          background: "#fffffe",
          color: "#272343",
          fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
          lineHeight: 1.7,
        }}
      >
        {children}
      </body>
    </html>
  );
}
