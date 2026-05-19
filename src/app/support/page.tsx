import type { Metadata } from 'next';
import SupportCenter from './SupportCenter';

export const metadata: Metadata = {
    title: 'Support Center — FantasyiQ Trust',
    description: 'Find answers, learn how FantasyiQ Trust works, or chat with our assistant.',
};

export default function SupportPage() {
    return <SupportCenter />;
}
