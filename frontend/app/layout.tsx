import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./styles.css";
import { publicOrigin } from "../operator-access";

const description = "Benchmark AI agents, replay evidence, and investigate regressions.";
const socialImage = { url: "/brand/social.png", width: 1200, height: 630, alt: "Benchify" };

export const metadata: Metadata = {
  metadataBase: publicOrigin(),
  title: "Benchify",
  description,
  icons: {
    icon: { url: "/brand/benchify-icon.svg", type: "image/svg+xml" },
    apple: { url: "/brand/apple-touch-icon.png", sizes: "180x180" },
  },
  openGraph: { title: "Benchify", description, type: "website", images: [socialImage] },
  twitter: { card: "summary_large_image", title: "Benchify", description, images: [socialImage] },
};

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
