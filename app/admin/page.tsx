"use client";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { getCurrentLevel } from "@/lib/auction-logic";
import * as tmi from "tmi.js"; // Importación corregida
import { pusherClient } from "@/lib/pusher"; // Asumiendo que aquí tienes tu config de pusher

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState(1200);
  const [progress, setProgress] = useState(0);
  
  // --- ESTADOS DE CHANCHO JOAQUÍN,MERCADO LIBRE,Y TWITCH ---
  const [botStatus, setBotStatus] = useState("OFFLINE");
  const [mlStatus, setMlStatus] = useState("CHECKING");
  const [twitchStatus, setTwitchStatus] = useState("CHECKING");

  const clientRef = useRef<tmi.Client | null>(null);

  const level = getCurrentLevel(currentPrice);

  // --- LÓGICA DE SONIDOS ---
  const playSound = (file: string) => {
    const audio = new Audio(`/sounds/${file}`);
    // Añadimos un chequeo de volumen y un catch más robusto
    audio.volume = 0.5; 
    audio.play().catch(() => {
      // Si falla, solo lo ignoramos en consola para no ensuciar el log
      console.log("🔊 Sonido bloqueado: Esperando interacción del usuario.");
    });
  };

  // --- RESETEO COMPLETO DEL SISTEMA (SOLO OWNER) ---
  const handleResetAuction = async () => {
    if (!confirm("¿RESETEAR TODO EL SISTEMA?")) return;
    await fetch("/api/auction/reset", { method: "POST" });
    window.location.reload();
  };

  // --- LÓGICA DEL BOT (JOAQUÍN) ---
  useEffect(() => {
    if (status === "authenticated") {
      clientRef.current = new tmi.Client({
        options: { debug: false },
        identity: {
          username: "ChanchoJoaquin",
          password: process.env.TWITCH_BOT_OAUTH || ""
        },
        channels: [process.env.NEXT_PUBLIC_TWITCH_CHANNEL || "LuisHongo"]
      });

      clientRef.current.connect()
        .then(() => {
          setBotStatus("ONLINE");
        })
        .catch((err) => {
          console.error("Error conectando a Joaquín:", err);
          setBotStatus("ERROR");
        });

      // Escuchar Pusher para el conteo en el chat
      const channel = pusherClient.subscribe('auction-channel');
      channel.bind('start-countdown', (data: any) => {
        if (!clientRef.current) return;

        // 🔊 SONIDO DE SUSPENSO: Empieza justo cuando inicia el conteo
        playSound('suspense-countdown.mp3');
        
        const channelName = process.env.NEXT_PUBLIC_TWITCH_CHANNEL || "LuisHongo";
        let counter = data.seconds;
        
        clientRef.current.say(channelName, "🚨 ¡SISTEMA INICIADO! El link de Mercado Libre se libera en...");

        const timer = setInterval(() => {
          if (counter > 0) {
            clientRef.current?.say(channelName, `⏳ ${counter}...`);
            counter--;
          } else {
            clearInterval(timer);
            clientRef.current?.say(channelName, `🏆 ¡PRECIO FINAL: $${data.finalPrice} MXN! COMPRA AQUÍ: ${data.mlLink}`);
          }
        }, 1000);
      });
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
        setBotStatus("OFFLINE");
      }
    };
  }, [status]);

  // --- CHECKEO DE CONEXIÓN CON MERCADO LIBRE ---
  useEffect(() => {
    const checkML = async () => {
      try {
        const res = await fetch("/api/ml/status");
        const data = await res.json();
        setMlStatus(data.status);
      } catch {
        setMlStatus("OFFLINE");
      }
    };

    checkML();
    // Revisar cada 5 minutos por si el token caduca a mitad del stream
    const interval = setInterval(checkML, 300000); 
    return () => clearInterval(interval);
  }, []);

  // --- SINCRONIZACIÓN DE DATOS ---
  useEffect(() => {
    async function fetchData() {
      try {
        const statusRes = await fetch("/api/twitch/status");
        const statusData = await statusRes.json();
        setIsLive(statusData.isLive);
        setTwitchStatus(statusData.connection);

        const priceRes = await fetch("/api/price");
        const priceData = await priceRes.json();
        if (priceData.newPrice) setCurrentPrice(priceData.newPrice);

        const progRes = await fetch("/api/game-progress");
        const progData = await progRes.json();
        if (progData.success) setProgress(progData.progress);
      } catch (error) {
        console.error("Error sincronizando dashboard:", error);
        setTwitchStatus("OFFLINE");
      } finally {
        setLoading(false);
      }
    }
    
    if (status !== "loading") fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [status]);

  const isOwner = 
    session?.user?.email === process.env.NEXT_PUBLIC_OWNER_EMAIL || 
    (session as any)?.user?.id === process.env.NEXT_PUBLIC_OWNER_ID;

  const handleDiscount = async (type: string) => {
    if (!isLive && !isOwner) return;
    try {
      const res = await fetch("/api/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, user: session?.user?.name || "Admin" }),
      });
      const data = await res.json();
      if (data.success) setCurrentPrice(data.newPrice);
    } catch (error) { console.error("Error:", error); }
  };

  const handleProgressChange = async (value: number) => {
    setProgress(value);
    try {
      await fetch("/api/game-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: value }),
      });
    } catch (error) { console.error("Error updating progress:", error); }
  };

  const handleFinalizeAuction = async () => {
    if (!confirm("¿Estás seguro de finalizar la subasta? Esto activará la cuenta regresiva en vivo.")) return;
    try {
      await fetch("/api/auction/finalize", { 
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) { console.error("Error al finalizar:", error); }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-brand-cyan font-mono italic">
        VERIFYING_AUTHORITY...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white p-8 font-mono">
      {/* Header */}
      <div className="flex justify-between items-center mb-12 border-b border-brand-purple/20 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-purple tracking-tighter">STREAM_COMMAND_CENTER</h1>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-[10px] text-brand-cyan uppercase tracking-widest">
              Operator: {session?.user?.name} | Phase: {level.name}
            </p>
            {/* BOT STATUS LABEL */}
            <div className={`flex items-center gap-2 px-2 py-0.5 rounded border ${
              botStatus === "ONLINE" ? "border-green-500/50 bg-green-500/10 text-green-400" : 
              botStatus === "ERROR" ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-gray-500/50 text-gray-500"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${botStatus === "ONLINE" ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
              <span className="text-[8px] font-bold">JOAQUIN_{botStatus}</span>
            </div>
            {/* ML STATUS LABEL */}
            <div className={`flex items-center gap-2 px-2 py-0.5 rounded border ${
              mlStatus === "CONNECTED" ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400" : 
              "border-red-500/50 bg-red-500/10 text-red-400"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${mlStatus === "CONNECTED" ? "bg-yellow-400 animate-pulse" : "bg-red-500"}`} />
              <span className="text-[8px] font-bold uppercase">ML_{mlStatus}</span>
            </div>
            {/* TWITCH STATUS LABEL */}
            <div className={`flex items-center gap-2 px-2 py-0.5 rounded border ${
              twitchStatus === "CONNECTED" ? "border-brand-purple/50 bg-brand-purple/10 text-brand-purple" : "border-red-500/50 bg-red-500/10 text-red-400"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${twitchStatus === "CONNECTED" ? "bg-brand-purple animate-pulse" : "bg-red-500"}`} />
              <span className="text-[8px] font-bold uppercase">TWITCH_{twitchStatus}</span>
            </div>
          </div>
        </div>
        <button onClick={() => signOut()} className="text-[10px] border border-red-500/50 px-4 py-1 rounded hover:bg-red-500/10 transition-colors">
          TERMINATE_SESSION
        </button>
      </div>

      {/* ALERTA DE SISTEMA BLOQUEADO */}
      {!isLive && !isOwner && !loading && (
        <div className="mb-8 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-center animate-pulse">
          <p className="text-red-400 text-sm font-bold tracking-widest">⚠️ [SISTEMA_BLOQUEADO]: ESPERANDO_STREAM_ACTIVO</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* AUCTION CONTROL */}
        <div className={`transition-all duration-500 ${(!isLive && !isOwner) || twitchStatus !== "CONNECTED" ? "opacity-30 grayscale pointer-events-none" : "opacity-100"}`}>
            <div className="bg-black/40 border border-brand-purple/30 p-6 rounded-xl shadow-glow-purple">
              <h2 className="text-sm mb-6 text-brand-cyan tracking-widest uppercase italic">
                {twitchStatus === "CONNECTED" ? "Auction_Direct_Input" : "⚠️ TWITCH_OFFLINE"}
              </h2>
              <div className="flex flex-col gap-4">
                {/* Estos botones ahora se bloquean si TwitchStatus no es CONNECTED */}
                <button 
                  disabled={twitchStatus !== "CONNECTED"}
                  onClick={() => handleDiscount('SUB')} 
                  className="w-full py-4 bg-brand-purple/20 border border-brand-purple rounded-lg hover:bg-brand-purple/40 transition-all font-bold text-lg"
                >
                  SUB_DETECTED (-${level.rates.sub} MXN)
                </button>
              <button disabled={twitchStatus !== "CONNECTED"} onClick={() => handleDiscount('BITS_100')} className="w-full py-4 bg-brand-cyan/20 border border-brand-cyan rounded-lg hover:bg-brand-cyan/40 transition-all font-bold text-lg text-brand-cyan">
                100_BITS (-${level.rates.bits100} MXN)
              </button>
              <button disabled={twitchStatus !== "CONNECTED"} onClick={() => handleDiscount('BITS_1000')} className="w-full py-4 bg-orange-500/10 border border-orange-500/50 rounded-lg hover:bg-orange-500/20 transition-all font-bold text-lg text-orange-500">
                1000_BITS (-${level.rates.bits1000} MXN)
              </button>
            </div>
          </div>
        </div>

        {/* GAME PROGRESS CONTROL */}
        <div className={!isLive && !isOwner ? "opacity-30 grayscale pointer-events-none" : ""}>
          <div className="bg-black/40 border border-brand-cyan/30 p-6 rounded-xl shadow-glow-cyan">
            <h2 className="text-sm mb-6 text-brand-cyan tracking-widest uppercase text-center">Mod_Game_Progress</h2>
            <div className="flex flex-col items-center">
              <span className="text-5xl font-bold text-brand-cyan mb-8 drop-shadow-[0_0_10px_rgba(0,245,255,0.5)]">{progress}%</span>
              <div className="flex gap-2 w-full mb-8">
                {[5, 10, 25].map((boost) => (
                  <button key={boost} onClick={() => handleProgressChange(Math.min(100, progress + boost))} className="flex-1 py-2 bg-brand-cyan/10 border border-brand-cyan/40 rounded text-[10px] hover:bg-brand-cyan/30">+{boost}%</button>
                ))}
              </div>
              <input type="range" min="0" max="100" value={progress} onChange={(e) => handleProgressChange(parseInt(e.target.value))} className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-brand-cyan mb-4" />
            </div>
          </div>
        </div>

        {/* OWNER & MARKETING */}
        {isOwner && (
          <div className="bg-black/40 border border-orange-500/30 p-6 rounded-xl shadow-[0_0_20px_rgba(234,88,12,0.1)]">
            <h2 className="text-sm mb-4 text-orange-500 tracking-widest uppercase italic">DEPLOY_OR_RESET</h2>
            <p className="text-[9px] text-gray-500 mb-4 font-mono">Current Final Price: ${currentPrice} MXN</p>
            <button 
              onClick={async () => {
                if(confirm("REBOOT SYSTEM?")) {
                  await fetch('/api/auction/reset', { method: 'POST' });
                  location.reload();
                }
              }}
              className="mt-4 text-[8px] text-red-500/50 hover:text-red-500 uppercase"
            >
              [ hard_reset_database ]
            </button>
            <button 
              className="w-full py-6 bg-orange-600/20 border border-orange-500 rounded-lg hover:bg-orange-600/40 transition-all font-bold text-orange-500 uppercase tracking-widest text-sm" 
              onClick={handleFinalizeAuction}
            >
              🚀 Launch Final Publication
            </button>
          </div>
        )}

        <div className="bg-black/40 border border-brand-purple/30 p-6 rounded-xl backdrop-blur-md">
          <h2 className="text-sm mb-6 text-brand-cyan tracking-widest uppercase">Stream_Assets</h2>
          <div className="space-y-6">
            <div>
              <div className="text-[10px] text-brand-cyan mb-2 font-mono uppercase tracking-tighter italic opacity-70">Mercado_Pago_Tips</div>
              <div className="flex gap-2">
                <input readOnly value="https://link.mercadopago.com.mx/luishongo" className="flex-1 bg-black/60 border border-white/10 p-2 text-[10px] rounded text-gray-400 font-mono" />
                <button onClick={() => { navigator.clipboard.writeText("https://link.mercadopago.com.mx/luishongo"); alert("Link copiado!"); }} className="px-3 py-1 bg-brand-cyan/20 border border-brand-cyan/50 text-brand-cyan text-[10px] rounded hover:bg-brand-cyan/40 font-bold tracking-tighter">COPY</button>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-tighter">Instant_Gaming_Affiliate</div>
              <input readOnly value="https://www.instant-gaming.com/?igr=LuisHongo" className="w-full bg-black/60 border border-white/10 p-2 text-[10px] rounded text-gray-400 font-mono" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}