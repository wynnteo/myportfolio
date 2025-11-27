import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '@/app/globals.css';
import Footer from '@/components/layout/Footer';
import Navbar from '@/components/layout/Navbar';

export const metadata: Metadata = {
  title: 'My Portfolio',
  description: 'A portfolio starter built with Next.js and Tailwind CSS.',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900">
        <Navbar />
        <main className="container py-12">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
