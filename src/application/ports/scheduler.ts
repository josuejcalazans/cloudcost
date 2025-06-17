export interface ScheduledTask {
  stop(): void;
}

export interface SchedulerPort {
  schedule(
    expression: string,
    timezone: string,
    task: () => void | Promise<void>,
  ): ScheduledTask;
}
