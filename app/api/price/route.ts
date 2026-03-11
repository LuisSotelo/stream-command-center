import { NextResponse } from "next/server";
import { redis } from "@/lib/redis"; // Nuestra conexión a Redis
import { pusherServer } from "@/lib/pusher"; // Usaremos el server de Pusher para avisar a todos

export async function GET() {
  const price = await redis.get("current_price") || 1200; // Precio inicial por defecto
  return NextResponse.json({ price });
}

export async function POST(req: Request) {
  const { amount } = await req.json(); // Cantidad a restar: 30 o 15
  
  // 1. Obtener precio actual y restar
  const currentPrice: number = await redis.get("current_price") || 1200;
  const newPrice = Math.max(0, currentPrice - amount); // Que no baje de 0
  
  // 2. Guardar en Redis
  await redis.set("current_price", newPrice);
  
  // 3. ¡MAGIA! Avisar a Pusher para que todas las pantallas se actualicen
  await pusherServer.trigger("stream-channel", "price-updated", {
    newPrice: newPrice
  });

  return NextResponse.json({ success: true, newPrice });
}