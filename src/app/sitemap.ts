import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const base = process.env.NEXTAUTH_URL ?? 'https://fantasyiqtrust.com';
    const now  = new Date();

    const [leagues, commissioners] = await Promise.all([
        prisma.lFLeague.findMany({
            select:  { id: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take:    500,
        }),
        prisma.lFCommissioner.findMany({
            select:  { id: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take:    200,
        }),
    ]);

    const staticRoutes: MetadataRoute.Sitemap = [
        { url: `${base}`,              lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
        { url: `${base}/pricing`,      lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${base}/leaguefinder`, lastModified: now, changeFrequency: 'daily',   priority: 0.8 },
        { url: `${base}/privacy`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
        { url: `${base}/terms`,        lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
        { url: `${base}/cookies`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
        { url: `${base}/support`,      lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    ];

    const leagueRoutes: MetadataRoute.Sitemap = leagues.map(l => ({
        url:             `${base}/leaguefinder/leagues/${l.id}`,
        lastModified:    l.createdAt,
        changeFrequency: 'weekly' as const,
        priority:        0.7,
    }));

    const commissionerRoutes: MetadataRoute.Sitemap = commissioners.map(c => ({
        url:             `${base}/leaguefinder/commissioners/${c.id}`,
        lastModified:    c.createdAt,
        changeFrequency: 'weekly' as const,
        priority:        0.6,
    }));

    return [...staticRoutes, ...leagueRoutes, ...commissionerRoutes];
}
