/**
 * Course-demo moderation for place posts (there is no admin UI yet, docs/16-avasta-ja-kapad.md):
 *
 *   npm run moderate:post -w @kapp/api -- <postId> approve|reject
 *   npm run moderate:post -w @kapp/api -- --pending          (lists posts waiting for a decision)
 *
 * Runs the same service as the API, so approving awards the author's Käpad (+15) and sends the
 * "your recommendation is live" notification (feed row + push via the BullMQ queue in REDIS_URL).
 * A post is moderated once: running it again changes nothing and pays nothing.
 */
import { desc, eq } from 'drizzle-orm';

import { env } from '../config/env';
import { createPushQueue } from '../modules/notifications/push-queue';
import { createServices, createStorageFromEnv } from '../services';
import { db, pool } from './client';
import { placePosts } from './schema';

const [first, decision] = process.argv.slice(2);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main(): Promise<number> {
  if (first === '--pending') {
    const rows = await db
      .select({ id: placePosts.id, name: placePosts.name, category: placePosts.category, createdAt: placePosts.createdAt })
      .from(placePosts)
      .where(eq(placePosts.status, 'pending'))
      .orderBy(desc(placePosts.createdAt))
      .limit(50);
    for (const r of rows) console.log(`${r.id}  ${r.category.padEnd(6)}  ${r.createdAt.toISOString()}  ${r.name}`);
    console.log(`${rows.length} pending post(s)`);
    return 0;
  }
  if (!first || !UUID.test(first) || (decision !== 'approve' && decision !== 'reject')) {
    console.error('Usage: npm run moderate:post -w @kapp/api -- <postId> approve|reject   (or --pending)');
    return 2;
  }
  const pushQueue = createPushQueue({ url: env.REDIS_URL, prefix: env.PUSH_QUEUE_PREFIX });
  try {
    const { placePostsService } = createServices(db, createStorageFromEnv(env), env.SERVICE_TIMEOUT_MS, { pushQueue, log: console });
    const result = await placePostsService.moderate(first, decision);
    console.log(result.changed ? `Post ${first} is now ${result.status}` : `Post ${first} was already ${result.status}; nothing changed`);
    return 0;
  } finally {
    await pushQueue.close();
  }
}

let code = 1;
try {
  code = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  await pool.end();
}
process.exit(code);
