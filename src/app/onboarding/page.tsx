import { redirect } from 'next/navigation';
import { auth }     from '@/lib/auth';
import { prisma }   from '@/lib/prisma';
import OnboardingWizard from './_OnboardingWizard';

export default async function OnboardingPage() {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where:  { id: session.user.id },
        select: { name: true, onboardingComplete: true },
    });

    // Already onboarded — send to dashboard
    if (user?.onboardingComplete) redirect('/dashboard');

    return <OnboardingWizard userName={user?.name ?? null} />;
}
