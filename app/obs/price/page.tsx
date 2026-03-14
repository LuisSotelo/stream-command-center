"use client";
import { useEffect, useState, useRef } from "react";
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
  const latestPriceRef = useRef<number | null>(null);
  const [triggerEvent, setTriggerEvent] = useState<string | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [lastUser, setLastUser] = useState<{name: string, amount: number} | null>(null);

  // 1. Efecto para verificar el estatus de Twitch (Independiente)
  useEffect(() => {
    const checkTwitchStatus = async () => {
      try {
        const res = await fetch("/api/twitch/status");
        const data = await res.json();
        setIsLive(data.isLive);
      } catch (error) {
        console.error("Error checking Twitch status");
      }
    };

    checkTwitchStatus();
    const interval = setInterval(checkTwitchStatus, 120000);
    return () => clearInterval(interval);
  }, []);

  // 2. Efecto principal: Precios, Pusher y Conteo
  useEffect(() => {
    const checkStatus = async () => {
      const res = await fetch("/api/price");
      const data = await res.json();
      
      if (data.auction_status === "finished") {
        setIsFinished(true);
        setIsVisible(true);
        return; 
      }

      if (data.newPrice) {
        const p = Number(data.newPrice);
        setPrice(p);
        latestPriceRef.current = p;
        setCurrentLevel(getCurrentLevel(p).name);
      }
    };

    checkStatus();

    const channel = pusherClient.subscribe("auction-channel");

    // --- ESCUCHAR ACTUALIZACIONES ---
    channel.bind("price-update", (data: any) => {
      if (data.newPrice) {
        // 1. Primero activamos la visibilidad y el shake con el precio VIEJO (el que ya estaba en el estado)
        setIsVisible(true);
        setTriggerShake(true);
        setCurrentLevel(data.levelName || "BASE");

        // Usamos una única instancia de audio cargada previamente para evitar el bloqueo
        const winAudio = new Audio("/sounds/casino-win.mp3");
        winAudio.volume = 0.5;
        winAudio.play().catch(() => console.log("Audio block by OBS policies"));

        // 2. Esperamos 800ms para que la animación de entrada de Framer Motion termine
        // y entonces actualizamos el precio para que la flecha roja TENGA qué comparar
        setTimeout(() => {
          const newPrice = Number(data.newPrice);
          setPrice(newPrice);
          latestPriceRef.current = newPrice;
        }, 800); 

        setTimeout(() => setTriggerShake(false), 1200);
        setTimeout(() => setIsVisible(false), 7000); // Alargamos a 7s por el delay inicial
        // Seteamos el último golpe
        setLastUser({ name: data.user, amount: data.amount });
        setTimeout(() => setLastUser(null), 5000); // Se va un poco antes que el precio
      }

      if (data.levelName && data.levelName !== currentLevel) {
        setCurrentLevel(data.levelName);
        setShowLevelUp(true);
        new Audio("/sounds/level-up.mp3").play().catch(() => {});
        setTimeout(() => setShowLevelUp(false), 3000);
      }

      if (data.specialEvent) {
        new Audio("/sounds/alert-surprise.mp3").play().catch(() => {});
        setTriggerEvent(data.specialEvent.name);
        setTimeout(() => setTriggerEvent(null), 5000);
      }
    });

    // --- ESCUCHAR CONTEO FINAL ---
    channel.bind("start-countdown", (data: any) => {
      const totalSeconds = data.seconds;
      setCountdown(totalSeconds);
      setIsVisible(true);
      
      new Audio("/sounds/suspense-countdown.mp3").play().catch(() => {});

      const timer = setInterval(() => {
        setCountdown((prev) => {
          // Si el contador es mayor a 0, restamos
          if (prev !== null && prev > 0) return prev - 1;
          
          // Cuando ya llegó a 0, limpiamos el intervalo
          clearInterval(timer);
          return 0;
        });
      }, 1000);

      // IMPORTANTE: Le sumamos 1 segundo (o 1.5s) al total del anuncio 
      // para que el "GO!" o el "0" se queden grabados en la retina antes del SOLD OUT
      setTimeout(() => {
        setIsFinished(true);
      }, (totalSeconds + 1) * 1000);
    });

    return () => {
      pusherClient.unsubscribe("auction-channel");
    };
  }, [currentLevel]); // Agregamos currentLevel para que los binds tengan el estado fresco

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
          isVisible && price !== null && (
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

              <AnimatePresence>
                {lastUser && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1.2 }} // Fuente más grande para OBS
                    exit={{ opacity: 0, y: -20 }}
                    className="absolute -top-32 flex flex-col items-center"
                  >
                    <span className="text-brand-cyan text-xs font-black tracking-widest uppercase">¡Último Golpe!</span>
                    <span className="text-white text-5xl font-black italic">{lastUser.name.toUpperCase()}</span>
                    <span className="text-red-500 font-mono text-xl">-${lastUser.amount} MXN</span>
                  </motion.div>
                )}
              </AnimatePresence>

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

      <AnimatePresence>
        {showLevelUp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
            animate={{ opacity: 1, scale: 1.2, rotate: 0 }}
            exit={{ opacity: 0, scale: 2, filter: "blur(20px)" }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-sm"
          >
            <div className="text-center">
              <motion.h2 
                animate={{ x: [-3, 3, -3] }}
                transition={{ repeat: Infinity, duration: 0.08 }}
                className={`text-6xl md:text-8xl font-black italic ${isFinalMode ? 'text-red-600 drop-shadow-[0_0_40px_#ff0000]' : 'text-brand-cyan drop-shadow-[0_0_30px_#00f5ff]'}`}
              >
                {currentLevel}
              </motion.h2>
              <p className="text-white tracking-[0.5em] mt-4 font-mono animate-pulse">
                {isFinalMode ? 'WARNING: MAXIMUM_DISCOUNT_PHASE' : 'DESCUENTOS_POTENCIADOS_ACTIVOS'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {triggerEvent && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed bottom-20 bg-red-600 text-white px-8 py-2 font-black italic tracking-tighter skew-x-[-12deg] shadow-[10px_10px_0_0_#000]"
          >
            ¡{triggerEvent.toUpperCase()} ACTIVADO!
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}