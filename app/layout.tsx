import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-grotesk",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Pond Monitoring",
  description: "Daily shrimp pond tracker",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B1210",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${plexMono.variable}`}>
      <body className="flex min-h-screen flex-col">
        <div className="flex-1">{children}</div>
        {/* Open-Meteo data is CC BY 4.0 - attribution is a licence condition. */}
        <footer className="px-4 pb-4 pt-2 text-center font-mono text-[11px] text-tx-ghost">
          Weather data by{" "}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="text-tx-faint hover:text-tx-muted">
            Open-Meteo.com
          </a>
        </footer>
      </body>
    </html>
  );
}
