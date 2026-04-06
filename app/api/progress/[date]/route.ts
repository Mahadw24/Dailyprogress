import { NextResponse } from "next/server";
import { deleteDay, getDay } from "@/lib/progress-store";

type Ctx = { params: Promise<{ date: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { date } = await ctx.params;
    const day = await getDay(date);
    if (!day) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(day);
  } catch {
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { date } = await ctx.params;
    const ok = await deleteDay(date);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
