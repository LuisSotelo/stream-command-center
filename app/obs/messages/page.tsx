"use client";
import { useEffect, useState, Suspense } from "react";
import { pusherClient } from "@/lib/pusher";
import { motion, AnimatePresence } from "framer-motion";

function JoaquinMessagesContent() {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const channel = pusherClient.subscribe("auction-channel");

    channel.bind("joaquin-says", (data: { message: string }) => {
      // 1. SONIDO DE ALERTA (El que haremos mañana)
      const audio = new Audio("/sounds/joaquin-online.mp3");
      audio.volume = 0.4;
      audio.play().catch(() => {});

      // 2. MOSTRAR MENSAJE
      setMessage(data.message);
      setVisible(true);

      // 3. OCULTAR TRAS 8 SEGUNDOS
      setTimeout(() => setVisible(false), 8000);
    });

    return () => { pusherClient.unsubscribe("auction-channel"); };
  }, []);

  return (
    <main className="bg-transparent h-screen w-screen p-10 flex items-end justify-start font-mono">
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, x: -50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, filter: "blur(10px)" }}
            className="bg-black/80 border-l-4 border-brand-purple p-6 rounded-r-xl max-w-lg shadow-glow-purple backdrop-blur-md"
          >
            <p className="text-[10px] text-brand-purple uppercase font-black tracking-widest mb-2">
              🤖 JOAQUIN_BROADCAST_INCOMING
            </p>
            <p className="text-xl text-white font-bold leading-tight uppercase italic">
              "{message}"
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

export default function JoaquinMessagesOverlay() {
  return <Suspense fallback={null}><JoaquinMessagesContent /></Suspense>;
}