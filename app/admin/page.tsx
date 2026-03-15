"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { getCurrentLevel } from "@/lib/auction-logic";
import * as tmi from "tmi.js";
import { pusherClient } from "@/lib/pusher";

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState(1200);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<any[]>([]);

  // --- ESTATUS DE CONEXIONES ---
  const [botStatus, setBotStatus] = useState("OFFLINE");
  const [mlStatus, setMlStatus] = useState("CHECKING");
  const [twitchStatus, setTwitchStatus] = useState("CHECKING");

  const clientRef = useRef<tmi.Client | null>(null);
  const level = getCurrentLevel(currentPrice);

  // Refs para el bot
  const levelRef = useRef(level);
  const isLiveRef = useRef(isLive);
  const currentPriceRef = useRef(currentPrice);

  // Sincronizamos los refs cada vez que cambian estas variables para que el bot siempre tenga la info actualizada
  useEffect(() => {
    levelRef.current = level;
    isLiveRef.current = isLive;
    currentPriceRef.current = currentPrice;
  }, [level, isLive, currentPrice]);

  const playSound = (file: string) => {
    const audio = new Audio(`/sounds/${file}`);
    audio.volume = 0.5;
    audio.play().catch(() => console.log("🔊 Sonido bloqueado."));
  };

    // --- 1. FUNCIÓN DE CARGA DE DATOS (Centralizada) ---
    const fetchData = async () => {
      try {
        const [logsRes, statusRes, priceRes, progRes, mlRes] = await Promise.all([
          fetch("/api/admin/logs"),
          fetch("/api/twitch/status"),
          fetch("/api/price"),
          fetch("/api/game-progress"),
          fetch("/api/ml/status"),
        ]);

        const logsData = logsRes.ok ? await logsRes.json() : { success: false, logs: [] };
        const statusData = statusRes.ok ? await statusRes.json() : { isLive: false, connection: "OFFLINE" };
        const priceData = priceRes.ok ? await priceRes.json() : {};
        const progData = progRes.ok ? await progRes.json() : { success: false };
        const mlData = mlRes.ok ? await mlRes.json() : { status: "OFFLINE" };

        if (logsData.success) setLogs(logsData.logs);
        setIsLive(statusData.isLive);
        setTwitchStatus(statusData.connection);
        if (priceData.newPrice) setCurrentPrice(priceData.newPrice);
        if (progData.success) setProgress(progData.progress);
        setMlStatus(mlData.status || "OFFLINE");
      } catch (error) {
        console.error("Error sincronizando dashboard:", error);
        setTwitchStatus("OFFLINE");
        setMlStatus("OFFLINE");
      } finally {
        setLoading(false);
      }
    };

  // --- 2. EL CEREBRO: JOAQUÍN Y CONEXIONES (Twitch + Pusher) ---
  useEffect(() => {
    if (status !== "authenticated") return;
    fetchData();
    // 1. Conexión Twitch (TMI)
    clientRef.current = new tmi.Client({
      options: { 
        debug: false 
      },
      connection: {
        reconnect: true,
        secure: true
      },
      identity: {
        username: "ChanchoJoaquin",
        password: process.env.NEXT_PUBLIC_TWITCH_BOT_OAUTH || "",
      },
      channels: [process.env.NEXT_PUBLIC_TWITCH_CHANNEL || "LuisHongo"],
    });

    clientRef.current.connect()
      .then(() => setBotStatus("ONLINE"))
      .catch(() => setBotStatus("ERROR"));

    // --- LISTENERS DE RECONEXIÓN ---
    clientRef.current.on("reconnect", () => {
      setBotStatus("RECONNECTING"); // Estado visual para que no te asustes
      console.log("🔄 Joaquín está intentando reconectar...");
    });

    clientRef.current.on("connected", () => {
      setBotStatus("ONLINE");
    });

    clientRef.current.on("disconnected", (reason) => {
      setBotStatus("OFFLINE");
      console.warn("⚠️ Joaquín desconectado:", reason);
    });

    // 2. Suscripción Pusher (Unificada)
    const channel = pusherClient.subscribe("auction-channel");
    
    // -- Listeners de Pusher --
    channel.bind("admin-log-update", (newLog: any) => {
      setLogs((prev) => [newLog, ...prev].slice(0, 20));
    });

    channel.bind("price-update", (data: any) => {
      if (data.newPrice) setCurrentPrice(data.newPrice);
    });

    channel.bind("joaquin-troll", (data: any) => {
      clientRef.current?.say(process.env.NEXT_PUBLIC_TWITCH_CHANNEL || "LuisHongo", `🤖 ${data.message} 🐷`);
    });

    channel.bind("start-countdown", (data: any) => {
      playSound("suspense-countdown.mp3");
      const channelName = process.env.NEXT_PUBLIC_TWITCH_CHANNEL || "LuisHongo";
      let counter = data.seconds;
      clientRef.current?.say(channelName, "🚨 ¡SISTEMA INICIADO! El link se libera en...");

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

    // 3. Listener de Comandos Twitch
    clientRef.current.on('message', async (_chan, _tags, message, self) => {
      if (self || !message.startsWith('!')) return; 
      const command = message.toLowerCase().trim();
      const chName = process.env.NEXT_PUBLIC_TWITCH_CHANNEL || "LuisHongo";

      if (command === '!precio') {
        const res = await fetch('/api/price');
        const data = await res.json();
        clientRef.current?.say(chName, `🤖 El precio actual es $${data.newPrice || currentPriceRef.current} MXN. ¡Bajen eso mortales! 🐷`);
      }
      
      if (command === '!top') {
        const res = await fetch("/api/auction/top");
        const data = await res.json();
        const mvp = data.top?.[0];
        clientRef.current?.say(chName, mvp ? `🤖 El MVP es @${mvp.user} con -$${mvp.score}. ¡Respeten al Sugar Daddy! 👑` : `🤖 Nadie ha donado. Humildad máxima en el chat. 🐽`);
      }

      if (command === '!joaquin') {
        const quotes = ["¿Otro sushi?", "Seta y Bolillo programan mejor que ustedes.", "He visto mejores códigos en un microondas."];
        clientRef.current?.say(chName, `🤖 ${quotes[Math.floor(Math.random()*quotes.length)]} 🐷`);
      }
    });

    return () => {
      pusherClient.unsubscribe("auction-channel");
      if (clientRef.current) {
        clientRef.current.disconnect();
        setBotStatus("OFFLINE");
      }
    };
  }, [status]);

  // --- 3. VERIFICACIÓN DE ML (Simultánea a Twitch) ---
  useEffect(() => {
    const checkML = async () => {
      try {
        const res = await fetch("/api/ml/status");
        const data = await res.json();
        // Asumiendo que tu API responde { status: "CONNECTED" | "OFFLINE" }
        setMlStatus(data.status);
      } catch (error) {
        console.error("Error consultando ML:", error);
        setMlStatus("OFFLINE");
      }
    };

    if (status === "authenticated") {
      checkML();
      // Revisamos cada 5 minutos
      const interval = setInterval(checkML, 300000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const isOwner = session?.user?.email === process.env.NEXT_PUBLIC_OWNER_EMAIL || (session as any)?.user?.id === process.env.NEXT_PUBLIC_OWNER_ID;

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
    await fetch("/api/game-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress: value }),
    });
  };

  const handleFinalizeAuction = async () => {
    if (!confirm("¿Estás seguro de finalizar la subasta? Esto activará la cuenta regresiva en vivo.",)) return;
    try {
      await fetch("/api/auction/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error al finalizar:", error);
    }
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
          <h1 className="text-2xl font-bold text-brand-purple tracking-tighter">
            STREAM_COMMAND_CENTER
          </h1>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-[10px] text-brand-cyan uppercase tracking-widest">
              Operator: {session?.user?.name} | Phase: {level.name}
            </p>
            {/* LABELS DE ESTATUS */}
            <div
              className={`flex items-center gap-2 px-2 py-0.5 rounded border ${
                botStatus === "ONLINE"
                  ? "border-green-500/50 bg-green-500/10 text-green-400"
                  : botStatus === "RECONNECTING"
                    ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
                    : "border-red-500/50 bg-red-500/10 text-red-400"
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${botStatus === "ONLINE" ? "bg-green-400 animate-pulse" : botStatus === "RECONNECTING" ? "bg-yellow-400 animate-bounce" : "bg-red-500"}`}
              />

              <span className="text-[8px] font-bold">JOAQUIN_{botStatus}</span>
            </div>

            {/* ML STATUS LABEL */}

            <div
              className={`flex items-center gap-2 px-2 py-0.5 rounded border ${
                mlStatus === "CONNECTED"
                  ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
                  : "border-red-500/50 bg-red-500/10 text-red-400"
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${mlStatus === "CONNECTED" ? "bg-yellow-400 animate-pulse" : "bg-red-500"}`}
              />

              <span className="text-[8px] font-bold uppercase">
                ML_{mlStatus}
              </span>
            </div>

            {/* TWITCH STATUS LABEL */}

            <div
              className={`flex items-center gap-2 px-2 py-0.5 rounded border ${
                twitchStatus === "CONNECTED"
                  ? "border-brand-purple/50 bg-brand-purple/10 text-brand-purple"
                  : "border-red-500/50 bg-red-500/10 text-red-400"
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${twitchStatus === "CONNECTED" ? "bg-brand-purple animate-pulse" : "bg-red-500"}`}
              />

              <span className="text-[8px] font-bold uppercase">
                TWITCH_{twitchStatus}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => signOut()}
          className="text-[10px] border border-red-500/50 px-4 py-1 rounded hover:bg-red-500/10 transition-colors"
        >
          TERMINATE_SESSION
        </button>
      </div>

      {/* ALERTA DE SISTEMA BLOQUEADO */}

      {!isLive && !isOwner && !loading && (
        <div className="mb-8 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-center animate-pulse">
          <p className="text-red-400 text-sm font-bold tracking-widest">
            ⚠️ [SISTEMA_BLOQUEADO]: ESPERANDO_STREAM_ACTIVO
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* AUCTION CONTROL */}

        <div
          className={`transition-all duration-500 ${(!isLive && !isOwner) || twitchStatus !== "CONNECTED" ? "opacity-30 grayscale pointer-events-none" : "opacity-100"}`}
        >
          <div className="bg-black/40 border border-brand-purple/30 p-6 rounded-xl shadow-glow-purple">
            <h2 className="text-sm mb-6 text-brand-cyan tracking-widest uppercase italic">
              {twitchStatus === "CONNECTED"
                ? "Auction_Direct_Input"
                : "⚠️ TWITCH_OFFLINE"}
            </h2>

            <div className="flex flex-col gap-4">
              {/* Estos botones ahora se bloquean si TwitchStatus no es CONNECTED */}

              {/* BOTÓN PRIME - Azul Amazon para diferenciarlo */}

              <button
                disabled={!isOwner && twitchStatus === "CONNECTED"}
                onClick={() => handleDiscount("PRIME")}
                className={`w-full py-4 bg-blue-500/10 border border-blue-500/50 rounded-lg hover:bg-blue-500/30 transition-all font-bold text-lg text-blue-400 ${twitchStatus !== "CONNECTED" ? "opacity-20 cursor-not-allowed" : "opacity-100"}`}
              >
                PRIME_DETECTED (-${level.rates.prime} MXN)
                {!isOwner && twitchStatus === "CONNECTED" && " 🔒"}
              </button>

              {/* BOTÓN SUB T1 - Morado Twitch Clásico */}

              <button
                disabled={!isOwner && twitchStatus === "CONNECTED"}
                onClick={() => handleDiscount("SUB")}
                className={`w-full py-4 bg-brand-purple/20 border border-brand-purple rounded-lg hover:bg-brand-purple/40 transition-all font-bold text-lg ${twitchStatus !== "CONNECTED" ? "opacity-20 cursor-not-allowed" : "opacity-100"}`}
              >
                SUB_DETECTED (-${level.rates.sub} MXN)
                {!isOwner && twitchStatus === "CONNECTED" && " 🔒"}
              </button>

              {/* BITS 100 - Cyan */}

              <button
                disabled={!isOwner && twitchStatus === "CONNECTED"}
                onClick={() => handleDiscount("BITS_100")}
                className={`w-full py-4 bg-brand-cyan/20 border border-brand-cyan rounded-lg hover:bg-brand-cyan/40 transition-all font-bold text-lg text-brand-cyan ${twitchStatus !== "CONNECTED" ? "opacity-20 cursor-not-allowed" : "opacity-100"}`}
              >
                100_BITS (-${level.rates.bits100} MXN)
                {!isOwner && twitchStatus === "CONNECTED" && " 🔒"}
              </button>

              {/* BITS 500 - Verde */}

              <button
                disabled={!isOwner && twitchStatus === "CONNECTED"}
                onClick={() => handleDiscount("BITS_500")}
                className={`w-full py-4 bg-green-500/20 border border-green-500 rounded-lg hover:bg-green-500/40 transition-all font-bold text-lg text-green-400 ${twitchStatus !== "CONNECTED" ? "opacity-20 cursor-not-allowed" : "opacity-100"}`}
              >
                500_BITS (-${level.rates.bits500} MXN)
                {!isOwner && twitchStatus === "CONNECTED" && " 🔒"}
              </button>

              {/* BITS 1000 - Naranja (Máximo impacto) */}

              <button
                disabled={!isOwner && twitchStatus === "CONNECTED"}
                onClick={() => handleDiscount("BITS_1000")}
                className={`w-full py-4 bg-orange-500/10 border border-orange-500/50 rounded-lg hover:bg-orange-500/20 transition-all font-bold text-lg text-orange-500 ${twitchStatus !== "CONNECTED" ? "opacity-20 cursor-not-allowed" : "opacity-100"}`}
              >
                1000_BITS (-${level.rates.bits1000} MXN)
                {!isOwner && twitchStatus === "CONNECTED" && " 🔒"}
              </button>
            </div>
          </div>
        </div>

        {/* GAME PROGRESS CONTROL */}

        <div
          className={
            !isLive && !isOwner
              ? "opacity-30 grayscale pointer-events-none"
              : ""
          }
        >
          <div className="bg-black/40 border border-brand-cyan/30 p-6 rounded-xl shadow-glow-cyan">
            <h2 className="text-sm mb-6 text-brand-cyan tracking-widest uppercase text-center">
              Mod_Game_Progress
            </h2>

            <div className="flex flex-col items-center">
              <span className="text-5xl font-bold text-brand-cyan mb-8 drop-shadow-[0_0_10px_rgba(0,245,255,0.5)]">
                {progress}%
              </span>

              <div className="flex gap-2 w-full mb-8">
                {[5, 10, 25].map((boost) => (
                  <button
                    key={boost}
                    onClick={() =>
                      handleProgressChange(Math.min(100, progress + boost))
                    }
                    className="flex-1 py-2 bg-brand-cyan/10 border border-brand-cyan/40 rounded text-[10px] hover:bg-brand-cyan/30"
                  >
                    +{boost}%
                  </button>
                ))}
              </div>

              <input
                type="range"
                min="0"
                max="100"
                value={progress}
                onChange={(e) => handleProgressChange(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-brand-cyan mb-4"
              />
            </div>
          </div>
        </div>

        {/* OWNER & MARKETING */}

        {isOwner && (
          <div className="bg-black/40 border border-orange-500/30 p-6 rounded-xl shadow-[0_0_20px_rgba(234,88,12,0.1)]">
            <h2 className="text-sm mb-4 text-orange-500 tracking-widest uppercase italic">
              DEPLOY_OR_RESET
            </h2>

            <p className="text-[9px] text-gray-500 mb-4 font-mono">
              Current Final Price: ${currentPrice} MXN
            </p>

            <button
              onClick={async () => {
                if (confirm("REBOOT SYSTEM?")) {
                  await fetch("/api/auction/reset", { method: "POST" });

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

            <h3 className="text-[10px] text-gray-500 tracking-widest uppercase mb-4">Admin_Activity_Log</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {logs.map((log, i) => (
                <div key={i} className="text-[9px] font-mono flex justify-between border-b border-white/5 pb-1">
                  <span className={log.admin === "Sistema/Twitch" ? "text-brand-cyan" : "text-brand-purple"}>
                    [{log.admin.toUpperCase()}]
                  </span>
                  <span className="text-gray-400">{log.action} (-${log.amount})</span>
                  <span className="text-[8px] text-gray-600">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-black/40 border border-brand-purple/30 p-6 rounded-xl backdrop-blur-md">
          <h2 className="text-sm mb-6 text-brand-cyan tracking-widest uppercase">
            Stream_Assets
          </h2>

          <div className="space-y-6">
            <div>
              <div className="text-[10px] text-brand-cyan mb-2 font-mono uppercase tracking-tighter italic opacity-70">
                Mercado_Pago_Tips
              </div>

              <div className="flex gap-2">
                <input
                  readOnly
                  value="https://link.mercadopago.com.mx/luishongo"
                  className="flex-1 bg-black/60 border border-white/10 p-2 text-[10px] rounded text-gray-400 font-mono"
                />

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      "https://link.mercadopago.com.mx/luishongo",
                    );
                    alert("Link copiado!");
                  }}
                  className="px-3 py-1 bg-brand-cyan/20 border border-brand-cyan/50 text-brand-cyan text-[10px] rounded hover:bg-brand-cyan/40 font-bold tracking-tighter"
                >
                  COPY
                </button>
              </div>
            </div>

            <div>
              <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-tighter">
                Instant_Gaming_Affiliate
              </div>

              <input
                readOnly
                value="https://www.instant-gaming.com/?igr=LuisHongo"
                className="w-full bg-black/60 border border-white/10 p-2 text-[10px] rounded text-gray-400 font-mono"
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
