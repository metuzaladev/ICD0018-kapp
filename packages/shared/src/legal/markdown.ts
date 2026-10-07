/**
 * A deliberately tiny Markdown subset for the legal texts (privacy policy, terms), parsed into
 * blocks that the API renders as HTML (`GET /legal/*`) and the app renders with native Text.
 *
 * Why not a Markdown library: the texts are ours, the subset is small (headings, paragraphs,
 * bullet lists, **bold**, [links](https://…)), and one shared parser guarantees that the store URL
 * and the in-app screen show exactly the same content. Raw HTML is never interpreted — it stays
 * text, and the HTML renderer escapes everything.
 *
 * Supported:
 * - `# `, `## `, `### ` headings
 * - paragraphs (consecutive lines are joined with a space; a blank line ends the paragraph)
 * - `- ` bullet lists (one item per line)
 * - inline `**bold**` and `[text](https://… | mailto:…)`; other link targets stay plain text
 */

export interface LegalInline {
  text: string;
  bold?: boolean;
  /** Only http(s) and mailto links are kept. */
  href?: string;
}

export type LegalBlock =
  | { type: 'heading'; level: 1 | 2 | 3; content: LegalInline[] }
  | { type: 'paragraph'; content: LegalInline[] }
  | { type: 'list'; items: LegalInline[][] };

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): LegalInline[] {
  const out: LegalInline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ text: text.slice(last, index) });
    if (match[1] !== undefined) out.push({ text: match[1], bold: true });
    else if (match[2] !== undefined && match[3] !== undefined) {
      out.push(SAFE_LINK.test(match[3]) ? { text: match[2], href: match[3] } : { text: match[2] });
    }
    last = index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function parseLegalMarkdown(markdown: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', content: parseInline(paragraph.join(' ')) });
    if (list.length > 0) blocks.push({ type: 'list', items: list.map(parseInline) });
    paragraph = [];
    list = [];
  };

  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '') {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1]!.length as 1 | 2 | 3, content: parseInline(heading[2]!) });
      continue;
    }
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item) {
      if (paragraph.length > 0) flush();
      list.push(item[1]!);
      continue;
    }
    if (list.length > 0) flush();
    paragraph.push(line);
  }
  flush();
  return blocks;
}

/** Plain text of inline content (accessibility labels, tests). */
export function inlineText(content: LegalInline[]): string {
  return content.map((c) => c.text).join('');
}
