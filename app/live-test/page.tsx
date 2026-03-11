"use client";
import { useState, useEffect } from "react";
import { pusherClient } from "@/lib/pusher";
// 1. IMPORTA EL COMPONENTE (Revisa que la ruta sea correcta)
import { AnimatedPrice } from "../components/AnimatedPrice"; 

export default function LandingPage() {
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

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4">
      <h1 className="text-brand-cyan text-sm tracking-[0.3em] mb-4">REVERSE_AUCTION_ACTIVE</h1>
      
      {/* 2. REEMPLAZA EL DIV VIEJO POR EL COMPONENTE ANIMADO */}
      <AnimatedPrice price={price} />

      <p className="mt-8 text-gray-400 text-center max-w-md">
        Cada Suscripción o Bits en Twitch baja el precio en tiempo real.
      </p>
    </main>
  );
}