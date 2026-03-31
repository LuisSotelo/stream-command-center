import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import Pusher from "pusher";
import { redis } from "@/lib/redis";

export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const rawMessage = body.message;
    const admin = body.admin;

    if (typeof rawMessage !== "string" || rawMessage.trim() === "") {
      return NextResponse.json({ error: "Message is empty" }, { status: 400 });
    }

    const cleanMessage = rawMessage.trim();
    const adminName = admin || session.user?.name || "Unknown Mod";
    const nowIso = new Date().toISOString();

    const logEntry = {
      admin: adminName,
      action: `JOAQUIN_SAYS: ${cleanMessage}`,
      timestamp: nowIso,
    };

    // 1. Disparar el mensaje para que AdminPage lo traduzca a Twitch vía TMI
    await pusherServer.trigger("auction-channel", "joaquin-says", {
      message: cleanMessage,
      admin: adminName,
      timestamp: nowIso,
    });

    // 2. Reflejarlo de inmediato en el dashboard
    await pusherServer.trigger("auction-channel", "admin-log-update", {
      admin: adminName,
      action: `JOAQUIN_SAYS: "${cleanMessage.substring(0, 20)}..."`,
      amount: 0,
      timestamp: nowIso,
    });

    // 3. Persistir log
    await redis.lpush("admin_logs", JSON.stringify(logEntry));
    await redis.ltrim("admin_logs", 0, 9);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en joaquin-speak API:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}