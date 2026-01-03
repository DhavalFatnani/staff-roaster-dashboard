import DashboardLayout from '@/components/DashboardLayout';
import { TestEnvironmentProvider } from '@/hooks/useTestEnvironment';
import TestModeBanner from '@/components/TestModeBanner';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <TestEnvironmentProvider>
      <TestModeBanner />
      <DashboardLayout>{children}</DashboardLayout>
    </TestEnvironmentProvider>
  );
}
