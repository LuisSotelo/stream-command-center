"use client";
import { StaticCountdown } from "./components/StaticCountdown"; // El que tienes ahorita
import { AuctionInteractive } from "./components/AuctionInteractive"; // El nuevo con Pusher

export default function Page() {
  // Leemos la variable del .env
  const isLive = process.env.NEXT_PUBLIC_STREAM_ACTIVE === 'true';

  return (
    <main>
      {isLive ? <AuctionInteractive /> : <StaticCountdown />}
    </main>
  );
}