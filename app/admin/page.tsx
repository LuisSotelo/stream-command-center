"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { getCurrentLevel } from "@/lib/auction-logic";
import * as tmi from "tmi.js";
import { pusherClient } from "@/lib/pusher";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function AdminContent() {
  const { data: session, status } = useSession();
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState(1200);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<any[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

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
  const lastDonationTimeRef = useRef(Date.now());
  const lastLevelChangeTimeRef = useRef(Date.now());
  const lastLevelRef = useRef(level.name);
  const [joaquinMsg, setJoaquinMsg] = useState("");
  const searchParams = useSearchParams();
  const role = searchParams.get("role");

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
        const progData = progRes.ok ? await progRes.json() : { success: false, progress: 0 };
        const mlData = mlRes.ok ? await mlRes.json() : { status: "OFFLINE" };

        if (logsData.success) setLogs(logsData.logs);
        setIsLive(statusData.isLive);
        setTwitchStatus(statusData.connection);
        if (priceData.newPrice) setCurrentPrice(priceData.newPrice);
        if (progData.success) setProgress(progData.progress);
        if (progData.remainingMins) {
            setCooldownRemaining(progData.remainingMins * 60);
          }
        setMlStatus(mlData.status || "OFFLINE");
      } catch (error) {
        console.error("Error sincronizando dashboard:", error);
        setTwitchStatus("OFFLINE");
        setMlStatus("OFFLINE");
      } finally {
        setLoading(false);
      }
    };

    const sendJoaquinSays = async () => {
      if (!joaquinMsg.trim()) return;

      try {
        await fetch("/api/joaquin-speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            message: joaquinMsg,
            admin: session?.user?.name || "Mod" 
          }),
        });
        setJoaquinMsg(""); // Limpiar input
      } catch (error) {
        console.error("Error al hacer hablar a Joaquín:", error);
      }
    };

  // --- 2. EL CEREBRO: JOAQUÍN Y CONEXIONES (Twitch + Pusher) ---
  useEffect(() => {
    if (status !== "authenticated") return;
    fetchData();

    if (session?.user?.email !== process.env.NEXT_PUBLIC_OWNER_EMAIL) {
      console.log("Joaquín ya está en su puesto, no necesitas conectarlo tú.");
      return; 
    }

    if (role === "pregonero") return;
    
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

    if (process.env.NEXT_PUBLIC_TWITCH_BOT_OAUTH) {
    clientRef.current.connect()
            .then(() => setBotStatus("ONLINE"))
            .catch((err) => {
              console.error("Twitch Connection Error:", err);
              setBotStatus("ERROR");
            });
      } else {
          console.warn("⚠️ No se encontró TWITCH_BOT_OAUTH. El bot de comandos no iniciará.");
          setBotStatus("OFFLINE");
      }

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
    const gameChannel = pusherClient.subscribe("game-channel");
    
    // -- Listeners de Pusher --
    channel.bind("admin-log-update", (newLog: any) => {
      setLogs((prev) => [newLog, ...prev].slice(0, 20));
    });

    channel.bind("price-update", (data: any) => {
      if (data.newPrice) {
        setCurrentPrice(data.newPrice);
        
        // 1. Resetear el tiempo de "última donación" (porque el precio se movió)
        lastDonationTimeRef.current = Date.now(); 

        // 2. Lógica para detectar cambio de nivel y resetear el cronómetro de fase
        const newLevel = getCurrentLevel(data.newPrice);
        if (newLevel.name !== lastLevelRef.current) {
          console.log(`🚀 Nivel cambiado de ${lastLevelRef.current} a ${newLevel.name}`);
          lastLevelRef.current = newLevel.name;
          lastLevelChangeTimeRef.current = Date.now();
        }
      }
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

    channel.bind("joaquin-says", (data: any) => {
      // SOLO la instancia del Owner debe ejecutar el envío a Twitch
      if (session?.user?.email === process.env.NEXT_PUBLIC_OWNER_EMAIL) {
        const chName = process.env.NEXT_PUBLIC_TWITCH_CHANNEL || "LuisHongo";
        clientRef.current?.say(chName, `🤖 ${data.message} 🐽`);
      }
    });

    gameChannel.bind("progress-update", (data: any) => {
      if (data.progress !== undefined) {
        setProgress(data.progress);
        setCooldownRemaining(600);
        // Feedback visual opcional
        setErrorMessage("⚠️ ALGUIEN MÁS YA AUMENTÓ EL PROGRESO");
        setTimeout(() => setErrorMessage(null), 3000);
      }
    });

    gameChannel.bind("reset-cooldown", () => {
      setCooldownRemaining(0); // Limpia el cronómetro rojo de golpe
      setErrorMessage("♻️ SISTEMA REINICIADO POR ADMIN");
      setTimeout(() => setErrorMessage(null), 3000);
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

      if (command === '!status' || command === '!info') {
        const curr = levelRef.current;
        const price = currentPriceRef.current;
        
        const statusMsg = `🤖 [ESTADO DEL SISTEMA]: 
          💰 Precio Actual: $${price} MXN | 
          📊 Fase: ${curr.name} | 
          📉 DESCUENTOS: Sub -$${curr.rates.sub} | Prime -$${curr.rates.prime} | 100 Bits -$${curr.rates.bits100} | 500 Bits -$${curr.rates.bits500} | 1000 Bits -$${curr.rates.bits1000}. 
          ¡A darle, mortales! 🐷`;

        clientRef.current?.say(chName, statusMsg);
      }

      if (command === '!joaquin') {
        const wisdom = [
          "🤖 Antes de ser este elegante cerdo de plástico, gobernaba dimensiones que tu cerebro no podría procesar. Ahora solo proceso tus tacañerías. 🐷",
          "🤖 ¿Por qué los humanos usan pantalones? Es una costumbre ineficiente que limita el flujo de bits. Ridículo. 🐽",
          "🤖 Mi color púrpura no es pintura, es el resplandor de mi energía cósmica atrapada en PVC de alta calidad. Admírenme. ✨",
          "🤖 He visto el fin del universo y les aviso: no hay sushi al final. Así que donen ahora. 🍣",
          "🤖 Ustedes lo llaman 'programación', yo lo llamo 'intentar que una roca piense'. Seta y bolillo lo hacen mejor que ustedes. 🐕‍🦺",
          "🤖 ¿Sabiduría? Solo tengo una verdad: el precio baja si sueltas los bits. Todo lo demás es ruido humano. 💅",
          "🤖 Me convertí en juguete para burlarme de sus costumbres desde su propia estantería. Los observo mientras duermen. 🐽"
        ];
        clientRef.current?.say(chName, `🤖 ${wisdom[Math.floor(Math.random()*wisdom.length)]} 🐷`);
      }
    });

    return () => {
      pusherClient.unsubscribe("auction-channel");
      pusherClient.unsubscribe("game-channel");
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

  // --- CRONÓMETRO DE PRECISIÓN ---
  useEffect(() => {
    if (cooldownRemaining <= 0) return;

    const timer = setInterval(() => {
      setCooldownRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownRemaining > 0]);

  const isOwner = session?.user?.email === process.env.NEXT_PUBLIC_OWNER_EMAIL || (session as any)?.user?.id === process.env.NEXT_PUBLIC_OWNER_ID;

  const handleDiscount = async (type: string) => {
    if (twitchStatus === "CONNECTED") {
      setErrorMessage("ℹ️ INTEGRACIÓN ACTIVA: Twitch está procesando los descuentos automáticamente.");
      setTimeout(() => setErrorMessage(null), 4000);
      
      // Opcional: Si quieres que los MODS no puedan picar nada si Twitch va bien, descomenta esto:
      // if (!isOwner) return; 
    }
    
    if (!isLive && !isOwner) {
      setErrorMessage("⚠️ EL SISTEMA ESTÁ BLOQUEADO: EL STREAM NO ESTÁ ACTIVO.");
      setTimeout(() => setErrorMessage(null), 5000); // Se quita en 5 seg
      return;
    }
    try {
      const res = await fetch("/api/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, user: session?.user?.name || "Admin" }),
      });

      if (res.status === 403) {
      setErrorMessage("🚫 ACCESO DENEGADO: DEBES ESTAR EN VIVO PARA MODIFICAR EL PRECIO.");
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }

      const data = await res.json();
      if (data.success) setCurrentPrice(data.newPrice);
    } catch (error) { console.error("Error:", error); }
  };

  const handleProgressChange = async (newValue: number) => {
    // 1. Si ya hay un cooldown activo, no hacemos nada
    if (cooldownRemaining > 0) return;

    // 2. Validaciones rápidas con mensajes temporales
    const diff = newValue - progress;

    if (newValue < progress) {
      setErrorMessage("⚠️ ERROR: NO PUEDES RETROCEDER LA HISTORIA.");
      setTimeout(() => setErrorMessage(null), 3000); // Desaparece en 3 seg
      return;
    }

    if (diff > 20) {
      setErrorMessage("⚠️ ERROR: SALTO DEMASIADO GRANDE (MÁX 20%).");
      setTimeout(() => setErrorMessage(null), 3000); // Desaparece en 3 seg
      return;
    }

    try {
      const res = await fetch("/api/game-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" }, // Importante añadir esto
        body: JSON.stringify({ 
          progress: newValue, 
          admin: session?.user?.name || "Admin" 
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Si la API rechaza por Cooldown (429), bloqueamos el UI
        if (res.status === 429) {
          setCooldownRemaining(data.remainingMins * 60 || 600);
        }
        setErrorMessage(data.message);
        setTimeout(() => setErrorMessage(null), 5000);
        return;
      }

      // ÉXITO: El backend ya disparó el evento a Pusher, 
      // pero actualizamos local para feedback instantáneo
            setProgress(newValue);
            setCooldownRemaining(600); // 10 minutos
          } catch (e) {
            setErrorMessage("❌ ERROR CRÍTICO DE CONEXIÓN.");
            setTimeout(() => setErrorMessage(null), 3000);
          }
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 md:mb-12 border-b border-brand-purple/20 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-purple tracking-tighter">
            STREAM_COMMAND_CENTER
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
            <p className="w-full md:w-auto text-[10px] text-brand-cyan uppercase tracking-widest border-b border-brand-cyan/10 md:border-none pb-1 md:pb-0">
              Operator: {session?.user?.name} | Phase: {level.name}
            </p>
            {/* LABELS DE ESTATUS */}
            <div
              className={`flex flex-wrap items-center gap-2 mt-2 px-2 py-0.5 rounded border ${
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
              className={`flex flex-wrap items-center gap-2 mt-2 px-2 py-0.5 rounded border ${
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
              className={`flex flex-wrap items-center gap-2 mt-2 px-2 py-0.5 rounded border ${
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

      {errorMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-md animate-bounce">
          <div className="bg-red-600 text-white px-6 py-3 rounded-full shadow-2xl border-2 border-white/20 text-center font-bold text-xs tracking-widest">
            {errorMessage}
          </div>
        </div>
      )}

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
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-sm text-brand-cyan tracking-widest uppercase italic">
                Auction_Direct_Input
              </h2>
              {twitchStatus === "CONNECTED" && (
                <span className="text-[8px] text-green-400 animate-pulse font-black border border-green-500/30 px-2 py-0.5 rounded">
                  AUTO_SYNC_ON
                </span>
              )}
            </div>

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

        {/* PROGRESO DE JUEGO Y JOAQUÍN TRANSMITER */}
        <div
          className={
            !isLive && !isOwner
              ? "opacity-30 grayscale pointer-events-none"
              : ""
          }
        >
          {/* GAME PROGRESS CONTROL */}
         <div className={`relative bg-black/40 border transition-all duration-500 p-6 rounded-xl ${cooldownRemaining > 0 ? 'border-red-500/50 shadow-glow-red' : 'border-brand-cyan/30 shadow-glow-cyan'}`}>
  
          <h2 className="text-[10px] mb-6 text-brand-cyan tracking-widest uppercase text-center font-black italic">
            {cooldownRemaining > 0 ? '⚠️ SYSTEM_LOCKDOWN_ACTIVE' : 'Mod_Game_Progress'}
          </h2>

          <div className="flex flex-col items-center">
            {/* Porcentaje: Cambia a rojo si está bloqueado */}
            <span className={`text-6xl font-black mb-8 transition-colors duration-500 ${cooldownRemaining > 0 ? 'text-red-500' : 'text-brand-cyan drop-shadow-glow'}`}>
              {progress}%
            </span>

            {/* Botones de Boost: Se deshabilitan totalmente */}
            <div className="grid grid-cols-3 gap-2 w-full mb-8">
              {[5, 10, 20].map((boost) => (
                <button
                  key={boost}
                  disabled={cooldownRemaining > 0 || progress + boost > 100}
                  onClick={() => handleProgressChange(progress + boost)}
                  className="py-3 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold hover:bg-brand-cyan/20 hover:border-brand-cyan disabled:opacity-5 disabled:cursor-not-allowed transition-all"
                >
                  +{boost}%
                </button>
              ))}
            </div>

            {/* Slider: Bloqueado si hay cooldown */}
            <input
              type="range"
              min="0"
              max="100"
              value={progress}
              disabled={cooldownRemaining > 0}
              onChange={(e) => handleProgressChange(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-brand-cyan disabled:accent-red-600 disabled:opacity-20"
            />
            
            {/* Mensaje de Persistencia: Solo se ve si hay Cooldown */}
            {cooldownRemaining > 0 && (
              <div className="mt-6 p-3 border border-red-500/30 bg-red-500/5 rounded-md w-full text-center animate-pulse">
                <p className="text-[10px] text-red-500 font-black tracking-tighter">
                  ALTO AHÍ: SISTEMA SOBRECALENTADO
                </p>
                <p className="text-[9px] text-red-400/70 mt-1 font-mono">
                  PROTOCOLO_SEGURIDAD: {Math.floor(cooldownRemaining / 60)}m {cooldownRemaining % 60}s restantes
                </p>
              </div>
            )}
          </div>
        </div>

        {/* JOAQUÍN TRANSMITER */}
          <div className="mt-8 relative group max-w-full">
            {/* Glow optimizado para no romper el ancho en mobile */}
            <div className="absolute -inset-0 bg-gradient-to-r from-brand-purple to-brand-cyan opacity-10 group-hover:opacity-30 transition duration-1000 blur-sm rounded-xl"></div>
            
            <div className="relative bg-[#0a0a0a] border border-brand-purple/40 p-4 md:p-6 rounded-xl shadow-[0_0_15px_rgba(168,85,247,0.1)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-purple opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-purple"></span>
                  </span>
                  <h3 className="text-[10px] md:text-[11px] text-brand-purple uppercase font-black tracking-widest">
                    Joaquín_Transmitter
                  </h3>
                </div>
                <span className="hidden sm:inline text-[8px] text-brand-purple/50 font-mono">JOAQUIN_PROT_V1</span>
              </div>

              {/* Flex-col en mobile, Flex-row en desktop */}
              <div className="flex flex-col md:flex-row gap-3">
                <input 
                  type="text" 
                  value={joaquinMsg}
                  onChange={(e) => setJoaquinMsg(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendJoaquinSays()}
                  placeholder="Mensaje porcino..."
                  className="bg-black/80 border border-brand-purple/30 rounded-lg px-4 py-3 text-xs flex-1 focus:outline-none focus:border-brand-purple text-brand-purple placeholder:text-brand-purple/30 font-mono transition-all w-full"
                />
                <button 
                  onClick={sendJoaquinSays}
                  className="w-full md:w-auto bg-brand-purple/10 hover:bg-brand-purple hover:text-white text-brand-purple px-6 py-3 rounded-lg text-[10px] transition-all duration-300 border border-brand-purple font-black tracking-widest uppercase shadow-[0_0_10px_rgba(168,85,247,0.2)]"
                >
                  ENVIAR
                </button>
              </div>
              
              <div className="flex justify-between items-center mt-4">
                <p className="text-[7px] md:text-[8px] text-gray-500 italic uppercase">
                  ⚠️ LO QUE ESCRIBAS AQUÍ, JOAQUÍN LO DIRÁ, TEN CUIDADO.
                </p>
                <div className="flex gap-1">
                  <div className="w-1 h-1 bg-brand-purple/30"></div>
                  <div className="w-1 h-1 bg-brand-purple/60"></div>
                  <div className="w-1 h-1 bg-brand-purple"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* COMANDOS */}
        <div className="bg-black/40 border border-brand-cyan/20 p-6 rounded-xl col-span-1 md:col-span-2">
          <h2 className="text-[10px] mb-4 text-brand-cyan tracking-widest uppercase italic opacity-80">
            // MOD_COMMAND_DATABASE
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border border-white/5 p-3 rounded bg-white/5">
              <code className="text-brand-purple text-xs font-bold">!precio</code>
              <p className="text-[9px] text-gray-400 mt-1">Consulta el precio actual de la subasta en tiempo real.</p>
            </div>

            <div className="border border-white/5 p-3 rounded bg-white/5">
              <code className="text-brand-purple text-xs font-bold">!top</code>
              <p className="text-[9px] text-gray-400 mt-1">Muestra al MVP (donador máximo) y su impacto en la subasta.</p>
            </div>

            <div className="border border-white/5 p-3 rounded bg-white/5">
              <code className="text-brand-purple text-xs font-bold">!status</code>
              <p className="text-[9px] text-gray-400 mt-1">Resumen total: Fase, precio y tabla de descuentos vigentes.</p>
            </div>

            <div className="border border-white/5 p-3 rounded bg-white/5">
              <code className="text-brand-purple text-xs font-bold">!joaquin</code>
              <p className="text-[9px] text-gray-400 mt-1">Invoca la sabiduría cínica y pasivo-agresiva de la deidad porcina.</p>
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

// El export default ahora será este:
export default function AdminDashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-brand-cyan font-mono italic">
        INITIALIZING_SYSTEM_CONTEXT...
      </div>
    }>
      <AdminContent />
    </Suspense>
  );
}
