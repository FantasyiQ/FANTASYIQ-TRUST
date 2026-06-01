import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import NotificationsPage from '@/components/notifications/NotificationsPage';

export const metadata = {
  title: 'Notifications — FantasyiQ Trust',
};

export default async function NotificationsRoute() {
  const session = await auth();
  if (!session?.user) redirect('/sign-in');

  return (
    <main className="min-h-screen bg-gray-950 pt-20 pb-16">
      <NotificationsPage />
    </main>
  );
}
