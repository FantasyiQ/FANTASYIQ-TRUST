import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const staleNames = ['marvin harrison jr', 'dj moore'];
  for (const name of staleNames) {
    const result = await prisma.fantasyCalcValue.deleteMany({ where: { nameLower: name } });
    console.log(`Deleted "${name}": ${result.count} row(s)`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
