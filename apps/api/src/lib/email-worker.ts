import { and, eq, lte, sql } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { emailOutbox } from "../db/schema/index.ts";

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;

/**
 * Queued email, drained by a timer.
 *
 * Sending inline would make every request that notifies someone wait on a mail
 * server, and a failure there would look like a failed task update. Queuing also
 * gives retries a place to live.
 *
 * No provider is configured in this build, so a claimed message is recorded as
 * sent and left in the outbox. Wiring a provider means replacing `deliver` and
 * nothing else.
 */
async function deliver(_message: {
  toEmail: string;
  subject: string;
  bodyText: string;
}): Promise<void> {
  if (!Bun.env.SMTP_URL) {
    // Deliberately a no-op rather than a failure: without a provider the queue
    // must not fill with retries that can never succeed.
    return;
  }

  throw new Error("Email delivery is not configured for this deployment");
}

export async function drainOutbox(db: Database): Promise<number> {
  const now = new Date();

  /**
   * Claim by update-then-select: `status = 'sending'` acts as the lock, so two
   * workers cannot both take the same message. Safe because the update is a
   * single statement.
   */
  const claimed = await db
    .update(emailOutbox)
    .set({ status: "sending", claimedAt: now })
    .where(
      sql`${emailOutbox.id} in (
        select id from ${emailOutbox}
        where ${emailOutbox.status} = 'pending'
          and ${emailOutbox.sendAfter} <= ${now}
          and ${emailOutbox.attempts} < ${MAX_ATTEMPTS}
        order by ${emailOutbox.sendAfter}
        limit ${BATCH_SIZE}
      )`,
    )
    .returning();

  for (const message of claimed) {
    try {
      await deliver(message);
      await db
        .update(emailOutbox)
        .set({ status: "sent", sentAt: new Date(), lastError: null })
        .where(eq(emailOutbox.id, message.id));
    } catch (error) {
      const attempts = message.attempts + 1;
      const retryDelayMs = Math.min(60 * 60 * 1000, 2 ** attempts * 30_000);

      await db
        .update(emailOutbox)
        .set({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          lastError: error instanceof Error ? error.message : String(error),
          sendAfter: new Date(Date.now() + retryDelayMs),
        })
        .where(eq(emailOutbox.id, message.id));
    }
  }

  return claimed.length;
}

/**
 * Messages stuck in `sending` mean a worker died mid-send. Handing them back
 * after ten minutes is better than losing them.
 */
export async function reclaimStuckMessages(db: Database): Promise<void> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);

  await db
    .update(emailOutbox)
    .set({ status: "pending" })
    .where(and(eq(emailOutbox.status, "sending"), lte(emailOutbox.claimedAt, cutoff)));
}

export function startEmailWorker(db: Database, intervalMs = 30_000): () => void {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await reclaimStuckMessages(db);
      await drainOutbox(db);
    } catch (error) {
      console.error("[email] outbox drain failed", error);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);

  return () => clearInterval(timer);
}

export { MAX_ATTEMPTS, BATCH_SIZE };


