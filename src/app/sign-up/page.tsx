import SignUpForm from './SignUpForm';

export default async function SignUpPage({
    searchParams,
}: {
    searchParams: Promise<{ redirect?: string }>;
}) {
    const { redirect } = await searchParams;
    const redirectTo = redirect && redirect.startsWith('/') && !redirect.startsWith('//')
        ? redirect
        : '/dashboard';

    return <SignUpForm redirect={redirectTo} />;
}
