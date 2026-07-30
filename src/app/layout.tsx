import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SessionProvider from '@/components/SessionProvider';
import { SupportContextProvider } from '@/lib/support/SupportContextStore';
import SupportAssistantLauncher from '@/components/support/SupportAssistantLauncher';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://fantasyiqtrust.com'),
  title: 'FantasyiQ Trust — Your League Dues. Protected.',
  description: 'The fantasy football platform that never touches your money. Zero fees. Zero skimming. Total trust.',
  appleWebApp: {
    title: 'FiQ',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#030712',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className + ' bg-gray-950'}>
        <SessionProvider>
          <SupportContextProvider>
            <a href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:bg-[#D4AF37] focus:text-gray-950 focus:font-bold focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm">
              Skip to main content
            </a>
            <Navbar />
            <div id="main-content" className="pt-24">{children}</div>
            <Footer />
            <SupportAssistantLauncher />
            <ServiceWorkerRegistration />
          </SupportContextProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
