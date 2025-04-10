import { describe, expect, it, vi } from 'vitest';
import { NodeCronScheduler } from '../../src/infrastructure/scheduler/node-cron-scheduler.ts';

interface ScheduledJob {
  expression: string;
  fn: () => unknown;
  options: { timezone?: string } | undefined;
  stopped: boolean;
}

function fakeCron() {
  const jobs: ScheduledJob[] = [];
  const cron = {
    schedule: (
      expression: string,
      fn: () => unknown,
      options?: { timezone?: string },
    ) => {
      const job: ScheduledJob = { expression, fn, options, stopped: false };
      jobs.push(job);
      return {
        stop: () => {
          job.stopped = true;
        },
      };
    },
  };
  return { cron, jobs };
}

describe('NodeCronScheduler', () => {
  it('registers the cron expression and timezone', () => {
    const { cron, jobs } = fakeCron();
    const scheduler = new NodeCronScheduler(cron);

    scheduler.schedule('0 7 * * 1', 'America/Sao_Paulo', () => undefined);

    expect(jobs[0]?.expression).toBe('0 7 * * 1');
    expect(jobs[0]?.options?.timezone).toBe('America/Sao_Paulo');
  });

  it('invokes the scheduled task when the cron fires', () => {
    const { cron, jobs } = fakeCron();
    const scheduler = new NodeCronScheduler(cron);
    const task = vi.fn();

    scheduler.schedule('0 7 * * 1', 'UTC', task);
    void jobs[0]?.fn();

    expect(task).toHaveBeenCalledTimes(1);
  });

  it('returns a handle that stops the underlying job', () => {
    const { cron, jobs } = fakeCron();
    const scheduler = new NodeCronScheduler(cron);

    const handle = scheduler.schedule('0 7 * * 1', 'UTC', () => undefined);
    handle.stop();

    expect(jobs[0]?.stopped).toBe(true);
  });

  it('contains task failures so the scheduler keeps running', async () => {
    const { cron, jobs } = fakeCron();
    const scheduler = new NodeCronScheduler(cron);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    scheduler.schedule('0 7 * * 1', 'UTC', () =>
      Promise.reject(new Error('smtp down')),
    );
    await jobs[0]?.fn();

    expect(spy).toHaveBeenCalledWith(
      '[cloudcost] scheduled report failed:',
      expect.any(Error),
    );
    spy.mockRestore();
  });
});
