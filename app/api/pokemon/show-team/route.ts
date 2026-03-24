import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";

export async function POST() {
  await pusherServer.trigger("game-channel", "show-team-overlay", {
    duration: 10000 // 10 segundos visibles
  });
  return NextResponse.json({ success: true });
}