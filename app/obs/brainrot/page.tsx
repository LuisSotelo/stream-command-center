"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { pusherClient } from "@/lib/pusher";
import { AnimatePresence, motion } from "framer-motion";

function BrainrotContent() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 400, height: 600 }); // Medidas dinámicas
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const channel = pusherClient.subscribe("game-channel");

    channel.bind("trigger-brainrot", (data: { videoUrl: string }) => {
      setVideoUrl(null); // Reset para AnimatePresence
      setTimeout(() => setVideoUrl(data.videoUrl), 50);
    });

    return () => { pusherClient.unsubscribe("game-channel"); };
  }, []);

  // Función que se dispara cuando el video carga sus datos (dimensiones)
  const handleVideoLoad = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = e.currentTarget;
    const isHorizontal = video.videoWidth > video.videoHeight;

    // DEFINIMOS MEDIDAS SEGÚN ORIENTACIÓN
    // Si es horizontal lo hacemos más pequeño (tipo ventana)
    const newWidth = isHorizontal ? 480 : 350; 
    const newHeight = isHorizontal ? 270 : 550;

    setDimensions({ width: newWidth, height: newHeight });

    // RE-CALCULAR POSICIÓN ALEATORIA CON LAS NUEVAS MEDIDAS
    const maxX = 1920 - newWidth - 100;
    const maxY = 1080 - newHeight - 100;
    const randomX = Math.floor(Math.random() * maxX) + 50;
    const randomY = Math.floor(Math.random() * maxY) + 50;

    setPosition({ x: randomX, y: randomY });
  };

  const handleCleanup = async () => {
    const playedVideo = videoUrl; // Guardamos la URL antes de limpiar el estado
    setVideoUrl(null);
    
    try {
      // Enviamos la URL a la API para que la borre de Redis
      await fetch("/api/brainrot/cleanup", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: playedVideo }) 
      });
    } catch (e) { 
      console.error("Error limpiando video de la lista", e); 
    }

    new Audio("https://www.myinstants.com/media/sounds/pop_1.mp3").play().catch(() => {});
  };

  return (
    <main className="bg-transparent h-[1080px] w-[1920px] relative overflow-hidden pointer-events-none">
      <AnimatePresence>
        {videoUrl && (
          <motion.div
            key={videoUrl}
            initial={{ opacity: 0, scale: 0.5, filter: "blur(20px)" }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              filter: "blur(0px)",
              left: position.x,
              top: position.y 
            }}
            exit={{ opacity: 0, scale: 1.5, filter: "blur(40px)" }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
            style={{ 
                position: 'absolute', 
                width: dimensions.width, 
                height: dimensions.height 
            }}
            className="bg-black border-4 border-brand-cyan shadow-glow-cyan rounded-2xl overflow-hidden"
          >
            <video 
              ref={videoRef}
              src={videoUrl} 
              className="w-full h-full object-cover"
              autoPlay
              onLoadedMetadata={handleVideoLoad} // <--- DETECTA ORIENTACIÓN AQUÍ
              onEnded={handleCleanup}
              onError={handleCleanup}
              muted={false}
            />
            
            <div className="absolute top-1 left-2 bg-black/60 px-2 py-0.5 rounded text-[6px] font-mono text-brand-cyan z-30 border border-brand-cyan/30">
              DETECTION: {dimensions.width > dimensions.height ? 'HORIZONTAL_MODE' : 'VERTICAL_MODE'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

export default function BrainrotOverlay() {
  return <Suspense fallback={null}><BrainrotContent /></Suspense>;
}