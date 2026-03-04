import { NextResponse } from "next/server";
import { deepResearch } from "@/lib/valyu";
import { createJob, completeJob, failJob } from "@/lib/research-jobs";

export const dynamic = "force-dynamic";

// POST - Start a deep research task (runs async, returns taskId for polling)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { topic } = body;

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

    const taskId = `research_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    createJob(taskId);

    // Run research in background (no await) — result stored in job store
    deepResearch(topic)
      .then((result) => completeJob(taskId, result.summary, result.sources))
      .catch((err) =>
        failJob(taskId, err instanceof Error ? err.message : "Research failed")
      );

    return NextResponse.json({ taskId, status: "queued" });
  } catch (error) {
    console.error("Error starting deep research task:", error);
    return NextResponse.json(
      { error: "Failed to start research task" },
      { status: 500 }
    );
  }
}
