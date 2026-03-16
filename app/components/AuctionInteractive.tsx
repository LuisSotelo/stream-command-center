"use client";
import { useEffect, useState } from "react";
import { pusherClient } from "@/lib/pusher"; 
import { useSession } from "next-auth/react";
import { AnimatedPrice } from "./AnimatedPrice";
import { motion, AnimatePresence } from "framer-motion";
import { getCurrentLevel } from "@/lib/auction-logic";

export function AuctionInteractive() {
  const { status } = useSession();
  const [price, setPrice] = useState<number>(1200);
  const [triggerEvent, setTriggerEvent] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState("BASE");
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [triggerShake, setTriggerShake] = useState(false);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showFinalLink, setShowFinalLink] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [lastUser, setLastUser] = useState<{name: string, amount: number} | null>(null);
  const [topContributors, setTopContributors] = useState<{user: string, score: number}[]>([]);
  const [mlLink, setMlLink] = useState<string | null>(null);

  let lastSoundTime = 0;

  // Lógica de intensidad y colores por nivel
  const isFinalMode = currentLevel === 'MODO FINAL';

  const getGlowIntensity = () => {
    switch(currentLevel) {
      case 'NIVEL 1': return 'shadow-[0_0_20px_#00f5ff]';
      case 'NIVEL 2': return 'shadow-[0_0_40px_#00f5ff]';
      case 'NIVEL 3': return 'shadow-[0_0_60px_#9146ff]';
      case 'MODO FINAL': return 'shadow-[0_0_100px_#ff0055] animate-pulse';
      default: return 'shadow-none';
    }
  };

  // --- 1. FUNCIÓN DE CARGA DEL TOP (Fuera de los efectos) ---
  const fetchTop = async () => {
    try {
      const res = await fetch("/api/auction/top");
      const data = await res.json();
      if (data.success) setTopContributors(data.top);
    } catch (err) {
      console.error("Error loading top");
    }
  };

  useEffect(() => {
    // Función para verificar el status de Twitch
    const checkTwitchStatus = async () => {
      try {
        const res = await fetch("/api/twitch/status");
        const data = await res.json();
        setIsLive(data.isLive);
      } catch (error) {
        console.error("Error checking status");
      }
    };

    // Ejecutamos al cargar
    checkTwitchStatus();
    fetchTop();
    
    // Opcional: Verificar cada 2 minutos por si inicias stream mientras están en la página
    const interval = setInterval(checkTwitchStatus, 120000);
    
    // Initial Fetches
    fetch("/api/price").then(res => res.json()).then(data => {
      if (data.newPrice) setPrice(Number(data.newPrice));

      // --- NUEVO: Traer el link si ya existe ---
      if (data.mlLink) {
        setMlLink(data.mlLink);
      }

      // Seteamos el ganador si existe (para el mensaje de "GOLPE DE GRACIA POR")
      if (data.lastWinner) setLastUser({ name: data.lastWinner, amount: 0 });

      // --- VERIFICAR SI YA TERMINÓ ---
      if (data.auction_status === "finished") {
        setIsFinished(true);
        setShowFinalLink(true); // Esto muestra el botón de ML y el precio final
      }

      // Calculamos el nivel basándonos en el precio que acabamos de traer
      const levelAtLoad = getCurrentLevel(data.newPrice);
      setCurrentLevel(levelAtLoad.name);
    });

    fetch("/api/game-progress").then(res => res.json()).then(data => {
      if (data.progress !== undefined) setProgress(Number(data.progress));
    });

    const auctionChannel = pusherClient.subscribe("auction-channel");
    const gameChannel = pusherClient.subscribe("game-channel");
    
    // Un solo listener de precio centralizado
    auctionChannel.bind("price-update", (data: any) => {
      const incomingPrice = data.newPrice || data.price;
      if (incomingPrice !== undefined) {
        setPrice(Number(incomingPrice));

        // GUARDAMOS EL ÚLTIMO GOLPE
        if (data.user) {
          setLastUser({ name: data.user, amount: data.amount || 0 });
        }
        
        // Sonido de Moneda Neo Geo
        new Audio("/sounds/casino-win.mp3").play().catch(() => {});
        
        // Activar Shake
        setTriggerShake(true); 
        setTimeout(() => setTriggerShake(false), 400);

        //Refrescamos el top cada vez que hay un cambio de precio, para mantenerlo dinámico
        fetchTop();
      }

      // Manejo de Niveles
      if (data.levelName && data.levelName !== currentLevel) {
        setCurrentLevel(data.levelName);
        setShowLevelUp(true);
        new Audio("/sounds/level-up.mp3").play().catch(() => {});
        setTimeout(() => setShowLevelUp(false), 3000);
      }

      // Eventos Especiales (Salvaje/Legendario)
      if (data.specialEvent) {
        new Audio("/sounds/alert-surprise.mp3").play().catch(() => {});
        setTriggerEvent(data.specialEvent.name);
        setTimeout(() => setTriggerEvent(null), 5000);
      }
    });

    gameChannel.bind("progress-update", (data: any) => {
      if (data.progress !== undefined) {
        setProgress(Number(data.progress));
        const now = Date.now();
        if (now - lastSoundTime > 3000) { 
          const audio = new Audio("/sounds/saber-hum.mp3");
          audio.volume = 0.4;
          audio.play().catch(() => {});
          lastSoundTime = now;
        }
      }
    });

    auctionChannel.bind("start-countdown", (data: any) => {
      setMlLink(data.mlLink);
      setCountdown(data.seconds);
      
      // Iniciar el reloj interno
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev && prev > 1) return prev - 1;
          
          // CUANDO LLEGA A CERO:
          clearInterval(interval);
          setShowFinalLink(true);
          new Audio("/sounds/victory-fanfare.mp3").play().catch(() => {});
          return 0;
        });
      }, 1000);
    });

    return () => {
      pusherClient.unsubscribe("auction-channel");
      pusherClient.unsubscribe("game-channel");
    };
  }, [currentLevel]);

  if (status === "loading") return <div className="p-8 text-brand-cyan font-mono text-center">INITIALIZING_SYSTEM...</div>;

  // Componente para el ranking de top contributors
  function TopRanking({ top }: { top: {user: string, score: number}[] }) {
    return (
      <div className="flex flex-col gap-2 font-mono border-l border-brand-cyan/20 pl-4">
        <h3 className="text-[10px] text-brand-cyan tracking-widest mb-2 uppercase opacity-60">Top_Contributors</h3>
        {top.slice(0, 3).map((player, i) => (
          <div key={player.user} className="flex justify-between items-center gap-8 border-b border-white/5 pb-1">
            <span className="text-xs text-white uppercase tracking-tighter">
              {i + 1}. {player.user}
            </span>
            <span className="text-xs text-brand-cyan font-bold">-${player.score}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <main className={`min-h-screen flex flex-col items-center justify-center p-4 transition-all duration-1000 
  ${!isLive ? 'bg-black grayscale-[0.5]' : (isFinalMode ? 'bg-[#1a0505]' : 'bg-[#0a0a0a]')}`}>
  
  {/* Mensaje de Estado Superior */}
  <div className="absolute top-10 flex flex-col items-center">
    {isLive ? (
      <>
        <span className={`text-[10px] tracking-[0.4em] font-mono ${isFinalMode ? 'text-red-500' : 'text-brand-cyan'}`}>
          CURRENT_PHASE: {currentLevel}
        </span>
        <div className={`h-[1px] w-24 mt-2 ${isFinalMode ? 'bg-red-500 shadow-[0_0_10px_#ff0000]' : 'bg-brand-cyan shadow-glow-cyan'}`} />
      </>
    ) : (
      <span className="text-[10px] tracking-[0.4em] font-mono text-gray-500 animate-pulse">
        SYSTEM_ON_STANDBY
      </span>
    )}
  </div>

  {/* Título Principal Dinámico */}
  <h1 className={`text-sm tracking-[0.3em] mb-4 font-mono transition-colors duration-500
    ${!isLive ? 'text-gray-600' : (isFinalMode ? 'text-red-500' : 'text-brand-cyan')}`}>
    {isLive ? 'REVERSE_AUCTION_ACTIVE' : 'WAITING_FOR_STREAMER...'}
  </h1>
  
  {/* El contenedor del precio ahora se verá "apagado" si no estás live */}
  <div className={`mb-12 transition-all duration-500 
    ${!isLive ? 'opacity-40 blur-[1px]' : `${getGlowIntensity()} ${triggerShake ? (isFinalMode ? "animate-shake-hard" : "animate-shake") : ""}`}`}>
    <AnimatedPrice price={price} />
  </div>

  {/* Ocultar o atenuar el resto si no hay live */}
  <div className={`w-full max-w-md transition-opacity duration-1000 ${isLive ? 'opacity-100' : 'opacity-20 pointer-events-none'}`}>

      {/* Overlay de Level Up */}
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

      {/* Overlay de Evento Especial (Salvaje/Legendario) */}
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

      {/* Sable Láser */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-8 mt-12 px-4 items-start">
        {/* COLUMNA IZQUIERDA: Top Ranking */}
      <div className="hidden md:block">
        <TopRanking top={topContributors} />
      </div>
      <div className="md:col-span-2">
        <div className={`flex justify-between font-mono text-[10px] mb-2 uppercase tracking-[0.2em] ${isFinalMode ? 'text-red-400' : 'text-[#00f5ff]'}`}>
          <span>Syncing_Game_Progress</span>
          <span>{progress}%</span>
        </div>

        <div className={`relative h-4 w-full bg-black/80 rounded-full border overflow-hidden shadow-inner ${isFinalMode ? 'border-red-500/30' : 'border-white/10'}`}>
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ type: "spring", stiffness: 40, damping: 15 }}
            className={`relative h-full rounded-full ${isFinalMode ? 'bg-red-600 shadow-[0_0_20px_#ff0000]' : 'saber-core'}`}
          >
            <motion.div 
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50"
            />
          </motion.div>
        </div>
      </div>
      </div>

      {!isLive && (
        <p className="mt-8 text-brand-cyan/40 text-center max-w-md text-[10px] font-mono uppercase tracking-widest border border-brand-cyan/20 px-4 py-2 rounded">
          Offline: Vuelve cuando el stream esté activo
        </p>
      )}
      <p className="mt-8 text-gray-500 text-center max-w-md text-[10px] font-mono leading-relaxed">
        Cada Suscripción o Bits en Twitch baja el precio en tiempo real. 
        <br/><span className={isFinalMode ? 'text-red-500 animate-pulse' : ''}>Mods controlan el avance del juego.</span>
      </p>
      </div>

      {/* 1. CONTADOR GIGANTE (HYPE) */}
      <AnimatePresence>
        {countdown !== null && countdown > 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-2xl"
          >
            <motion.span 
              key={countdown}
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="text-[250px] font-black text-brand-cyan drop-shadow-[0_0_50px_#00f5ff] font-mono"
            >
              {countdown}
            </motion.span>
            <p className="text-brand-cyan tracking-[1em] text-xl animate-pulse">PREPARING_FINAL_LINK</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. PANTALLA DE VICTORIA Y BOTÓN MERCADO LIBRE */}
      <AnimatePresence>
        {showFinalLink && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            // Quitamos el exit para que se quede fija
            className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-[#0a0a0a] p-6 text-center"
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="relative"
            >
              <h2 className="text-brand-purple text-2xl mb-4 font-mono tracking-widest uppercase italic">
                {isFinished ? "SISTEMA_CLAUSURADO" : "¡SUBASTA FINALIZADA!"}
              </h2>

              {isFinished && (
                <div className="mt-8 flex flex-col items-center">
                  <span className="text-gray-500 text-[10px] tracking-widest">GOLPE_DE_GRACIA_POR:</span>
                  <span className="text-brand-cyan text-2xl font-black">{lastUser?.name || "LuisHongo"}</span>
                </div>
              )}
              
              <div className="text-8xl font-black text-white mb-2 drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                ${price} <span className="text-2xl">MXN</span>
              </div>
              
              {/* BOTÓN DE MERCADO LIBRE */}
              {showFinalLink && mlLink && (
                <motion.a 
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  href={mlLink} 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-10 bg-[#FFE600] text-black px-16 py-6 rounded-full font-black text-3xl shadow-[0_0_50px_#FFE600] hover:scale-110 transition-all active:scale-95 uppercase italic"
                >
                  ¡RECLAMAR AHORA!
                </motion.a>
              )}
            </motion.div>

            {/* 3. SLOT DE MARKETING: INSTANT GAMING */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 }}
              className="mt-24 p-8 border border-orange-500/20 rounded-2xl bg-orange-500/5 max-w-lg flex flex-col items-center"
            >
              <p className="text-orange-500 text-xs font-mono mb-4 tracking-widest uppercase">Sponsored By</p>
              <div className="flex items-center gap-6">
                <div className="text-left">
                  <p className="text-white font-bold text-lg">¿No alcanzaste el juego?</p>
                  <p className="text-gray-400 text-sm mb-4">Consíguelo con descuento legendario en Instant Gaming.</p>
                  <a 
                    href="https://www.instant-gaming.com/?igr=LuisHongo" 
                    className="inline-block bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded font-bold transition-colors"
                  >
                    VER OFERTA EN IG
                  </a>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BOTÓN DE PROPINAS / SUPPORT */}
      <div className="fixed bottom-6 right-6 z-40">
        <motion.a
          href="https://link.mercadopago.com.mx/luishongo" // Reemplaza con tu link de MP
          target="_blank"
          rel="noopener noreferrer"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-3 bg-black/60 border border-brand-cyan/40 px-4 py-2 rounded-full backdrop-blur-md group hover:border-brand-cyan transition-all shadow-glow-cyan/20"
        >
          <div className="relative">
            <div className="w-2 h-2 bg-brand-cyan rounded-full animate-ping absolute" />
            <div className="w-2 h-2 bg-brand-cyan rounded-full relative" />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-gray-400 font-mono leading-none">SUPPORT_STREAMER</span>
            <span className="text-[11px] text-brand-cyan font-bold font-mono tracking-tighter group-hover:text-white transition-colors">
              TIPS_MERCADOPAGO
            </span>
          </div>
        </motion.a>
      </div>
    </main>
  );
}