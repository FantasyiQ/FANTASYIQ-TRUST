// Re-export from the root auth.ts so both `@/lib/auth` (src code) and
// `./auth` (middleware) resolve to the same NextAuth instance.
export { handlers, auth, signIn, signOut } from '../../auth';

import { redirect } from 'next/navigation';
import { auth as getSession } from '../../auth';

/** Returns the authenticated user's id, redirecting to /sign-in if not logged in. */
export async function getCurrentUser(): Promise<{ id: string }> {
    const session = await getSession();
    if (!session?.user?.id) redirect('/sign-in');
    return { id: session.user.id };
}
