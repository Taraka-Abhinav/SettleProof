import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'SettleProof — AI Finance Controller',
  description:
    'An evidence-first settlement close agent that proves every match and admits every exception.',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'SettleProof — Every rupee accounted for.',
    description:
      'An evidence-first AI finance controller with measured match accuracy and an honest exception list.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SettleProof — Every rupee accounted for.',
    description:
      'An evidence-first AI finance controller with measured match accuracy and an honest exception list.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
