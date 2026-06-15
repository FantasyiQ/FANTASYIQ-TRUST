import type { Metadata } from 'next';
import SupportCenter from './SupportCenter';
import { FAQ_ITEMS } from '@/lib/support/faqs';

export const metadata: Metadata = {
    title: 'Support Center — FantasyiQ Trust',
    description: 'Find answers, learn how FantasyiQ Trust works, or chat with our assistant.',
};

const FAQ_JSONLD = {
    '@context':  'https://schema.org',
    '@type':     'FAQPage',
    mainEntity:  FAQ_ITEMS.slice(0, 20).map(faq => ({
        '@type':          'Question',
        name:             faq.question,
        acceptedAnswer: {
            '@type': 'Answer',
            text:    faq.answer.replace(/\n/g, ' '),
        },
    })),
};

export default function SupportPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }}
            />
            <SupportCenter />
        </>
    );
}
