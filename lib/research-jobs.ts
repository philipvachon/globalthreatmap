// Shared in-memory store for deep research jobs.
// Works in self-hosted Node.js; module state persists across requests within
// the same process. Jobs are cleaned up after 1 hour to avoid leaks.

export interface ResearchJob {
  status: "running" | "completed" | "failed";
  output?: string;
  sources?: Array<{ title: string; url: string }>;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, ResearchJob>();

const ONE_HOUR = 60 * 60 * 1000;

function prune() {
  const cutoff = Date.now() - ONE_HOUR;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

export function createJob(id: string): void {
  prune();
  jobs.set(id, { status: "running", createdAt: Date.now() });
}

export function completeJob(
  id: string,
  output: string,
  sources: Array<{ title: string; url: string }>
): void {
  const job = jobs.get(id);
  if (job) {
    job.status = "completed";
    job.output = output;
    job.sources = sources;
  }
}

export function failJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (job) {
    job.status = "failed";
    job.error = error;
  }
}

export function getJob(id: string): ResearchJob | undefined {
  return jobs.get(id);
}
