// /app/obs/team/page.tsx
"use client";
import { useEffect, useState, Suspense } from "react";
import { pusherClient } from "@/lib/pusher";
import { motion, AnimatePresence } from "framer-motion";

interface PokemonMember {
  name: string;
  sprite: string;
}

function TeamOverlayContent() {
  const [team, setTeam] = useState<PokemonMember[]>([]);
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    // 1. Carga inicial del equipo desde Redis
    fetch("/api/pokemon/team")
      .then(res => {
        // Si la respuesta no es OK o no es JSON, lanzamos error
        if (!res.ok) throw new Error("Server Error");
        return res.json();
      })
      .then(data => {
        // Verificamos que 'team' exista en el JSON
        if (data && data.team) {
          setTeam(data.team);
        }
      }).catch(err => {
        console.error("Falla al cargar equipo inicial:", err);
        // Opcional: setear un estado vacío para que no rompa el .map
        setTeam(Array(6).fill({ name: "Error", sprite: "" }));
      });

    // 2. Suscripción a Pusher para actualizaciones en tiempo real
    const channel = pusherClient.subscribe("game-channel");

    // ESCUCHAR CUANDO MOSTRAR
    channel.bind("show-team-overlay", () => {
      setShowOverlay(true);

      // REPRODUCIR SONIDO DE POKÉDEX
      // Puedes usar un archivo local en /public/sounds/pokedex.mp3
      // O este enlace de un sonido clásico para probarlo YA:
      const pokedexAudio = new Audio("/sounds/pc-on.mp3");
      pokedexAudio.volume = 0.4; // No queremos dejar sordo al chat
      pokedexAudio.play().catch(err => console.log("Audio play blocked by browser:", err));
      // Se apaga solito tras 10 segundos
      setTimeout(() => setShowOverlay(false), 10000);
    });
    
    channel.bind("team-update", (data: any) => {
      // Cuando el Admin guarda, Pusher nos avisa
      setTeam(data.team);
    });

    return () => {
      pusherClient.unsubscribe("game-channel");
    };
  }, []);

  return (
    <main className="bg-transparent h-screen w-screen p-4 font-mono text-white overflow-hidden">
      {/* Estilos para el efecto de escáner */}
      <style jsx global>{`
        @keyframes scan {
          0% { top: -10%; opacity: 0; }
          50% { opacity: 0.8; }
          100% { top: 110%; opacity: 0; }
        }
        .pixelated { image-rendering: pixelated; }
        .scanner-line {
          position: absolute;
          width: 100%;
          height: 2px;
          background: rgba(0, 245, 255, 0.5);
          box-shadow: 0 0 8px rgba(0, 245, 255, 0.8);
          z-index: 20;
          pointer-events: none;
          animation: scan 2s linear infinite;
        }
      `}</style>

    <AnimatePresence>
        {showOverlay && ( // <--- Solo renderiza si showOverlay es true
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, filter: "blur(20px)" }}
            transition={{ duration: 0.5 }}
          >
      {/* Título Cyberpunk */}
      <div className="flex items-center gap-3 mb-6 border-b border-brand-cyan/20 pb-3">
        <div className="w-3 h-3 bg-brand-cyan rounded-full animate-pulse shadow-[0_0_10px_#00f5ff]" />
        <h1 className="text-xl font-black uppercase tracking-widest text-brand-cyan drop-shadow-[0_0_5px_rgba(0,245,255,0.5)]">
          Current_Squad_Status
        </h1>
      </div>

      {/* Grid de 6 Pokémon */}
      <div className="grid grid-cols-6 gap-4">
        <AnimatePresence mode="popLayout">
          {team.map((poke, index) => (
            <motion.div
              key={`${poke.name}-${index}`}
              initial={{ opacity: 0, x: -20, filter: "brightness(2) blur(10px)" }}
              animate={{ opacity: 1, x: 0, filter: "brightness(1) blur(0px)" }}
              exit={{ opacity: 0, scale: 0.8, filter: "hue-rotate(90deg)" }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              className="relative bg-black/60 border border-brand-cyan/20 rounded-xl p-3 flex flex-col items-center backdrop-blur-md overflow-hidden"
            >
              {/* LÍNEA DE ESCÁNER (Efecto visual) */}
              <div className="scanner-line" />

              {/* Etiqueta de SLOT */}
              <span className="absolute top-1 left-1 text-[7px] text-brand-cyan/40 font-mono">
                SLOT_0{index + 1}
              </span>

              {/* Contenedor del Sprite */}
              <div className="w-20 h-20 flex items-center justify-center mb-2 relative z-10">
                {poke.sprite ? (
                  <img 
                    src={poke.sprite} 
                    alt={poke.name}
                    className="max-w-full max-h-full object-contain pixelated drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                  />
                ) : (
                  <div className="text-white/5 font-black text-xs">NO_DATA</div>
                )}
              </div>

              {/* Nombre del Pokémon */}
              <p className="text-[10px] font-black uppercase tracking-tighter text-center truncate w-full text-brand-cyan/80">
                {poke.name === "Vacío" ? "---" : poke.name}
              </p>
              
              {/* Decoración Cyberpunk en las esquinas */}
              <div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-brand-cyan/40" />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

export default function ObsTeamOverlay() {
  return (
    <Suspense fallback={null}>
      <TeamOverlayContent />
    </Suspense>
  );
}