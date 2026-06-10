'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { AuthError } from 'next-auth';
import { signIn } from '@/lib/auth';
import { checkMutationLimit } from '@/lib/ratelimit';

async function getIp(): Promise<string> {
    const h = await headers();
    return h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export type AuthActionState = { error: string } | null;

function safeRedirectTo(value: FormDataEntryValue | null): string {
    const str = typeof value === 'string' ? value.trim() : '';
    // Only allow relative paths (no open redirect)
    return str && str.startsWith('/') && !str.startsWith('//') ? str : '/dashboard';
}

export async function signUpAction(
    _prevState: AuthActionState,
    _formData: FormData
): Promise<AuthActionState> {
    return { error: 'Please sign up with Google.' };
}

export async function signInAction(
    _prevState: AuthActionState,
    formData: FormData
): Promise<AuthActionState> {
    const rl = await checkMutationLimit(await getIp());
    if (rl.limited) return { error: 'Too many attempts. Please wait a moment and try again.' };

    const email = (formData.get('email') as string)?.trim().toLowerCase();
    const password = formData.get('password') as string;
    const redirectTo = safeRedirectTo(formData.get('redirectTo'));

    if (!email || !password) {
        return { error: 'Email and password are required.' };
    }

    try {
        await signIn('credentials', { email, password, redirectTo });
    } catch (error) {
        if (error instanceof AuthError) {
            return { error: 'Invalid email or password.' };
        }
        // Re-throw redirect and other framework errors.
        throw error;
    }

    return null;
}

export async function signInWithGoogle(formData: FormData): Promise<never> {
    const redirectTo = safeRedirectTo(formData.get('redirectTo'));
    await signIn('google', { redirectTo });
    // signIn always redirects; redirect here satisfies the return type.
    redirect(redirectTo);
}
