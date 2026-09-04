export interface FollowUpTask {
  caseId: string;
  dueAt: Date;
  verify: boolean;
  prompt?: string;
}

/**
 * In-process follow-up scheduler (demo). `scheduleFollowUp` in the ExecutionContext
 * pushes here; `run` fires anything due by messaging the parent. In live this is a
 * seam to swap for `Task.dueAt` queries + pg-boss/cron.
 */
export class Scheduler {
  private tasks: FollowUpTask[] = [];

  schedule(caseId: string, at: Date, verify: boolean, prompt?: string): void {
    this.tasks.push({ caseId, dueAt: at, verify, prompt });
  }

  /** Return + remove the follow-ups that are now due. */
  due(now: Date = new Date()): FollowUpTask[] {
    const due = this.tasks.filter((t) => t.dueAt <= now);
    this.tasks = this.tasks.filter((t) => t.dueAt > now);
    return due;
  }

  /** Fire due follow-ups: message the parent an update, or the verify prompt. */
  async run(now: Date, messageParent: (text: string) => Promise<void>): Promise<void> {
    for (const t of this.due(now)) {
      if (t.verify) {
        await messageParent(t.prompt ?? 'Any update on this?');
      } else {
        await messageParent('Quick follow-up — I\u2019m still on this and will chase the school. Anything new on your end?');
      }
    }
  }

  pendingCount(): number {
    return this.tasks.length;
  }
}
