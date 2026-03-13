"use client";
import { motion, AnimatePresence } from "framer-motion";
import NumberFlow from "@number-flow/react"; 
import { useEffect, useState, useRef } from "react";
import Image from "next/image"; 

export function AnimatedPrice({ price }: { price: number }) {
  // 1. Validamos que el precio sea un número real desde el inicio
  const safePrice = Number.isNaN(price) || price === undefined ? 0 : price;
  
  const [showHype, setShowHype] = useState(false);
  const lastPrice = useRef(safePrice);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio("/sounds/casino-win.mp3");
      audioRef.current.load();
    }

    // Solo disparamos el efecto si el precio REALMENTE bajó y es un número válido
    if (safePrice < lastPrice.current && safePrice !== 0) {
      setShowHype(true);
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 0.4; // Bajamos un poco el volumen para que no aturda
        audioRef.current.play().catch(() => {});
      }
      const timer = setTimeout(() => setShowHype(false), 1200);
      lastPrice.current = safePrice;
      return () => clearTimeout(timer);
    }
    
    lastPrice.current = safePrice;
  }, [safePrice]);

  const isHalfPrice = safePrice > 0 && safePrice <= 600;

  return (
    <div className="flex flex-col items-center gap-12">
      <div className={`flex flex-col md:flex-row items-center gap-0 overflow-hidden rounded-2xl border transition-all duration-300 ${
        showHype ? "border-red-500 shadow-glow-red scale-105" : "border-white/20 shadow-glow-purple"
      }`}>
        
        {/* COLUMNA 1: La Carátula */}
        <div className="relative w-48 h-64 md:w-64 md:h-80 border-r border-white/10 overflow-hidden">
          <Image 
            src="/images/game-cover.jpg" 
            alt="Game Cover"
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 256px"
            priority 
          />
        </div>

        {/* COLUMNA 2: El Precio */}
        <div className="flex flex-col items-center justify-center bg-black/40 px-16 py-12 min-w-[320px]">
          <div className="relative flex items-center justify-center">
            <AnimatePresence>
              {showHype && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: -10 }}
                  exit={{ opacity: 0 }}
                  className="absolute -left-20 text-red-600 text-7xl font-black drop-shadow-[0_0_15px_#EF4444]"
                >
                  ▼
                </motion.div>
              )}
            </AnimatePresence>

            <div className={`text-8xl md:text-9xl font-bold tabular-nums transition-colors duration-300 ${
              showHype ? "text-red-500" : "text-white"
            }`}>
              <span className="flex items-center">
                {/* Usamos safePrice para evitar el NaN visual */}
                $<NumberFlow value={safePrice} locales="en-US" format={{ useGrouping: false }} />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* BOTÓN AL 50% */}
      <AnimatePresence>
        {isHalfPrice && (
          <motion.a
            href="https://www.instant-gaming.com/?igr=LuisHongo"
            target="_blank"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="group relative flex flex-col items-center"
          >
            <div className="absolute -inset-1 bg-orange-600 rounded-lg blur opacity-40 group-hover:opacity-100 transition duration-300"></div>
            <button className="relative px-8 py-4 bg-black border border-orange-500 rounded-lg text-white font-bold tracking-tighter">
              GET_IT_NOW_ON_INSTANT_GAMING (-50%)
            </button>
          </motion.a>
        )}
      </AnimatePresence>
    </div>
  );
}