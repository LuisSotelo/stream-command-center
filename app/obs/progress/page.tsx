"use client";
import { useEffect, useState } from "react";
import { pusherClient } from "@/lib/pusher";
import { AnimatePresence, motion } from "framer-motion";
import { getCurrentLevel } from "@/lib/auction-logic";

export default function ObsProgressOverlay() {
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [currentLevel, setCurrentLevel] = useState("BASE");

  useEffect(() => {
    // Sincronizar nivel inicial
    fetch("/api/price").then(res => res.json()).then(data => {
      if (data.newPrice) setCurrentLevel(getCurrentLevel(data.newPrice).name);
    });

    const gameChannel = pusherClient.subscribe("game-channel");
    const auctionChannel = pusherClient.subscribe("auction-channel");

    // Escuchar si el nivel cambia para cambiar el color del sable en OBS
    auctionChannel.bind("price-update", (data: any) => {
      if (data.levelName) setCurrentLevel(data.levelName);
    });

    gameChannel.bind("progress-update", (data: any) => {
      setProgress(Number(data.progress));
      setIsVisible(true);
      new Audio("/sounds/saber-hum.mp3").play().catch(() => {});
      setTimeout(() => setIsVisible(false), 5000);
    });

    return () => {
      pusherClient.unsubscribe("game-channel");
      pusherClient.unsubscribe("auction-channel");
    };
  }, []);

  const isFinalMode = currentLevel === 'MODO FINAL';

  return (
    <main className="bg-transparent h-screen w-screen flex items-end justify-center pb-20 overflow-hidden">
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
            className="w-full max-w-lg flex flex-col items-center"
          >
            <span className={`text-[20px] tracking-[0.4em] mb-3 font-mono ${isFinalMode ? 'text-red-500' : 'text-[#00f5ff]'}`}>
              GAME_PROGRESS: {progress}%
            </span>

            <div className={`relative h-5 w-full bg-black/90 rounded-full border overflow-hidden
              ${isFinalMode ? 'border-red-500 shadow-[0_0_20px_#ff0000]' : 'border-white/20'}`}>
              
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className={`relative h-full rounded-full transition-all duration-500
                  ${isFinalMode ? 'bg-red-600 shadow-[0_0_30px_#ff0000]' : 'saber-core'}`}
              >
                <motion.div 
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 bg-linear-to-r from-transparent via-white/50 to-transparent"
                />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}