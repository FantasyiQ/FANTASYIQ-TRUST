import type { Metadata } from 'next';
import ResetPasswordForm from './ResetPasswordForm';

export const metadata: Metadata = {
    title: 'Reset Password — FantasyiQ',
    description: 'Set a new password for your FantasyiQ account.',
    robots: { index: false },
};

export default async function ResetPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>;
}) {
    const { token } = await searchParams;
    return <ResetPasswordForm token={token ?? ''} />;
}
