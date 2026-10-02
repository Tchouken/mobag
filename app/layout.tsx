import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "MobAG — Vote en assemblée générale",
  description: "Gestion des votes en assemblée générale — MobilActif",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Rendu toujours dynamique : chaque page reçoit le nonce de sa requête (CSP, proxy.ts).
export default async function RootLayout({ children }: LayoutProps<"/">) {
  await headers();
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
