import type { Metadata } from "next";
import { Space_Mono, JetBrains_Mono, DM_Sans } from 'next/font/google';
import { AuthProvider } from "@/lib/auth";
import Providers from "@/components/Providers";
import "./globals.css";

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "RailTrack AI — Intelligent Railway Traffic Decision Support",
  description: "AI-powered railway traffic management system for Indian Railways section controllers. Real-time conflict detection, optimization, and what-if simulation.",
  keywords: ["railway", "traffic", "AI", "optimization", "Indian Railways", "conflict detection"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceMono.variable} ${jetbrainsMono.variable} ${dmSans.variable}`}>
      <body>
        <Providers>
          <AuthProvider>
            {children}
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
