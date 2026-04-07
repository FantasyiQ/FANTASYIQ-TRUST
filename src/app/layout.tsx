import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'FantasyiQ Trust — Your League Dues. Protected.',
  description: 'The fantasy football platform that never touches your money. Zero fees. Zero skimming. Total trust.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className + ' bg-gray-950'}>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
