// Re-export from the root lib so src/ code can import via @/lib/prisma.
// The PrismaClient singleton lives on globalThis, so both module paths
// share the same instance.
export { prisma } from '../../lib/prisma';
