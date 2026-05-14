import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const allRows = await prisma.fantasyCalcValue.findMany({
    select: { nameLower: true, dynastyValue: true },
    orderBy: { dynastyValue: 'desc' },
  });

  const allNames = new Map(allRows.map(r => [r.nameLower, r]));

  const conflicts: { canonical: string; canonicalDynasty: number; staleName: string; staleDynasty: number }[] = [];
  for (const r of allRows) {
    if (!r.nameLower.includes('.')) continue;
    const deDotted = r.nameLower.replace(/\./g, '').replace(/\s+/g, ' ').trim();
    if (deDotted !== r.nameLower && allNames.has(deDotted)) {
      const stale = allNames.get(deDotted)!;
      conflicts.push({
        canonical: r.nameLower,
        canonicalDynasty: r.dynastyValue,
        staleName: deDotted,
        staleDynasty: stale.dynastyValue,
      });
    }
  }

  if (conflicts.length === 0) {
    console.log('No duplicate name conflicts found.');
  } else {
    console.log(JSON.stringify(conflicts, null, 2));
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
