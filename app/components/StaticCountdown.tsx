"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { pusherClient } from "@/lib/pusher";

export function StaticCountdown() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const targetDate = new Date("2026-03-16T18:00:00").getTime();

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = targetDate - now;

      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000),
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
  const channel = pusherClient.subscribe('stream-channel');

  channel.bind('test-event', (data: { message: string }) => {
    // Aquí puedes hacer que el contador brille, cambie de color o salga un alert
    alert(data.message);
    console.log("Evento recibido:", data.message);
  });

  return () => {
    pusherClient.unsubscribe('stream-channel');
  };
}, []);

  return (
    <main className="min-h-screen bg-background bg-grid flex flex-col items-center justify-center p-6 font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="text-center z-10"
      >
        <h1 className="text-brand-purple text-5xl md:text-7xl font-bold mb-4 drop-shadow-[0_0_15px_rgba(145,70,255,0.3)]">
          LUISHONGO
          <span className="animate-cursor-blink">_</span>
        </h1>
        <p className="text-brand-cyan font-mono text-sm tracking-[0.3em] mb-12 uppercase">
          System Reboot // 16.03.2026
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono">
          {Object.entries(timeLeft).map(([label, value]) => (
            <div 
              key={label} 
              className="bg-black/40 border border-brand-purple/40 p-4 px-[5px] rounded-xl backdrop-blur-md shadow-glow-purple group hover:border-brand-purple transition-all duration-300"
            >
              <span className="text-4xl md:text-5xl block text-white font-mono drop-shadow-[0_0_10px_rgba(145,70,255,0.8)]">
                {value.toString().padStart(2, '0')}
              </span>
              <span className="text-[10px] uppercase text-brand-cyan tracking-widest font-mono">
                {label}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-16 inline-flex items-center gap-2 px-6 py-2 bg-brand-purple/5 border border-brand-purple/20 rounded-full text-brand-purple text-[10px] font-mono shadow-glow-purple animate-pulse-slow">
          <span className="w-1.5 h-1.5 bg-brand-purple rounded-full shadow-[0_0_8px_#9146FF]"></span>
          STATUS: COMPILING_STREAM_COMMAND_CENTER
        </div>
      </motion.div>
    </main>
  );
}