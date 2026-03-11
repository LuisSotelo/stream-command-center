"use client";
import { useEffect, useState } from "react";
import { pusherClient } from "@/lib/pusher"; // Asegúrate de tener el cliente configurado
import { AnimatedPrice } from "./AnimatedPrice";

export function AuctionInteractive() {
  const [price, setPrice] = useState<number | null>(null); // Empezamos en null para saber que está cargando

  useEffect(() => {
    // 1. Carga inicial silenciosa
    fetch("/api/price")
      .then((res) => res.json())
      .then((data) => setPrice(data.price));

    const channel = pusherClient.subscribe("stream-channel");
    
    channel.bind("price-updated", (data: { newPrice: number }) => {
      setPrice(data.newPrice);
    });

    return () => { pusherClient.unsubscribe("stream-channel"); };
  }, []);

  // No renderizamos nada hasta tener el precio real de Redis
  if (price === null) return <div className="min-h-screen bg-[#0a0a0a]" />;

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4">
      <AnimatedPrice price={price} />
    </main>
  );
}