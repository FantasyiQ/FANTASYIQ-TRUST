import SignInForm from './SignInForm';

export default async function SignInPage({
    searchParams,
}: {
    searchParams: Promise<{ redirect?: string }>;
}) {
    const { redirect } = await searchParams;
    const redirectTo = redirect && redirect.startsWith('/') && !redirect.startsWith('//')
        ? redirect
        : '/dashboard';

    return <SignInForm redirect={redirectTo} />;
}
