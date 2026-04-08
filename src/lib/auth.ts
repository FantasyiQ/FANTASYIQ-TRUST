// Re-export from the root auth.ts so both `@/lib/auth` (src code) and
// `./auth` (middleware) resolve to the same NextAuth instance.
export { handlers, auth, signIn, signOut } from '../../auth';
