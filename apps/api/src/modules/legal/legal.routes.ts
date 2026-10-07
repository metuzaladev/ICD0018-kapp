import { inlineText, LEGAL_DOCUMENTS, legalBlocks, legalPageQuerySchema, translate, type Language } from '@kapp/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { requestLanguage } from '../../http/language';
import { parseRequest } from '../../http/validate';
import { escapeHtml } from '../mail/mail-templates';
import { EMAIL_VERIFIED_PATH, htmlPage, renderBlocks } from './legal-html';

/**
 * Public, unauthenticated pages (M10, docs/17), outside /api/v1 like /health because they are
 * links for people and stores, not API resources:
 *   GET /legal/privacy, GET /legal/terms — the privacy policy and terms (App Store Connect / Play URL)
 *   GET /email-verified                  — where the email confirmation link lands
 * The app shows the same texts natively from packages/shared, so both always agree.
 */
export const legalRoutes: FastifyPluginAsync = async (app) => {
  const languageOf = (request: FastifyRequest): Language => {
    const query = parseRequest(legalPageQuerySchema, request.query, 'query');
    return query.lang ?? requestLanguage(request);
  };

  for (const document of LEGAL_DOCUMENTS) {
    const path = `/legal/${document}`;
    app.get(path, async (request, reply) => {
      const language = languageOf(request);
      const blocks = legalBlocks(document, language);
      const first = blocks[0];
      const title = first?.type === 'heading' ? inlineText(first.content) : 'Käpp';
      reply.header('content-type', 'text/html; charset=utf-8');
      // Versioned texts change rarely; an hour of caching keeps store reviewers' clicks cheap.
      reply.header('cache-control', 'public, max-age=3600');
      reply.header('content-language', language);
      return htmlPage({ language, title, body: renderBlocks(blocks), path });
    });
  }

  app.get(EMAIL_VERIFIED_PATH, async (request, reply) => {
    const query = parseRequest(legalPageQuerySchema, request.query, 'query');
    const language = query.lang ?? requestLanguage(request);
    const failed = query.error !== undefined;
    const title = translate(language, failed ? 'pages.emailVerifyFailed.title' : 'pages.emailVerified.title');
    const body = translate(language, failed ? 'pages.emailVerifyFailed.body' : 'pages.emailVerified.body');
    reply.header('content-type', 'text/html; charset=utf-8');
    reply.header('cache-control', 'no-store');
    return htmlPage({
      language,
      title,
      path: EMAIL_VERIFIED_PATH,
      body: `<h1>${escapeHtml(title)}</h1>\n<p role="status">${escapeHtml(body)}</p>`,
    });
  });
};
