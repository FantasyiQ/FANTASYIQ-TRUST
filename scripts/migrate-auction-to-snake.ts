import { prisma } from '../lib/prisma';

async function main() {
    const result = await prisma.league.updateMany({
        where: { draftType: 'auction' },
        data:  { draftType: 'snake' },
    });
    console.log(`Migrated ${result.count} auction leagues → snake`);
    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
