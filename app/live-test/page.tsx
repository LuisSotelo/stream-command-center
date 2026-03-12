"use client";
import { useState, useEffect } from "react";
import { pusherClient } from "@/lib/pusher";
import { AnimatedPrice } from "../components/AnimatedPrice"; 
import { useSession } from "next-auth/react";

export default function LandingPage() {
  // MOVER DENTRO: Los hooks van aquí
  const { data: session, status } = useSession();
  const [price, setPrice] = useState<number>(1200);

  useEffect(() => {
    fetch("/api/price")
      .then((res) => res.json())
      .then((data) => {
        if (data.newPrice) setPrice(Number(data.newPrice));
      });

    const channel = pusherClient.subscribe("auction-channel");
    
    channel.bind("price-update", (data: any) => {
      console.log("Datos recibidos de Pusher:", data);

      // Intentamos sacar el valor ya sea de 'newPrice' o de 'price'
      const incomingPrice = data.newPrice || data.price;

      if (incomingPrice !== undefined) {
        setPrice(Number(incomingPrice));
        
        // Sonido de éxito
        const audio = new Audio("/sounds/cash-register.mp3");
        audio.play().catch(e => console.log("Audio bloqueado por el navegador:", e));
        
        console.log(`¡Precio actualizado por ${data.user || 'Sistema'}: $${incomingPrice}`);
      } else {
        console.error("No se encontró el precio en el objeto de Pusher", data);
      }
    });

    return () => {
      pusherClient.unsubscribe("auction-channel");
    };
  }, []);

  // El return de carga va AL FINAL de los hooks
  if (status === "loading") return <div className="p-8 text-brand-cyan">INITIALIZING_SYSTEM...</div>;

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