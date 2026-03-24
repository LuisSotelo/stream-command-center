// /app/api/brainrot/check-cooldown/route.ts
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function GET() {
  const ttl = await redis.ttl("brainrot_cooldown");
  
  // ttl devuelve -2 si no existe, o los segundos restantes si existe
  const remaining = ttl > 0 ? ttl : 0;
  
  return NextResponse.json({ remaining });
}