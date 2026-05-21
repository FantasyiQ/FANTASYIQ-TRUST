import type { Metadata } from 'next';
import ForgotPasswordForm from './ForgotPasswordForm';

export const metadata: Metadata = {
    title: 'Forgot Password — FantasyiQ',
    description: 'Reset your FantasyiQ password.',
    robots: { index: false },
};

export default function ForgotPasswordPage() {
    return <ForgotPasswordForm />;
}
