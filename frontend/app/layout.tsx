import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./styles.css";
import { publicOrigin } from "../operator-access";

const description = "Don't just deploy AI agents. Prove they work under pressure with Bifrost Gateway and Tavily verification.";
const socialImage = { url: "/brand/social.png", width: 1200, height: 630, alt: "Benchify" };

export const metadata: Metadata = {
  metadataBase: publicOrigin(),
  title: "Benchify - AI Agent Reliability & Intelligence Platform",
  description,
  icons: {
    icon: { url: "/brand/benchify-icon.svg", type: "image/svg+xml" },
    apple: { url: "/brand/apple-touch-icon.png", sizes: "180x180" },
  },
  openGraph: { title: "Benchify", description, type: "website", images: [socialImage] },
  twitter: { card: "summary_large_image", title: "Benchify", description, images: [socialImage] },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('theme')==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[var(--canvas-bg)] text-[var(--text-main)] antialiased font-sans selection:bg-zinc-800 selection:text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
