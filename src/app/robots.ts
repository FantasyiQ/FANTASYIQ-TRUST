import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const base = process.env.NEXTAUTH_URL ?? 'https://fantasyiqtrust.com';
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/admin/',
                    '/api/',
                    '/dashboard/',
                    '/sign-in',
                    '/sign-up',
                    '/forgot-password',
                    '/reset-password',
                    '/checkout/',
                    '/invite/',
                ],
            },
        ],
        sitemap: `${base}/sitemap.xml`,
    };
}
