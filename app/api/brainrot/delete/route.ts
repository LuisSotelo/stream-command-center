import { redis } from "@/lib/redis";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { videoUrl } = await req.json();
  await redis.lrem("brainrot_playlist", 0, videoUrl);
  return NextResponse.json({ success: true });
}