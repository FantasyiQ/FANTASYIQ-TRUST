'use server';

import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { signIn } from '@/lib/auth';
import { prisma } from '../../../lib/prisma';
import { notify } from '@/lib/notifications/service';
import { NotificationType } from '@/lib/notifications/types';
import { sendEmail } from '@/lib/notifications/email';
import { renderTemplate } from '@/lib/notifications/templates';

export type AuthActionState = { error: string } | null;

function safeRedirectTo(value: FormDataEntryValue | null): string {
    const str = typeof value === 'string' ? value.trim() : '';
    // Only allow relative paths (no open redirect)
    return str && str.startsWith('/') && !str.startsWith('//') ? str : '/dashboard';
}

export async function signUpAction(
    _prevState: AuthActionState,
    formData: FormData
): Promise<AuthActionState> {
    const name = (formData.get('name') as string)?.trim();
    const email = (formData.get('email') as string)?.trim().toLowerCase();
    const password = formData.get('password') as string;
    const redirectTo = safeRedirectTo(formData.get('redirectTo'));

    if (!name || !email || !password) {
        return { error: 'All fields are required.' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: 'Please enter a valid email address.' };
    }
    if (password.length < 8) {
        return { error: 'Password must be at least 8 characters.' };
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        return { error: 'An account with that email already exists.' };
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await prisma.user.create({
        data: { name, email, hashedPassword },
        select: { id: true },
    });

    // Fire welcome notification (non-blocking)
    notify({
        userId:  newUser.id,
        type:    NotificationType.ACCOUNT_WELCOME,
        title:   'Welcome to FantasyiQ Trust!',
        body:    'Your account is ready. Sync your league and set up dues in minutes.',
        inApp:   true,
        email:   true,
        throttleMs: 0,
    }).catch(() => {});

    // Send email verification (non-blocking)
    const verifyToken  = randomBytes(32).toString('hex');
    const expiresAt    = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const appUrl       = process.env.NEXTAUTH_URL ?? 'https://fantasyiq.app';
    const verifyUrl    = `${appUrl}/api/auth/verify-email?token=${verifyToken}`;

    prisma.emailVerificationToken.create({
        data: { userId: newUser.id, token: verifyToken, expiresAt },
    }).then(() => {
        const html = renderTemplate('account.email_verification', {
            title: 'Verify your FantasyiQ Trust email',
            body:  'Click below to verify your email address.',
            data:  { verifyUrl },
        });
        return sendEmail({ to: email, subject: 'Verify your FantasyiQ Trust email address', html });
    }).catch(() => {});

    // Auto sign-in after account creation — signIn throws a redirect internally.
    await signIn('credentials', { email, password, redirectTo });

    // Unreachable — signIn redirects. Satisfy the return type.
    return null;
}

export async function signInAction(
    _prevState: AuthActionState,
    formData: FormData
): Promise<AuthActionState> {
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
