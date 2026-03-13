"use client";
import { useEffect, useState } from "react";
import { pusherClient } from "@/lib/pusher";
import { AnimatedPrice } from "../../components/AnimatedPrice";
import { AnimatePresence, motion } from "framer-motion";
import { getCurrentLevel } from "@/lib/auction-logic";

export default function ObsPriceOverlay() {
  const [price, setPrice] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [currentLevel, setCurrentLevel] = useState("BASE");
  const [triggerShake, setTriggerShake] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  // --- NUEVOS ESTADOS PARA EL CONTEO ---
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
  // 1. Checar status y precio
  const checkStatus = async () => {
    const res = await fetch("/api/price");
    const data = await res.json();
    
    // Si la subasta ya terminó, bloqueamos la visibilidad normal
    if (data.auction_status === "finished") {
      setIsFinished(true);
      setIsVisible(true); // Queremos que se vea el letrero de "Vendido"
      return; 
    }

    if (data.newPrice) {
      setPrice(Number(data.newPrice));
      setCurrentLevel(getCurrentLevel(data.newPrice).name);
    }
  };

  checkStatus();

    //  Cargar precio inicial
    fetch("/api/price").then(res => res.json()).then(data => {
      if (data.newPrice) {
        setPrice(Number(data.newPrice));
        setCurrentLevel(getCurrentLevel(data.newPrice).name);
      }
    });

    const channel = pusherClient.subscribe("auction-channel");
    
    // --- ESCUCHAR ACTUALIZACIONES NORMALES ---
    channel.bind("price-update", (data: any) => {
      if (data.newPrice) {
        setPrice(Number(data.newPrice));
        setCurrentLevel(data.levelName || "BASE");
        setIsVisible(true);
        setTriggerShake(true);
        
        new Audio("/sounds/casino-win.mp3").play().catch(() => {});
        
        setTimeout(() => setTriggerShake(false), 400);
        setTimeout(() => setIsVisible(false), 6000);
      }
    });

    // --- ESCUCHAR EL CIERRE MAESTRO (CONTEO FINAL) ---
    channel.bind("start-countdown", (data: any) => {
      setCountdown(data.seconds);
      setIsVisible(true); // Forzamos visibilidad
      
      // 🔊 Audio de suspenso (el mismo que en el dashboard para sincronía)
      const suspense = new Audio("/sounds/suspense-countdown.mp3");
      suspense.play().catch(() => {});

      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev !== null && prev > 1) return prev - 1;
          clearInterval(timer);
          return 0;
        });
      }, 1000);

      // Ocultar todo 5 segundos después de que termine el conteo
      setTimeout(() => setIsFinished(true), (data.seconds * 1000));
    });

    return () => {
      pusherClient.unsubscribe("auction-channel");
    };
  }, []);

  const isFinalMode = currentLevel === 'MODO FINAL';

  return (
    <main className="bg-transparent h-screen w-screen flex items-center justify-center overflow-hidden font-mono">
      <AnimatePresence mode="wait">
        {isFinished ? (
            <motion.div
              key="sold-overlay"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center border-4 border-red-600 p-8 bg-black/80 backdrop-blur-xl shadow-[0_0_60px_rgba(255,0,0,0.8)]"
            >
              <motion.div 
                animate={{ opacity: [1, 0.5, 1], x: [-2, 2, -2] }}
                transition={{ repeat: Infinity, duration: 0.2 }}
                className="text-red-600 text-7xl font-black italic tracking-tighter"
              >
                SOLD_OUT
              </motion.div>
              <div className="bg-red-600 text-black px-4 py-1 mt-2 font-bold text-sm uppercase tracking-[0.3em]">
                Acceso Denegado
              </div>
            </motion.div>
          ) : countdown !== null ? (
          <motion.div
            key="countdown-overlay"
            initial={{ opacity: 0, scale: 2 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, filter: "blur(20px)" }}
            className="flex flex-col items-center"
          >
            <motion.span 
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 0.5 }}
              className="text-red-600 text-xl tracking-[0.5em] mb-4 font-bold italic"
            >
              TERMINATING_AUCTION
            </motion.span>
            
            <motion.div 
              key={countdown}
              initial={{ scale: 1.5, color: "#fff" }}
              animate={{ scale: 1, color: "#ff0000" }}
              className="text-9xl font-black italic drop-shadow-[0_0_30px_rgba(255,0,0,0.8)]"
            >
              {countdown > 0 ? countdown : "GO!"}
            </motion.div>
            
            <div className="mt-4 flex gap-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="w-12 h-1 bg-red-600 animate-pulse" />
              ))}
            </div>
          </motion.div>
        ) : (
          /* VISTA B: PRECIO NORMAL (Tu diseño original) */
          isVisible && price && (
            <motion.div
              key="price-overlay"
              initial={{ opacity: 0, scale: 0.5, y: 100 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.5, filter: "blur(15px)" }}
              className={`flex flex-col items-center p-10 rounded-3xl transition-all duration-500
                ${isFinalMode ? 'bg-red-900/40 border-2 border-red-500 shadow-[0_0_50px_rgba(255,0,0,0.6)]' : 'bg-black/60 border border-brand-cyan/30 backdrop-blur-md'}
                ${triggerShake ? (isFinalMode ? "animate-shake-hard" : "animate-shake") : ""}`}
            >
              <span className={`text-[12px] tracking-[0.5em] font-mono mb-4 
                ${isFinalMode ? 'text-red-500 shadow-[0_0_10px_#ff0000]' : 'text-brand-cyan shadow-glow-cyan'}`}>
                {isFinalMode ? '!!! MODO_FINAL !!!' : `PHASE: ${currentLevel}`}
              </span>

              <AnimatedPrice price={price} />

              {isFinalMode && (
                <motion.div animate={{ y: [0, 5, 0] }} transition={{ repeat: Infinity }} className="text-red-500 mt-2">
                  ▼▼▼
                </motion.div>
              )}
            </motion.div>
          )
        )}
      </AnimatePresence>
    </main>
  );
}