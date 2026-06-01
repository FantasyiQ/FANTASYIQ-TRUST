import type { Metadata } from 'next';
import ForgotPasswordForm from './ForgotPasswordForm';

export const metadata: Metadata = {
    title: 'Forgot Password — FantasyiQ Trust',
    description: 'Reset your FantasyiQ Trust password.',
    robots: { index: false },
};

export default function ForgotPasswordPage() {
    return <ForgotPasswordForm />;
}
