// scripts/kill-orphan-next.js
import { execSync } from 'child_process';

try {
    const output = execSync('lsof -i :3000 -t || true').toString().trim();
    if (output) {
        console.log('Killing orphan Next.js process(es):', output);
        execSync(`kill -9 ${output}`);
    }
} catch {
    // No orphan processes — nothing to do
}
