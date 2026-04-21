"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect, useRef, Suspense } from "react";
import { getCurrentLevel } from "@/lib/auction-logic";
import * as tmi from "tmi.js";
import { pusherClient } from "@/lib/pusher";
import { useSearchParams } from "next/navigation";

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
  const announcementIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  // Ref para pokeapi
  const [pokemonTeam, setPokemonTeam] = useState(["", "", "", "", "", ""]);
  const lastPokeExecutionRef = useRef<number>(0);

  // Refs para Brainrot
  const [brainrotUrl, setBrainrotUrl] = useState("");
  const [brainrotPlaylist, setBrainrotPlaylist] = useState<string[]>([]);
  const [brainrotCooldown, setBrainrotCooldown] = useState(0);

  const isOwner =
    session?.user?.email === process.env.NEXT_PUBLIC_OWNER_EMAIL ||
    (session as any)?.user?.id === process.env.NEXT_PUBLIC_OWNER_ID;

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

  const fetchData = async () => {
    try {
      const [logsRes, statusRes, priceRes, progRes, mlRes, teamRes] = await Promise.all([
        fetch("/api/admin/logs"),
        fetch("/api/twitch/status"),
        fetch("/api/price"),
        fetch("/api/game-progress"),
        fetch("/api/ml/status"),
        fetch("/api/pokemon/team"),
      ]);

      const logsData = logsRes.ok ? await logsRes.json() : { success: false, logs: [] };
      const statusData = statusRes.ok
        ? await statusRes.json()
        : { isLive: false, connection: "OFFLINE" };
      const priceData = priceRes.ok ? await priceRes.json() : {};
      const progData = progRes.ok ? await progRes.json() : { success: false, progress: 0 };
      const mlData = mlRes.ok ? await mlRes.json() : { status: "OFFLINE" };
      const teamData = teamRes.ok ? await teamRes.json() : null;

      if (teamData && teamData.team) {
        const namesOnly = teamData.team.map((p: any) =>
          typeof p === "string" ? p : p.name,
        );
        setPokemonTeam(namesOnly);
      } else {
        setPokemonTeam(["Vacío", "Vacío", "Vacío", "Vacío", "Vacío", "Vacío"]);
      }

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

  const loadBrainrotData = async () => {
    try {
      const [playlistRes, cooldownRes] = await Promise.all([
        fetch("/api/brainrot"),
        fetch("/api/brainrot/check-cooldown"),
      ]);

      const playlistData = await playlistRes.json();
      const cooldownData = await cooldownRes.json();

      setBrainrotPlaylist(playlistData.playlist || []);
      if (cooldownData.remaining > 0) setBrainrotCooldown(cooldownData.remaining);
    } catch (error) {
      console.error("Error cargando módulo Brainrot:", error);
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
          admin: session?.user?.name || "Mod",
        }),
      });

      setJoaquinMsg("");
    } catch (error) {
      console.error("Error al hacer hablar a Joaquín:", error);
    }
  };

  const saveTeam = async (newTeam: string[]) => {
    setLoading(true);
    try {
      const teamWithSprites = await Promise.all(
        newTeam.map(async (name) => {
          const cleanName = name.trim().toLowerCase();

          if (!cleanName || cleanName === "vacío") {
            return { name: "Vacío", sprite: "" };
          }

          try {
            const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${cleanName}`);
            if (!res.ok) return { name, sprite: "" };

            const data = await res.json();
            const animatedSprite =
              data.sprites.versions["generation-v"]["black-white"].animated.front_default;
            const finalSprite = animatedSprite || data.sprites.front_default;

            return { name, sprite: finalSprite };
          } catch {
            return { name, sprite: "" };
          }
        }),
      );

      await fetch("/api/pokemon/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team: teamWithSprites,
          user: session?.user?.name || "Admin",
        }),
      });

      setErrorMessage("✅ EQUIPO SINCRONIZADO Y SPRITES CACHEADOS");
      setTimeout(() => setErrorMessage(null), 3000);
    } catch (error) {
      console.error("Error al guardar el equipo:", error);
      setErrorMessage("❌ ERROR AL GUARDAR");
    } finally {
      setLoading(false);
    }
  };

  // --- ÚNICO EFFECT DEL BOT TMI ---
  useEffect(() => {
    if (status !== "authenticated") return;

    fetchData();

    if (session?.user?.email !== process.env.NEXT_PUBLIC_OWNER_EMAIL) {
      console.log("Joaquín ya está en su puesto, no necesitas conectarlo tú.");
      return;
    }

    if (role === "pregonero") return;

    if (clientRef.current) {
      console.log("⚠️ Joaquín ya está inicializado, evitando duplicado.");
      return;
    }

    clientRef.current = new tmi.Client({
      options: { debug: false },
      connection: {
        reconnect: true,
        secure: true,
      },
      identity: {
        username: "ChanchoJoaquin",
        password: process.env.NEXT_PUBLIC_TWITCH_BOT_OAUTH || "",
      },
      channels: [process.env.NEXT_PUBLIC_TWITCH_CHANNEL || "LuisHongo"],
    });

    const startPregonero = () => {
      if (announcementIntervalRef.current) {
        clearInterval(announcementIntervalRef.current);
        announcementIntervalRef.current = null;
      }

      // 1. Mensaje de bienvenida INMEDIATO al conectar
      setTimeout(() => {
        if (clientRef.current && isLiveRef.current) {
          const ch = process.env.NEXT_PUBLIC_TWITCH_CHANNEL || "LuisHongo";
          clientRef.current.say(ch, `🤖 [SISTEMA]: Protocolo de Subasta Inversa v5.0 ONLINE. Precio: $${currentPriceRef.current} MXN. ¡A darle! 🐷`);
        }
      }, 5000); // Esperamos 5 seg a que termine de conectar bien

      announcementIntervalRef.current = setInterval(() => {
        // IMPORTANTE: Aquí leemos clientRef.current JUSTO en el momento del envío
        const activeClient = clientRef.current;
        
        if (!activeClient || !isLiveRef.current) return;

        const channelName = process.env.NEXT_PUBLIC_TWITCH_CHANNEL || "LuisHongo";
        const currentLevel = levelRef.current;
        const price = currentPriceRef.current;
        const now = Date.now();

        const minsSinceDonation = (now - lastDonationTimeRef.current) / 60000;
        const minsInLevel = (now - lastLevelChangeTimeRef.current) / 60000;

        let msg = "";

        if (minsInLevel >= 120) {
          const savageLevelQuotes = [
            `🤖 [ESTADO CRÍTICO]: Llevamos más de dos horas en la Fase ${currentLevel.name}. ¿Ocupan un tutorial para usar la tarjeta? 🐷`,
            `🤖 [ESTADO CRÍTICO]: A este paso, el Pokémon Z-A va a ser retro antes de que bajen de nivel. 🐽`,
            `🤖 [ESTADO CRÍTICO]: ¿Siguen aquí? Su generosidad está bajo cero. 💅`,
          ];
          msg = savageLevelQuotes[Math.floor(Math.random() * savageLevelQuotes.length)];
        } else if (minsSinceDonation >= 60) {
          const stingyQuotes = [
            "🤖 [AVISO]: 60 minutos de silencio financiero. El chat parece un museo. 🖼️",
            "🤖 [AVISO]: Suelten unos bits o una sub, que Luis no vive de puro aire. 🍱",
            "🤖 [AVISO]: Mi corazón de cerdo dice que son MUY tacaños. ¡Muevan el precio! 🐽",
          ];
          msg = stingyQuotes[Math.floor(Math.random() * stingyQuotes.length)];
        } else {
          msg = `🤖 [SISTEMA]: ¡Subasta activa! Estamos en ${currentLevel.name} ($${price} MXN). 📉 DESCUENTOS: Sub T1 -$${currentLevel.rates.sub} | Prime -$${currentLevel.rates.prime} | 100 Bits -$${currentLevel.rates.bits100} | 500 Bits -$${currentLevel.rates.bits500} | 1000 Bits -$${currentLevel.rates.bits1000}. 🚀`;
        }

        activeClient.say(channelName, msg);
      }, 12 * 60 * 1000); // 12 minutos exactos
    };

    if (process.env.NEXT_PUBLIC_TWITCH_BOT_OAUTH) {
      clientRef.current
        .connect()
        .then(() => {
          setBotStatus("ONLINE");
          startPregonero();
        })
        .catch((err) => {
          console.error("Twitch Connection Error:", err);
          setBotStatus("ERROR");
        });
    } else {
      console.warn("⚠️ No se encontró TWITCH_BOT_OAUTH. El bot de comandos no iniciará.");
      setBotStatus("OFFLINE");
    }

    clientRef.current.on("reconnect", () => {
      setBotStatus("RECONNECTING");
      console.log("🔄 Joaquín está intentando reconectar...");
    });

    clientRef.current.on("connected", () => {
      setBotStatus("ONLINE");
    });

    clientRef.current.on("disconnected", (reason) => {
      setBotStatus("OFFLINE");
      console.warn("⚠️ Joaquín desconectado:", reason);
    });

    const channel = pusherClient.subscribe("auction-channel");
    const gameChannel = pusherClient.subscribe("game-channel");

    channel.bind("admin-log-update", (newLog: any) => {
      setLogs((prev) => [newLog, ...prev].slice(0, 20));
    });

    channel.bind("price-update", (data: any) => {
      if (data.newPrice) {
        setCurrentPrice(data.newPrice);
        lastDonationTimeRef.current = Date.now();

        const newLevel = getCurrentLevel(data.newPrice);
        if (newLevel.name !== lastLevelRef.current) {
          console.log(`🚀 Nivel cambiado de ${lastLevelRef.current} a ${newLevel.name}`);
          lastLevelRef.current = newLevel.name;
          lastLevelChangeTimeRef.current = Date.now();
        }
      }
    });

    channel.bind("joaquin-troll", (data: any) => {
      clientRef.current?.say(
        process.env.NEXT_PUBLIC_TWITCH_CHANNEL || "LuisHongo",
        `🤖 ${data.message} 🐷`,
      );
    });

    channel.bind("start-countdown", (data: any) => {
      playSound("suspense-countdown.mp3");

      const channelName = process.env.NEXT_PUBLIC_TWITCH_CHANNEL || "LuisHongo";
      let counter = data.seconds;

      clientRef.current?.say(channelName, "🚨 ¡SISTEMA INICIADO! El link se libera en...");

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      countdownIntervalRef.current = setInterval(() => {
        if (counter > 0) {
          clientRef.current?.say(channelName, `⏳ ${counter}...`);
          counter--;
        } else {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }

          clientRef.current?.say(
            channelName,
            `🏆 ¡PRECIO FINAL: $${data.finalPrice} MXN! COMPRA AQUÍ: ${data.mlLink}`,
          );
        }
      }, 1000);
    });

    channel.bind("joaquin-says", (data: any) => {
      if (session?.user?.email === process.env.NEXT_PUBLIC_OWNER_EMAIL) {
        const chName = process.env.NEXT_PUBLIC_TWITCH_CHANNEL || "LuisHongo";
        clientRef.current?.say(chName, `🤖 ${data.message} 🐽`);
      }
    });

    gameChannel.bind("reset-brainrot-cooldown", () => {
      setBrainrotCooldown(0);
      setErrorMessage("✅ VIDEO FINALIZADO: ESCÁNER LISTO");
      setTimeout(() => setErrorMessage(null), 2000);
    });

    gameChannel.bind("playlist-updated", () => {
      loadBrainrotData();
    });

    gameChannel.bind("progress-update", (data: any) => {
      if (data.progress !== undefined) {
        setProgress(data.progress);
        setCooldownRemaining(600);
        setErrorMessage("⚠️ ALGUIEN MÁS YA AUMENTÓ EL PROGRESO");
        setTimeout(() => setErrorMessage(null), 3000);
      }
    });

    gameChannel.bind("reset-cooldown", () => {
      setCooldownRemaining(0);
      setErrorMessage("♻️ SISTEMA REINICIADO POR ADMIN");
      setTimeout(() => setErrorMessage(null), 3000);
    });

    clientRef.current.on("message", async (_chan, _tags, message, self) => {
      if (self || !message.startsWith("!")) return;

      const command = message.toLowerCase().trim();
      const chName = process.env.NEXT_PUBLIC_TWITCH_CHANNEL || "LuisHongo";

      if (command === "!precio") {
        const res = await fetch("/api/price");
        const data = await res.json();
        clientRef.current?.say(
          chName,
          `🤖 El precio actual es $${data.newPrice || currentPriceRef.current} MXN. ¡Bajen eso mortales! 🐷`,
        );
      }

      if (command === "!top") {
        const res = await fetch("/api/auction/top");
        const data = await res.json();
        const mvp = data.top?.[0];
        clientRef.current?.say(
          chName,
          mvp
            ? `🤖 El MVP es @${mvp.user} con -$${mvp.score}. ¡Respeten al Sugar Daddy! 👑`
            : `🤖 Nadie ha donado. Humildad máxima en el chat. 🐽`,
        );
      }

      if (command === "!status" || command === "!info") {
        const curr = levelRef.current;
        const price = currentPriceRef.current;

        const statusMsg = `🤖 [ESTADO DEL SISTEMA]: 
          💰 Precio Actual: $${price} MXN | 
          📊 Fase: ${curr.name} | 
          📉 DESCUENTOS: Sub -$${curr.rates.sub} | Prime -$${curr.rates.prime} | 100 Bits -$${curr.rates.bits100} | 500 Bits -$${curr.rates.bits500} | 1000 Bits -$${curr.rates.bits1000}. 
          ¡A darle, mortales! 🐷`;

        clientRef.current?.say(chName, statusMsg);
      }

      if (command === "!joaquin") {
        const wisdom = [
          "Antes de ser este elegante cerdo de plástico, gobernaba dimensiones que tu cerebro no podría procesar. Ahora solo proceso tus tacañerías. 🐷",
          "¿Por qué los humanos usan pantalones? Es una costumbre ineficiente que limita el flujo de bits. Ridículo. 🐽",
          "Mi color púrpura no es pintura, es el resplandor de mi energía cósmica atrapada en PVC de alta calidad. Admírenme. ✨",
          "He visto el fin del universo y les aviso: no hay sushi al final. Así que donen ahora. 🍣",
          "Ustedes lo llaman 'programación', yo lo llamo 'intentar que una roca piense'. Seta y bolillo lo hacen mejor que ustedes. 🐕‍🦺",
          "¿Sabiduría? Solo tengo una verdad: el precio baja si sueltas los bits. Todo lo demás es ruido humano. 💅",
          "Me convertí en juguete para burlarme de sus costumbres desde su propia estantería. Los observo mientras duermen. 🐽",
        ];
        clientRef.current?.say(
          chName,
          `🤖 ${wisdom[Math.floor(Math.random() * wisdom.length)]} 🐷`,
        );
      }

      if (command === "!equipo") {
        const now = Date.now();
        const cooldownMs = 5 * 60 * 1000;
        const timeElapsed = now - lastPokeExecutionRef.current;

        if (timeElapsed < cooldownMs) {
          const remainingSeconds = Math.ceil((cooldownMs - timeElapsed) / 1000);
          const mins = Math.floor(remainingSeconds / 60);
          const secs = remainingSeconds % 60;

          clientRef.current?.say(
            chName,
            `🤖 [ENFRIAMIENTO]: ¡Cálmense, mortales! El escáner de la Pokédex se está recargando. Esperen ${mins}m ${secs}s. 🐽`,
          );
          return;
        }

        lastPokeExecutionRef.current = Date.now();

        try {
          const res = await fetch("/api/pokemon/team");
          const data = await res.json();
          const teamArray = data.team || [];

          const teamString = teamArray
            .filter((p: any) => p.name && p.name !== "Vacío")
            .map((p: any) => p.name)
            .join(", ");

          await fetch("/api/pokemon/show-team", { method: "POST" });

          const finalMsg = teamString
            ? `🤖 [SISTEMA]: Escaneando señales... Equipo de Luis: ${teamString} 🐽`
            : `🤖 [SISTEMA]: ¡Sin datos en el escáner! Luis está jugando solo. 🐽`;

          clientRef.current?.say(chName, finalMsg);
        } catch (err) {
          console.error("Error en comando equipo:", err);
        }
      }
    });

    return () => {
      pusherClient.unsubscribe("auction-channel");
      pusherClient.unsubscribe("game-channel");

      if (announcementIntervalRef.current) {
        clearInterval(announcementIntervalRef.current);
        announcementIntervalRef.current = null;
      }

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      if (clientRef.current) {
        clientRef.current.removeAllListeners();
        clientRef.current.disconnect();
        clientRef.current = null;
      }

      setBotStatus("OFFLINE");
    };
  }, [status, session?.user?.email, role]);

  useEffect(() => {
    const checkML = async () => {
      try {
        const res = await fetch("/api/ml/status");
        const data = await res.json();
        setMlStatus(data.status);
      } catch (error) {
        console.error("Error consultando ML:", error);
        setMlStatus("OFFLINE");
      }
    };

    if (status === "authenticated") {
      checkML();
      const interval = setInterval(checkML, 300000);
      return () => clearInterval(interval);
    }
  }, [status]);

  useEffect(() => {
    if (status === "authenticated") {
      loadBrainrotData();
    }
  }, [status]);

  useEffect(() => {
    if (brainrotCooldown <= 0) return;

    const timer = setInterval(() => {
      setBrainrotCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [brainrotCooldown]);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;

    const timer = setInterval(() => {
      setCooldownRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownRemaining > 0]);

  const addVideoToPlaylist = async () => {
    if (!brainrotUrl) return;

    try {
      const urlSinParametros = brainrotUrl.trim().split("?")[0];
      const isValidVideo =
        urlSinParametros.toLowerCase().endsWith(".mp4") ||
        urlSinParametros.toLowerCase().endsWith(".webm");

      if (!isValidVideo) {
        setErrorMessage("❌ ERROR: EL ENLACE DEBE TERMINAR EN .MP4 o .WEBM");
        setTimeout(() => setErrorMessage(null), 4000);
        return;
      }

      const res = await fetch("/api/brainrot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: brainrotUrl.trim() }),
      });

      if (res.ok) {
        setBrainrotUrl("");
        loadBrainrotData();
        setErrorMessage("✅ VIDEO AÑADIDO (VALIDACIÓN EXITOSA)");
        setTimeout(() => setErrorMessage(null), 2000);
      }
    } catch {
      setErrorMessage("❌ ERROR CRÍTICO AL PROCESAR URL");
      setTimeout(() => setErrorMessage(null), 4000);
    }
  };

  const triggerRandomVideo = async () => {
    try {
      const res = await fetch("/api/brainrot/trigger", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(`⚠️ ${data.error}`);
        setTimeout(() => setErrorMessage(null), 4000);
        if (data.remaining) setBrainrotCooldown(data.remaining);
      } else {
        setErrorMessage(`🧠 VIDEO LANZADO: ${data.videoUrl.substring(0, 20)}...`);
        setTimeout(() => setErrorMessage(null), 3000);
        setBrainrotCooldown(180);
      }
    } catch {
      setErrorMessage("❌ ERROR AL DISPARAR BRAINROT");
    }
  };

  const deleteVideo = async (url: string) => {
    await fetch("/api/brainrot/delete", {
      method: "POST",
      body: JSON.stringify({ videoUrl: url }),
    });
    loadBrainrotData();
  };

  const handleDiscount = async (type: string) => {
    if (twitchStatus === "CONNECTED" && !isOwner) {
      setErrorMessage("ℹ️ INTEGRACIÓN ACTIVA: Twitch está procesando los descuentos automáticamente.");
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    if (!isLive && !isOwner) {
      setErrorMessage("⚠️ EL SISTEMA ESTÁ BLOQUEADO: EL STREAM NO ESTÁ ACTIVO.");
      setTimeout(() => setErrorMessage(null), 5000);
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
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleProgressChange = async (newValue: number) => {
    if (cooldownRemaining > 0) return;

    const diff = newValue - progress;

    if (newValue < progress) {
      setErrorMessage("⚠️ ERROR: NO PUEDES RETROCEDER LA HISTORIA.");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    if (diff > 20) {
      setErrorMessage("⚠️ ERROR: SALTO DEMASIADO GRANDE (MÁX 20%).");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    try {
      const res = await fetch("/api/game-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progress: newValue,
          admin: session?.user?.name || "Admin",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setCooldownRemaining(data.remainingMins * 60 || 600);
        }
        setErrorMessage(data.message);
        setTimeout(() => setErrorMessage(null), 5000);
        return;
      }

      setProgress(newValue);
      setCooldownRemaining(600);
    } catch {
      setErrorMessage("❌ ERROR CRÍTICO DE CONEXIÓN.");
      setTimeout(() => setErrorMessage(null), 3000);
    }
  };

  const handleFinalizeAuction = async () => {
    if (!confirm("¿Estás seguro de finalizar la subasta? Esto activará la cuenta regresiva en vivo.")) return;

    try {
      await fetch("/api/auction/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error al finalizar:", error);
    }
  };

  const handleTeamMemberChange = (index: number, value: string) => {
    const newTeam = [...pokemonTeam];
    newTeam[index] = value;
    setPokemonTeam(newTeam);
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
                className={`w-1.5 h-1.5 rounded-full ${
                  botStatus === "ONLINE"
                    ? "bg-green-400 animate-pulse"
                    : botStatus === "RECONNECTING"
                      ? "bg-yellow-400 animate-bounce"
                      : "bg-red-500"
                }`}
              />
              <span className="text-[8px] font-bold">JOAQUIN_{botStatus}</span>
            </div>

            <div
              className={`flex flex-wrap items-center gap-2 mt-2 px-2 py-0.5 rounded border ${
                mlStatus === "CONNECTED"
                  ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
                  : "border-red-500/50 bg-red-500/10 text-red-400"
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  mlStatus === "CONNECTED" ? "bg-yellow-400 animate-pulse" : "bg-red-500"
                }`}
              />
              <span className="text-[8px] font-bold uppercase">ML_{mlStatus}</span>
            </div>

            <div
              className={`flex flex-wrap items-center gap-2 mt-2 px-2 py-0.5 rounded border ${
                twitchStatus === "CONNECTED"
                  ? "border-brand-purple/50 bg-brand-purple/10 text-brand-purple"
                  : "border-red-500/50 bg-red-500/10 text-red-400"
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  twitchStatus === "CONNECTED" ? "bg-brand-purple animate-pulse" : "bg-red-500"
                }`}
              />
              <span className="text-[8px] font-bold uppercase">TWITCH_{twitchStatus}</span>
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

      {!isLive && !isOwner && !loading && (
        <div className="mb-8 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-center animate-pulse">
          <p className="text-red-400 text-sm font-bold tracking-widest">
            ⚠️ [SISTEMA_BLOQUEADO]: ESPERANDO_STREAM_ACTIVO
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          className={`transition-all duration-500 ${
            (!isLive && !isOwner) || twitchStatus !== "CONNECTED"
              ? "opacity-30 grayscale pointer-events-none"
              : "opacity-100"
          }`}
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
              <button
                disabled={!isOwner && twitchStatus === "CONNECTED"}
                onClick={() => handleDiscount("PRIME")}
                className={`w-full py-4 bg-blue-500/10 border border-blue-500/50 rounded-lg hover:bg-blue-500/30 transition-all font-bold text-lg text-blue-400 ${
                  twitchStatus !== "CONNECTED" ? "opacity-20 cursor-not-allowed" : "opacity-100"
                }`}
              >
                PRIME_DETECTED (-${level.rates.prime} MXN)
                {!isOwner && twitchStatus === "CONNECTED" && " 🔒"}
              </button>

              <button
                disabled={!isOwner && twitchStatus === "CONNECTED"}
                onClick={() => handleDiscount("SUB")}
                className={`w-full py-4 bg-brand-purple/20 border border-brand-purple rounded-lg hover:bg-brand-purple/40 transition-all font-bold text-lg ${
                  twitchStatus !== "CONNECTED" ? "opacity-20 cursor-not-allowed" : "opacity-100"
                }`}
              >
                SUB_DETECTED (-${level.rates.sub} MXN)
                {!isOwner && twitchStatus === "CONNECTED" && " 🔒"}
              </button>

              <button
                disabled={!isOwner && twitchStatus === "CONNECTED"}
                onClick={() => handleDiscount("BITS_100")}
                className={`w-full py-4 bg-brand-cyan/20 border border-brand-cyan rounded-lg hover:bg-brand-cyan/40 transition-all font-bold text-lg text-brand-cyan ${
                  twitchStatus !== "CONNECTED" ? "opacity-20 cursor-not-allowed" : "opacity-100"
                }`}
              >
                100_BITS (-${level.rates.bits100} MXN)
                {!isOwner && twitchStatus === "CONNECTED" && " 🔒"}
              </button>

              <button
                disabled={!isOwner && twitchStatus === "CONNECTED"}
                onClick={() => handleDiscount("BITS_500")}
                className={`w-full py-4 bg-green-500/20 border border-green-500 rounded-lg hover:bg-green-500/40 transition-all font-bold text-lg text-green-400 ${
                  twitchStatus !== "CONNECTED" ? "opacity-20 cursor-not-allowed" : "opacity-100"
                }`}
              >
                500_BITS (-${level.rates.bits500} MXN)
                {!isOwner && twitchStatus === "CONNECTED" && " 🔒"}
              </button>

              <button
                disabled={!isOwner && twitchStatus === "CONNECTED"}
                onClick={() => handleDiscount("BITS_1000")}
                className={`w-full py-4 bg-orange-500/10 border border-orange-500/50 rounded-lg hover:bg-orange-500/20 transition-all font-bold text-lg text-orange-500 ${
                  twitchStatus !== "CONNECTED" ? "opacity-20 cursor-not-allowed" : "opacity-100"
                }`}
              >
                1000_BITS (-${level.rates.bits1000} MXN)
                {!isOwner && twitchStatus === "CONNECTED" && " 🔒"}
              </button>
            </div>
          </div>
        </div>

        <div className={!isLive && !isOwner ? "opacity-30 grayscale pointer-events-none" : ""}>
          <div
            className={`relative bg-black/40 border transition-all duration-500 p-6 rounded-xl ${
              cooldownRemaining > 0
                ? "border-red-500/50 shadow-glow-red"
                : "border-brand-cyan/30 shadow-glow-cyan"
            }`}
          >
            <h2 className="text-[10px] mb-6 text-brand-cyan tracking-widest uppercase text-center font-black italic">
              {cooldownRemaining > 0 ? "⚠️ SYSTEM_LOCKDOWN_ACTIVE" : "Mod_Game_Progress"}
            </h2>

            <div className="flex flex-col items-center">
              <span
                className={`text-6xl font-black mb-8 transition-colors duration-500 ${
                  cooldownRemaining > 0 ? "text-red-500" : "text-brand-cyan drop-shadow-glow"
                }`}
              >
                {progress}%
              </span>

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

              <input
                type="range"
                min="0"
                max="100"
                value={progress}
                disabled={cooldownRemaining > 0}
                onChange={(e) => handleProgressChange(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-brand-cyan disabled:accent-red-600 disabled:opacity-20"
              />

              {cooldownRemaining > 0 && (
                <div className="mt-6 p-3 border border-red-500/30 bg-red-500/5 rounded-md w-full text-center animate-pulse">
                  <p className="text-[10px] text-red-500 font-black tracking-tighter">
                    ALTO AHÍ: SISTEMA SOBRECALENTADO
                  </p>
                  <p className="text-[9px] text-red-400/70 mt-1 font-mono">
                    PROTOCOLO_SEGURIDAD: {Math.floor(cooldownRemaining / 60)}m{" "}
                    {cooldownRemaining % 60}s restantes
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 relative group max-w-full">
            <div className="absolute inset-0 bg-linear-to-r from-brand-purple to-brand-cyan opacity-10 group-hover:opacity-30 transition duration-1000 blur-sm rounded-xl"></div>

            <div className="relative bg-[#0a0a0a] border border-brand-purple/40 p-4 md:p-6 rounded-xl shadow-glow-purple">
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
                <span className="hidden sm:inline text-[8px] text-brand-purple/50 font-mono">
                  JOAQUIN_PROT_V1
                </span>
              </div>

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

        <div className="bg-black/40 border border-brand-cyan/30 p-6 rounded-xl mt-8 shadow-glow-cyan">
          <h2 className="text-sm text-brand-cyan font-black tracking-widest uppercase mb-6 italic">
            // PROTOCOLO_RETENCION_AUDIENCIA (Brainrot)
          </h2>

          <div className="mb-6 p-4 bg-brand-cyan/5 border border-brand-cyan/20 rounded-lg">
            <h3 className="text-[10px] text-brand-cyan font-black mb-3 uppercase tracking-widest">
              🛠️ GUÍA_OPERATIVA_MODS:
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[9px] font-mono leading-tight">
              <div className="flex gap-2">
                <span className="text-brand-cyan font-bold">#1</span>
                <p className="text-gray-400">
                  Sube el video (.mp4) a un canal de <span className="text-brand-purple font-bold">Discord</span>.
                </p>
              </div>
              <div className="flex gap-2">
                <span className="text-brand-cyan font-bold">#2</span>
                <p className="text-gray-400">
                  Click derecho al video <span className="text-white">"Copiar enlace"</span>, pega y dale a{" "}
                  <span className="text-brand-cyan italic">AÑADIR</span>.
                </p>
              </div>
              <div className="flex gap-2">
                <span className="text-brand-cyan font-bold">#3</span>
                <p className="text-gray-400">
                  Cuando quieras trollear, dale al botón{" "}
                  <span className="text-brand-cyan font-bold">LANZAR VIDEO RANDOM</span>.
                </p>
              </div>
            </div>

            <p className="mt-3 text-[8px] text-orange-500/70 italic uppercase border-t border-orange-500/10 pt-2">
              ⚠️ NOTA: El video se borra solo de la lista al terminar de reproducirse.
            </p>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={brainrotUrl}
              onChange={(e) => setBrainrotUrl(e.target.value)}
              placeholder="URL directa de video (.mp4)..."
              className="flex-1 bg-black/60 border border-brand-cyan/20 rounded-lg px-3 py-2 text-xs font-mono text-brand-cyan placeholder:text-brand-cyan/30"
            />
            <button
              onClick={addVideoToPlaylist}
              disabled={
                !brainrotUrl.toLowerCase().includes(".mp4") &&
                !brainrotUrl.toLowerCase().includes(".webm")
              }
              className="bg-brand-cyan/10 border border-brand-cyan text-brand-cyan text-[10px] px-4 py-2 rounded font-bold hover:bg-brand-cyan hover:text-black transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            >
              AÑADIR
            </button>
          </div>

          <div className="mt-4 space-y-2 max-h-40 overflow-y-auto pr-2">
            {brainrotPlaylist.map((url, index) => (
              <div
                key={index}
                className="flex items-center justify-between bg-white/5 p-2 rounded border border-white/10"
              >
                <span className="text-[10px] text-brand-cyan truncate flex-1 mr-2">{url}</span>
                <button
                  onClick={() => deleteVideo(url)}
                  className="text-red-400 hover:text-red-600 text-[10px] font-bold"
                >
                  ELIMINAR
                </button>
              </div>
            ))}
          </div>

          <button
            disabled={brainrotCooldown > 0 || brainrotPlaylist.length === 0}
            onClick={triggerRandomVideo}
            className="w-full py-4 bg-brand-cyan/20 border-2 border-brand-cyan rounded-xl text-brand-cyan font-black text-lg shadow-glow-cyan hover:bg-brand-cyan hover:text-black transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {brainrotCooldown > 0
              ? `RECARGANDO ESCÁNER (${Math.floor(brainrotCooldown / 60)}m ${brainrotCooldown % 60}s)`
              : `🚀 ¡LANZAR VIDEO RANDOM! (${brainrotPlaylist.length} disponibles)`}
          </button>
        </div>

        <div className="mt-8 bg-black/40 border border-brand-red/20 p-6 rounded-xl shadow-glow-red">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-brand-red rounded-full animate-pulse" />
              <h2 className="text-[10px] text-brand-red tracking-widest uppercase font-black italic">
                Current_Pokemon_Squad
              </h2>
            </div>
            <button
              onClick={() => saveTeam(pokemonTeam)}
              className="text-[9px] bg-brand-red/10 hover:bg-brand-red hover:text-black border border-brand-red px-4 py-1 rounded transition-all font-bold tracking-tighter"
            >
              SINCRONIZAR_CON_JOAQUÍN
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {pokemonTeam.map((poke, index) => (
              <div key={index} className="relative group">
                <span className="absolute -top-2 -left-1 text-[7px] text-brand-red/70 font-mono z-10 bg-[#0a0a0a] px-1">
                  SLOT_0{index + 1}
                </span>
                <input
                  type="text"
                  value={poke === "Vacío" ? "" : poke}
                  placeholder="---"
                  onChange={(e) => handleTeamMemberChange(index, e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none focus:border-brand-cyan transition-all font-mono placeholder:text-white/5"
                />
              </div>
            ))}
          </div>

          <p className="text-[7px] text-white-400 mt-4 italic uppercase">
            ℹ️ Al sincronizar, Joaquín actualizará su base de datos para el comando !equipo.
          </p>
        </div>

        <div className="bg-black/40 border border-brand-cyan/20 p-6 rounded-xl col-span-1 md:col-span-2 shadow-glow-purple">
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

            <div className="border border-white/5 p-3 rounded bg-white/5">
              <code className="text-brand-purple text-xs font-bold">!equipo</code>
              <p className="text-[9px] text-gray-400 mt-1">Muestra el equipo de Pokémon actuales.</p>
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="bg-black/40 border border-orange-500/30 p-6 rounded-xl shadow-glow-mandarina">
            <h2 className="text-sm mb-4 text-orange-500 tracking-widest uppercase italic">
              DEPLOY_OR_RESET
            </h2>

            <p className="text-[9px] text-gray-200 mb-4 font-mono">
              Current Final Price: ${currentPrice} MXN
            </p>

            <button
              onClick={async () => {
                if (confirm("REBOOT SYSTEM?")) {
                  await fetch("/api/auction/reset", { method: "POST" });
                  location.reload();
                }
              }}
              className="mt-4 text-[8px] text-red-400/70 hover:text-red-500 uppercase"
            >
              [ hard_reset_database ]
            </button>

            <button
              className="w-full py-6 bg-orange-600/20 border border-orange-500 rounded-lg hover:bg-orange-600/40 transition-all font-bold text-orange-500 uppercase tracking-widest text-sm"
              onClick={handleFinalizeAuction}
            >
              🚀 Launch Final Publication
            </button>

            <h3 className="text-[10px] text-gray-200 tracking-widest uppercase mb-4">
              Admin_Activity_Log
            </h3>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className="text-[9px] font-mono flex justify-between border-b border-white/5 pb-1"
                >
                  <span className={log.admin === "Sistema/Twitch" ? "text-brand-cyan" : "text-brand-emerald"}>
                    [{log.admin.toUpperCase()}]
                  </span>
                  <span className="text-gray-200">{log.action} (-${log.amount})</span>
                  <span className="text-[8px] text-gray-200">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-black/40 border border-brand-purple/30 p-6 rounded-xl backdrop-blur-md shadow-glow-purple">
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
                    navigator.clipboard.writeText("https://link.mercadopago.com.mx/luishongo");
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

export default function AdminDashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-brand-cyan font-mono italic">
          INITIALIZING_SYSTEM_CONTEXT...
        </div>
      }
    >
      <AdminContent />
    </Suspense>
  );
}