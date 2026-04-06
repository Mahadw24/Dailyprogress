import { NextResponse } from "next/server";
import { readAllLogs, upsertDay } from "@/lib/progress-store";

export async function GET() {
  try {
    const logs = await readAllLogs();
    return NextResponse.json(logs);
  } catch {
    return NextResponse.json(
      { error: "Failed to read progress" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      date?: string;
      gym?: string;
      learning?: string;
    };
    if (typeof body.date !== "string") {
      return NextResponse.json({ error: "date is required" }, { status: 400 });
    }
    const day = await upsertDay({
      date: body.date,
      gym: typeof body.gym === "string" ? body.gym : "",
      learning: typeof body.learning === "string" ? body.learning : "",
    });
    return NextResponse.json(day);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save";
    const status = message === "Invalid date" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
