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
  metadataBase: new URL('https://awm11.github.io/nuclear-reactor/'),
  title: 'Reactor Control — Nuclear Chain Reaction Simulator',
  description:
    'An interactive educational simulation of reactor criticality, neutron transport, and control rod response.',
  openGraph: {
    title: 'Reactor Control',
    description: 'Explore a self-sustaining nuclear chain reaction.',
    images: [{ url: '/og.png', width: 1728, height: 896, alt: 'Reactor Control chain reaction simulator' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Reactor Control',
    description: 'Explore a self-sustaining nuclear chain reaction.',
    images: ['/og.png'],
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
