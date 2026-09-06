import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Static hosts serve files by path, so a client-side route like /login has
// no file behind it and comes back 404 on a direct visit or a refresh --
// the app never even loads to route it. The usual fix is a host-level
// "rewrite everything to /index.html" rule, but that lives in the Render
// dashboard, outside this repo, and was missing (every route except /
// returned 404 in production).
//
// Copying index.html to 404.html makes the fix part of the build instead:
// static hosts (Render included) serve 404.html for unmatched paths, so
// the SPA shell loads and Angular routes to the right page on its own.
// The dashboard rewrite rule is still worth adding -- it makes these
// respond 200 instead of 404 -- but this way deep links work without it.
const outDir = join(process.cwd(), 'dist', 'web', 'browser');
const index = join(outDir, 'index.html');
const fallback = join(outDir, '404.html');

if (!existsSync(index)) {
  console.error(`spa-fallback: expected ${index} to exist after the build -- did the output path change?`);
  process.exit(1);
}

copyFileSync(index, fallback);
console.log('spa-fallback: wrote 404.html (SPA deep-link fallback)');
