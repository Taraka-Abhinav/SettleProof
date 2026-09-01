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
  metadataBase: new URL(
    'https://settleproof-260831.revanthsivakumar1.chatgpt.site',
  ),
  title: 'SettleProof — AI Finance Controller',
  description:
    'Import raw finance exports locally, close verified settlements, and preserve every unresolved exception.',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    url: 'https://settleproof-260831.revanthsivakumar1.chatgpt.site',
    title: 'SettleProof — Every rupee accounted for.',
    description:
      'A browser-local AI finance controller with verified reconciliation, measured benchmark accuracy, and an honest exception list.',
    type: 'website',
    images: [
      {
        url: 'https://settleproof-260831.revanthsivakumar1.chatgpt.site/og.png',
        width: 1200,
        height: 630,
        alt: 'SettleProof — Every rupee accounted for.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SettleProof — Every rupee accounted for.',
    description:
      'A browser-local AI finance controller with verified reconciliation, measured benchmark accuracy, and an honest exception list.',
    images: [
      'https://settleproof-260831.revanthsivakumar1.chatgpt.site/og.png',
    ],
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
