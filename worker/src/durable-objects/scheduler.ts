import type { Env } from '../types/env';
import { getPostsDueForScrape } from '../db/queries';
import { groupIntoBatches } from '../services/scheduler';

const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export class SchedulerDO implements DurableObject {
  constructor(private state: DurableObjectState, private env: Env) {}

  // Called once at startup to ensure the alarm chain is running.
  // Idempotent — does nothing if alarm is already scheduled.
  async fetch(_request: Request): Promise<Response> {
    const current = await this.state.storage.getAlarm();
    if (current === null) {
      await this.state.storage.setAlarm(Date.now() + INTERVAL_MS);
      console.log('[SchedulerDO] initialized — first alarm set in 30 min');
    }
    return new Response('ok');
  }

  // Fires every 30 minutes. Scrape due posts then re-schedule.
  async alarm(): Promise<void> {
    console.log('[SchedulerDO] alarm fired — checking for due posts...');

    try {
      const posts = await getPostsDueForScrape(this.env.DB, 500);

      if (posts.length === 0) {
        console.log('[SchedulerDO] no posts due for scrape');
      } else {
        const batches = groupIntoBatches(posts);
        await Promise.all(batches.map(b => this.env.SCRAPE_QUEUE.send(b)));
        console.log(`[SchedulerDO] queued ${batches.length} batch(es) for ${posts.length} post(s)`);
      }
    } catch (err) {
      console.error('[SchedulerDO] alarm error:', err);
    }

    // Always re-schedule — keeps the chain alive even after errors
    await this.state.storage.setAlarm(Date.now() + INTERVAL_MS);
  }
}
