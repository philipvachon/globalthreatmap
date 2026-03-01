import { NextResponse } from "next/server";
import { getJob } from "@/lib/research-jobs";

export const dynamic = "force-dynamic";

// GET - Poll status of a deep research task
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;

    if (!taskId) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
    }

    const job = getJob(taskId);

    if (!job) {
      return NextResponse.json(
        { taskId, status: "not_found", error: "Task not found or expired" },
        { status: 404 }
      );
    }

    const response: Record<string, unknown> = { taskId, status: job.status };

    if (job.status === "completed") {
      response.output = job.output;
      response.sources = job.sources;
    }

    if (job.status === "failed") {
      response.error = job.error;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error checking deep research status:", error);
    return NextResponse.json(
      { error: "Failed to check task status" },
      { status: 500 }
    );
  }
}
