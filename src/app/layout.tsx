import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Staff Roster Dashboard',
  description: 'Manage staff rosters, users, and roles',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
