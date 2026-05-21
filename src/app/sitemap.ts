import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
    const base = process.env.NEXTAUTH_URL ?? 'https://fantasyiq-trust.vercel.app';
    const now  = new Date();

    return [
        { url: `${base}`,              lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
        { url: `${base}/pricing`,      lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${base}/leaguefinder`, lastModified: now, changeFrequency: 'daily',   priority: 0.8 },
        { url: `${base}/privacy`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
        { url: `${base}/terms`,        lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
        { url: `${base}/cookies`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
        { url: `${base}/support`,      lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    ];
}
