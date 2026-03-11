"use client";
import { useEffect, useState } from "react";
import { pusherClient } from "@/lib/pusher"; // Asegúrate de tener el cliente configurado
import { AnimatedPrice } from "./AnimatedPrice";

export function AuctionInteractive() {
  const [price, setPrice] = useState<number>(1200);

  useEffect(() => {
    fetch("/api/price")
      .then((res) => res.json())
      .then((data) => setPrice(data.price));

    const channel = pusherClient.subscribe("stream-channel");
    
    channel.bind("price-updated", (data: { newPrice: number }) => {
      setPrice(data.newPrice);
      console.log("¡El precio bajó!", data.newPrice);
    });

    return () => {
      pusherClient.unsubscribe("stream-channel");
    };
  }, []);

  // No renderizamos nada hasta tener el precio real de Redis
  if (price === null) return <div className="min-h-screen bg-[#0a0a0a]" />;

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4">
      <h1 className="text-brand-cyan text-sm tracking-[0.3em] mb-4">REVERSE_AUCTION_ACTIVE</h1>
      <AnimatedPrice price={price} />

      <p className="mt-8 text-gray-400 text-center max-w-md">
        Cada Suscripción o Bits en Twitch baja el precio en tiempo real.
      </p>
    </main>
  );
}