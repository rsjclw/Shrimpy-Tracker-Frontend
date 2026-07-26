import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shrimp Farm",
  description: "Daily farm tracker",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <div className="flex-1">{children}</div>
        {/* Open-Meteo data is CC BY 4.0 - attribution is a licence condition. */}
        <footer className="px-4 py-3 text-center text-xs text-slate-400">
          Weather data by{" "}
          <a
            href="https://open-meteo.com/"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            Open-Meteo.com
          </a>
        </footer>
      </body>
    </html>
  );
}
