import type { Metadata } from 'next';
import SignInForm from './SignInForm';

export const metadata: Metadata = {
    title: 'Sign In — FantasyIQ Trust',
    description: 'Sign in to your FantasyIQ Trust account.',
    robots: { index: false },
};

export default async function SignInPage({
    searchParams,
}: {
    searchParams: Promise<{ redirect?: string }>;
}) {
    const { redirect } = await searchParams;
    const redirectTo = redirect && redirect.startsWith('/') && !redirect.startsWith('//')
        ? redirect
        : '/dashboard';

    return <SignInForm redirect={redirectTo} />;
}
