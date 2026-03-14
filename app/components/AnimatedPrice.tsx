"use client";
import { motion, AnimatePresence } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";

type AnimatedPriceProps = {
  price: number;
};

export function AnimatedPrice({ price }: AnimatedPriceProps) {
  const safePrice = Number.isNaN(price) || price === undefined ? 0 : price;
  const [showHype, setShowHype] = useState(false);
  
  // Usamos una ref interna para comparar, es más fiable que el prop previousPrice
  const lastPriceRef = useRef(safePrice);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio("/sounds/casino-win.mp3");
      audioRef.current.load();
    }
  }, []);

  useEffect(() => {
    // Si el precio baja (y no es el primer render con 1200 o el valor inicial)
    if (safePrice < lastPriceRef.current && lastPriceRef.current !== 0) {
      setShowHype(true);

      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 0.3;
        audioRef.current.play().catch(() => {});
      }

      const timer = setTimeout(() => {
        setShowHype(false);
      }, 2000); // Le damos un poco más de tiempo para que se luzca

      lastPriceRef.current = safePrice;
      return () => clearTimeout(timer);
    }
    
    lastPriceRef.current = safePrice;
  }, [safePrice]);

  const isHalfPrice = safePrice > 0 && safePrice <= 600;

  return (
    <div className="flex flex-col items-center gap-12">
      <div className={`flex flex-col md:flex-row items-center gap-0 overflow-hidden rounded-2xl border transition-all duration-500 ${
          showHype ? "border-red-500 shadow-[0_0_30px_#ef4444] scale-105" : "border-white/20 shadow-glow-purple"
        }`}
      >
        {/* Carátula */}
        <div className="relative w-48 h-64 md:w-64 md:h-80 border-r border-white/10 overflow-hidden">
          <Image src="/images/game-cover.jpg" alt="Game Cover" fill className="object-cover" priority />
        </div>

        {/* Contenedor del Precio */}
        <div className="flex flex-col items-center justify-center bg-black/40 px-16 py-12 min-w-[320px] relative">
          
          {/* LA FLECHA: Fuera del flujo del NumberFlow para que no lo mueva */}
          <AnimatePresence>
            {showHype && (
              <motion.div
                key="arrow-hype"
                initial={{ opacity: 0, x: 20, scale: 0.5 }}
                animate={{ opacity: 1, x: -80, scale: 1 }} // Ajustado el x para que no tape el precio
                exit={{ opacity: 0, scale: 1.5 }}
                className="absolute left-0 text-red-600 text-7xl font-black drop-shadow-[0_0_15px_#EF4444] z-50"
              >
                ▼
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`text-8xl md:text-9xl font-bold tabular-nums transition-colors duration-300 ${
                showHype ? "text-red-500" : "text-white"
              }`}
          >
            <span className="flex items-center">
              $<NumberFlow value={safePrice} locales="en-US" format={{ useGrouping: false }} />
            </span>
          </div>
        </div>
      </div>

      {/* Instant Gaming Promo */}
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
            <button className="relative px-8 py-4 bg-black border border-orange-500 rounded-lg text-white font-bold tracking-tighter uppercase text-xs">
              Oferta disponible en Instant Gaming
            </button>
          </motion.a>
        )}
      </AnimatePresence>
    </div>
  );
}