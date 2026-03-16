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

    const { message, admin } = await req.json();

    if (!message || message.trim() === "") {
      return NextResponse.json({ error: "Message is empty" }, { status: 400 });
    }

    const cleanMessage = message.trim();
    const adminName = admin || session.user?.name || "Unknown Mod";
    const logEntry = {
    admin: adminName,
    action: `JOAQUIN_SAYS: ${cleanMessage}`,
    timestamp: new Date().toISOString(),
    };

    // 1. Disparar a Twitch vía Pusher
    await pusherServer.trigger("auction-channel", "joaquin-says", {
      message: cleanMessage,
      admin: adminName,
      timestamp: new Date().toISOString(),
    });

    // 2. REGISTRAR EN LOGS (Para que aparezca en el Dashboard)
    // Esto hace que la acción de "Hacer hablar a Joaquín" aparezca en tu historial de actividad
    await pusherServer.trigger("auction-channel", "admin-log-update", {
      admin: adminName,
      action: `JOAQUIN_SAYS: "${cleanMessage.substring(0, 20)}..."`,
      amount: 0, // No descuenta dinero, pero es una acción de admin
      timestamp: new Date().toISOString(),
    });

    // 3. (Opcional) Guardar en DB persistente si la tienes configurada
    await redis.lpush("admin_logs", JSON.stringify(logEntry));
    await redis.ltrim("admin_logs", 0, 9);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en joaquin-speak API:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}