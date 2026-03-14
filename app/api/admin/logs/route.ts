import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function GET() {
  try {
    // Leemos la lista "admin_logs" de Redis
    const rawLogs = await redis.lrange("admin_logs", 0, 19);
    
    // Parseamos los strings JSON a objetos de JS
    const logs = rawLogs.map((log) => 
      typeof log === "string" ? JSON.parse(log) : log
    );

    return NextResponse.json({ success: true, logs });
  } catch (error) {
    console.error("Error fetching logs:", error);
    return NextResponse.json({ success: false, logs: [] }, { status: 500 });
  }
}