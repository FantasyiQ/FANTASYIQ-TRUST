import * as esbuild from 'esbuild';
import { argv } from 'process';

const watch = argv.includes('--watch');

const shared = {
    bundle:   true,
    format:   'esm',
    target:   'chrome120',
    outdir:   'dist',
    logLevel: 'info',
};

if (watch) {
    const ctx = await esbuild.context({
        ...shared,
        entryPoints: ['src/background.ts'],
    });
    await ctx.watch();
    console.log('Watching for changes…');
} else {
    await esbuild.build({
        ...shared,
        entryPoints: ['src/background.ts'],
        minify: true,
    });
    console.log('Build complete → dist/');
}
