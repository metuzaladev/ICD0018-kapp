import { LANGUAGES, translate, type Language, type LegalBlock, type LegalInline } from '@kapp/shared';

import { escapeHtml } from '../mail/mail-templates';

/**
 * Public HTML for the legal texts and the "email confirmed" page (M10, docs/17). These URLs go into
 * App Store Connect and Play Console, so they must work in any browser: one self-contained page,
 * no external assets, readable at 200 % zoom, light and dark, real headings and `lang`.
 */

/** Public page Better Auth redirects to after the email confirmation link (auth.ts). */
export const EMAIL_VERIFIED_PATH = '/email-verified';

const LANGUAGE_NAMES: Record<Language, string> = { et: 'Eesti', en: 'English', ru: 'Русский' };

const STYLE = `
:root{color-scheme:light dark;--bg:#F7F8FA;--fg:#14181F;--muted:#4B5563;--link:#2E7D4F;--rule:#E5E7EB}
@media (prefers-color-scheme:dark){:root{--bg:#0F1419;--fg:#F2F4F7;--muted:#AEB6C2;--link:#7FD1A0;--rule:#2A313B}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:1rem/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:46rem;margin:0 auto;padding:2rem 1.25rem 4rem}
.brand{font-weight:800;font-size:1.75rem;color:var(--link);margin:0 0 1rem;letter-spacing:-.02em}
h1{font-size:1.75rem;line-height:1.25;margin:0 0 1rem}
h2{font-size:1.25rem;margin:2rem 0 .5rem}
h3{font-size:1.05rem;margin:1.5rem 0 .5rem}
a{color:var(--link)}
a:focus-visible{outline:3px solid var(--link);outline-offset:2px}
ul{padding-left:1.25rem}
li{margin:.25rem 0}
nav{border-bottom:1px solid var(--rule);padding-bottom:.75rem;margin-bottom:1.5rem;color:var(--muted);font-size:.95rem}
nav a{margin-right:.75rem}
`;

function inline(content: LegalInline[]): string {
  return content
    .map((c) => {
      const text = escapeHtml(c.text);
      const bold = c.bold ? `<strong>${text}</strong>` : text;
      return c.href ? `<a href="${escapeHtml(c.href)}">${bold}</a>` : bold;
    })
    .join('');
}

export function renderBlocks(blocks: LegalBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === 'heading') return `<h${b.level}>${inline(b.content)}</h${b.level}>`;
      if (b.type === 'paragraph') return `<p>${inline(b.content)}</p>`;
      return `<ul>${b.items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`;
    })
    .join('\n');
}

export function htmlPage({ language, title, body, path }: { language: Language; title: string; body: string; path: string }): string {
  const others = LANGUAGES.filter((l) => l !== language)
    .map((l) => `<a href="${escapeHtml(`${path}?lang=${l}`)}" hreflang="${l}" lang="${l}">${LANGUAGE_NAMES[l]}</a>`)
    .join('');
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<p class="brand" aria-hidden="true">käpp</p>
<nav aria-label="${escapeHtml(translate(language, 'pages.otherLanguages'))}">${others}</nav>
${body}
</main>
</body>
</html>`;
}
