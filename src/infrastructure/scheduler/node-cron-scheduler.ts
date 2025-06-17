import nodeCron from 'node-cron';
import type {
  ScheduledTask,
  SchedulerPort,
} from '../../application/ports/scheduler.ts';

export interface CronLike {
  schedule(
    expression: string,
    fn: () => unknown,
    options?: { timezone?: string },
  ): { stop(): void };
}

/**
 * node-cron adapter. Task failures are caught and logged so a transient
 * SMTP/API outage never kills the scheduler process.
 */
export class NodeCronScheduler implements SchedulerPort {
  private readonly cron: CronLike;

  constructor(cron: CronLike = nodeCron as unknown as CronLike) {
    this.cron = cron;
  }

  schedule(
    expression: string,
    timezone: string,
    task: () => void | Promise<void>,
  ): ScheduledTask {
    const job = this.cron.schedule(
      expression,
      () => {
        try {
          return Promise.resolve(task()).catch((error: unknown) => {
            console.error('[cloudcost] scheduled report failed:', error);
          });
        } catch (error) {
          console.error('[cloudcost] scheduled report failed:', error);
          return Promise.resolve();
        }
      },
      { timezone },
    );
    return { stop: () => job.stop() };
  }
}
