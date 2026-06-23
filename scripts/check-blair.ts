import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });
async function main() {
    const user = await prisma.user.findFirst({
        where: { name: { contains: 'Blair', mode: 'insensitive' } },
        select: { id: true, name: true, email: true, sleeperUserId: true }
    });
    if (!user) { console.log('No Blair found'); return; }
    console.log('User:', JSON.stringify(user));

    const leagues = await prisma.league.findMany({
        where: { userId: user.id },
        select: { id: true, leagueName: true, leagueId: true, season: true, status: true, assignedPlanId: true, assignedPlanType: true, isHistorical: true, sleeperUserId: true }
    });
    console.log('Leagues:', JSON.stringify(leagues, null, 2));

    const exclusions = await prisma.syncExclusion.findMany({ where: { userId: user.id } });
    console.log('SyncExclusions:', JSON.stringify(exclusions, null, 2));

    const subs = await prisma.subscription.findMany({
        where: { userId: user.id },
        select: { id: true, type: true, tier: true, leagueName: true, status: true, stripeSubscriptionId: true }
    });
    console.log('All subscriptions:', JSON.stringify(subs, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
