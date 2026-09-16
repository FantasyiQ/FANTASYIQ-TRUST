'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// This layout persists across every tab of a league (overview, rankings,
// roster, dues, ...) and across switching from one league to another via
// LeagueSwitcher — Next.js only auto-resets scroll when a layout instance is
// newly mounted, not when it's reused with a new [id]/leaf segment. Without
// this, opening a league (or switching leagues) after scrolling down on the
// previous page lands you mid-page instead of at the top.
export default function ScrollToTopOnNavigate() {
    const pathname = usePathname();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    return null;
}
