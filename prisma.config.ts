import { defineConfig } from 'prisma/config';

export default defineConfig({
    datasource: {
        // process.env doesn't throw when DATABASE_URL is absent (e.g. during
        // `prisma generate` at build time). env() from 'prisma/config' is strict
        // and would fail without the var present.
        url: process.env.DATABASE_URL,
    },
    schema: './prisma/schema.prisma',
    migrations: {
        path: './prisma/migrations',
    },
});
