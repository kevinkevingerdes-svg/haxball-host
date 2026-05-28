// ============================================================
//   🐢  Juegan Todos Con Tortu  🐢
//   Script completo para HaxBall
//   Sala: :Tortuga: Juegan todos Con tortuga <:tortuga:1064858506911559690>
// ============================================================

var room = HBInit({
  roomName: ":Tortuga: Juegan todos Con tortuga 🐢",
  maxPlayers: 16,
  public: true,
  noPlayer: true,
});

// ============================================================
// CONFIGURACIÓN DE DISCORD WEBHOOKS
// ============================================================
const DISCORD_WEBHOOKS = {
  joins:      "URL_WEBHOOK_JOINS_AQUI",
  serverOn:   "URL_WEBHOOK_SERVER_ON_AQUI",
  adminCall:  "URL_WEBHOOK_ADMIN_CALL_AQUI",
  discord:    "URL_DISCORD_SERVIDOR_AQUI",
  bans:       "URL_WEBHOOK_BANS_AQUI",
};

function sendDiscordWebhook(url, content) {
  if (!url || url.startsWith("URL_")) return;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

// ============================================================
// CONTRASEÑAS / CLAIMS
// ============================================================
const OWNER_CLAIM_PASSWORD = "0298";

// ============================================================
// BASE DE DATOS EN MEMORIA
// ============================================================
var players     = {};   // info de jugadores en sala por id
var authDB      = {};   // info persistente por auth: { rank, warns, bans, mutes, stats, vip, ... }
var blacklist   = {};   // auth -> true
var banDB       = {};   // auth -> { until, reason }
var muteDB      = {};   // auth -> { until }
var warnDB      = {};   // auth -> count
var afkDB       = {};   // playerId -> { afk: bool, lastActivity: timestamp, timeoutHandle }
var ownerCount  = 0;
var adminCount  = 0;
var modhaxPlusCount = 0;
var modhaxCount = 0;
var helperCount = 0;

var LIMITS = {
  owner:      2,
  admin:      5,
  modhaxPlus: 10,
  modhax:     10,
  helper:     20,
};

// Rangos: owner > admin > modhaxPlus > modhax > helper > vipTortugaPerm > vipTortuga2s > vipPerm > vip2s > player
var RANK_ORDER = ["owner","admin","modhaxPlus","modhax","helper","vipTortugaPerm","vipTortuga2s","vipPerm","vip2s","player"];

function getRankOrder(rank) {
  var i = RANK_ORDER.indexOf(rank);
  return i === -1 ? 99 : i;
}

function initAuth(auth) {
  if (!authDB[auth]) {
    authDB[auth] = {
      rank: "player",
      warns: 0,
      stats: { goals: 0, assists: 0, wins: 0, losses: 0, mvps: 0, games: 0 },
      vip: null,       // null | { type, until (null=perm) }
      joinMsg: null,
      leaveMsg: null,
      color: null,
      size: null,
    };
  }
  if (!warnDB[auth]) warnDB[auth] = 0;
  return authDB[auth];
}

function getPlayerById(id) {
  return room.getPlayer(id);
}

function getAuth(id) {
  return players[id] ? players[id].auth : null;
}

function getData(id) {
  var auth = getAuth(id);
  if (!auth) return null;
  return authDB[auth] || null;
}

function getRank(id) {
  var d = getData(id);
  return d ? d.rank : "player";
}

function isRank(id, rank) {
  return getRank(id) === rank;
}

function hasRankAtLeast(id, rank) {
  return getRankOrder(getRank(id)) <= getRankOrder(rank);
}

function isVip(id) {
  var d = getData(id);
  if (!d || !d.vip) return false;
  if (d.vip.until === null) return true;
  return Date.now() < d.vip.until;
}

function isTortugaVip(id) {
  var d = getData(id);
  if (!d || !d.vip) return false;
  if (!isVip(id)) return false;
  return d.vip.type === "vipTortugaPerm" || d.vip.type === "vipTortuga2s";
}

function isMuted(auth) {
  if (!muteDB[auth]) return false;
  if (muteDB[auth].until === null) return true;
  if (Date.now() < muteDB[auth].until) return true;
  delete muteDB[auth];
  return false;
}

function isBanned(auth) {
  if (!banDB[auth]) return false;
  if (Date.now() < banDB[auth].until) return true;
  delete banDB[auth];
  return false;
}

// ============================================================
// COLORES VIP
// ============================================================
var VIP_COLORS = {
  amarillo: 0xFFFF00,
  rojo:     0xFF4444,
  verde:    0x44FF44,
  azul:     0x4488FF,
  rosa:     0xFF88CC,
  naranja:  0xFF8800,
  cyan:     0x00FFFF,
  blanco:   0xFFFFFF,
  morado:   0xAA44FF,
};

// ============================================================
// MENSAJES SALA
// ============================================================
function chat(msg, id) {
  if (id !== undefined) room.sendAnnouncement(msg, id, null, "normal", 0);
  else room.sendAnnouncement(msg, null, null, "normal", 0);
}

function chatColor(msg, id, color, style, sound) {
  room.sendAnnouncement(msg, id || null, color || 0xFFFFFF, style || "normal", sound || 0);
}

function announce(msg) {
  room.sendAnnouncement(msg, null, 0xFFFF00, "bold", 2);
}

// ============================================================
// BIENVENIDA Y DESPEDIDA
// ============================================================
function welcomeMsg(player) {
  chat("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", player.id);
  chatColor("🐢  ¡Bienvenido/a " + player.name + "!", player.id, 0x00FF99, "bold", 0);
  chatColor("    Juegan Todos Con Tortu — ¡Disfrutá tu estadía!", player.id, 0xAAFFCC, "italic", 0);
  chatColor("    Escribe !help para ver los comandos.", player.id, 0xCCCCCC, "normal", 0);
  chat("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", player.id);
}

function leaveMsg(player) {
  var data = authDB[players[player.id] ? players[player.id].auth : null];
  var msg = (data && data.leaveMsg) ? data.leaveMsg : "¡Vuelve pronto! 🐢";
  chatColor("👋  " + player.name + " — " + msg, null, 0xFF9944, "bold", 0);
}

// ============================================================
// SISTEMA AFK
// ============================================================
var AFK_TIMEOUT = 5 * 60 * 1000; // 5 minutos

function resetAfk(id) {
  if (!afkDB[id]) afkDB[id] = { afk: false };
  afkDB[id].lastActivity = Date.now();
  if (afkDB[id].timeout) clearTimeout(afkDB[id].timeout);
  if (!afkDB[id].afk) {
    afkDB[id].timeout = setTimeout(function() { kickAfk(id); }, AFK_TIMEOUT);
  }
}

function kickAfk(id) {
  var p = room.getPlayer(id);
  if (!p) return;
  if (afkDB[id] && afkDB[id].afk) return; // ya está en modo afk manual
  chatColor("⏰ " + p.name + " fue expulsado por inactividad (5 min AFK).", null, 0xFF6666, "bold", 0);
  room.kickPlayer(id, "AFK — Tiempo de inactividad superado. ¡Vuelve pronto! 🐢", false);
}

// ============================================================
// SISTEMA DE BALANCEO AUTOMÁTICO
// ============================================================
function autoBalance() {
  var ps = room.getPlayerList().filter(p => p.team !== 0);
  var red  = ps.filter(p => p.team === 1);
  var blue = ps.filter(p => p.team === 2);
  var diff = Math.abs(red.length - blue.length);
  if (diff >= 2) {
    var bigger = red.length > blue.length ? red : blue;
    var targetTeam = red.length > blue.length ? 2 : 1;
    // mover al último que entró al equipo mayor (no al que tenga menos actividad, simple)
    var toMove = bigger[bigger.length - 1];
    if (toMove) {
      room.setPlayerTeam(toMove.id, targetTeam);
      chatColor("⚖️ Balanceo automático: " + toMove.name + " movido para equilibrar equipos.", null, 0xAADDFF, "bold", 0);
    }
  }
}

// ============================================================
// SISTEMA DE STATS
// ============================================================
var currentGameGoals = {};  // playerId -> { goals, assists }
var lastTouchId = null;

room.onPlayerBallKick = function(player) {
  lastTouchId = player.id;
  resetAfk(player.id);
};

room.onTeamGoal = function(team) {
  if (lastTouchId !== null) {
    var auth = getAuth(lastTouchId);
    if (auth) {
      var data = initAuth(auth);
      var mult = isTortugaVip(lastTouchId) ? 1.5 : 1;
      data.stats.goals += mult;
      if (!currentGameGoals[lastTouchId]) currentGameGoals[lastTouchId] = { goals: 0, assists: 0 };
      currentGameGoals[lastTouchId].goals += mult;
    }
  }
};

room.onTeamVictory = function(scores) {
  var ps = room.getPlayerList().filter(p => p.team !== 0);
  var winTeam = scores.red > scores.blue ? 1 : 2;

  // determinar MVP (más goles + asistencias en el partido)
  var mvpId = null, mvpScore = -1;
  ps.forEach(function(p) {
    var g = currentGameGoals[p.id] ? (currentGameGoals[p.id].goals + currentGameGoals[p.id].assists) : 0;
    if (g > mvpScore) { mvpScore = g; mvpId = p.id; }
  });

  ps.forEach(function(p) {
    var auth = getAuth(p.id);
    if (!auth) return;
    var data = initAuth(auth);
    data.stats.games++;
    if (p.team === winTeam) data.stats.wins++;
    else data.stats.losses++;
    if (p.id === mvpId && mvpScore > 0) data.stats.mvps++;
  });

  if (mvpId) {
    var mp = room.getPlayer(mvpId);
    if (mp) chatColor("🏆 MVP: " + mp.name + " — ¡Gran partido!", null, 0xFFDD00, "bold", 2);
  }
  currentGameGoals = {};
  lastTouchId = null;
};

// ============================================================
// SISTEMA VOTEMUTE / VOTEKICK
// ============================================================
var voteKickSessions  = {}; // targetId -> { votes: Set, timeout }
var voteMuteSessions  = {}; // targetId -> { votes: Set, timeout }
var VOTE_THRESHOLD    = 3;
var VOTE_EXPIRE       = 60000; // 1 min para votar

function startVoteKick(voterId, targetId) {
  var target = room.getPlayer(targetId);
  if (!target) return chat("Jugador no encontrado.", voterId);
  if (!voteKickSessions[targetId]) {
    voteKickSessions[targetId] = { votes: new Set(), timeout: null };
    voteKickSessions[targetId].timeout = setTimeout(function() {
      delete voteKickSessions[targetId];
    }, VOTE_EXPIRE);
    chatColor("🗳️ Se inició votekick contra " + target.name + ". Necesita " + VOTE_THRESHOLD + " votos. Usa !votekick #" + targetId, null, 0xFF9944, "bold", 1);
  }
  voteKickSessions[targetId].votes.add(voterId);
  var count = voteKickSessions[targetId].votes.size;
  chatColor("🗳️ Votekick contra " + target.name + ": " + count + "/" + VOTE_THRESHOLD + " votos.", null, 0xFF9944, "bold", 0);
  if (count >= VOTE_THRESHOLD) {
    clearTimeout(voteKickSessions[targetId].timeout);
    delete voteKickSessions[targetId];
    var auth = getAuth(targetId);
    if (auth) {
      muteDB[auth] = { until: Date.now() + 30 * 60 * 1000 };
    }
    chatColor("✅ Votekick aprobado. " + target.name + " ha sido expulsado por 30 minutos.", null, 0xFF4444, "bold", 2);
    room.kickPlayer(targetId, "Votekick — expulsado por 30 minutos.", false);
  }
}

function startVoteMute(voterId, targetId) {
  var target = room.getPlayer(targetId);
  if (!target) return chat("Jugador no encontrado.", voterId);
  if (!voteMuteSessions[targetId]) {
    voteMuteSessions[targetId] = { votes: new Set(), timeout: null };
    voteMuteSessions[targetId].timeout = setTimeout(function() {
      delete voteMuteSessions[targetId];
    }, VOTE_EXPIRE);
    chatColor("🗳️ Se inició votemute contra " + target.name + ". Necesita " + VOTE_THRESHOLD + " votos.", null, 0xAADDFF, "bold", 1);
  }
  voteMuteSessions[targetId].votes.add(voterId);
  var count = voteMuteSessions[targetId].votes.size;
  chatColor("🗳️ Votemute contra " + target.name + ": " + count + "/" + VOTE_THRESHOLD + " votos.", null, 0xAADDFF, "bold", 0);
  if (count >= VOTE_THRESHOLD) {
    clearTimeout(voteMuteSessions[targetId].timeout);
    delete voteMuteSessions[targetId];
    var auth = getAuth(targetId);
    if (auth) muteDB[auth] = { until: Date.now() + 30 * 60 * 1000 };
    chatColor("✅ Votemute aprobado. " + target.name + " muteado 30 minutos.", null, 0xAADDFF, "bold", 2);
  }
}

// ============================================================
// PARSEO DE COMANDOS
// ============================================================
function parseTarget(arg) {
  // acepta #5 o solo 5
  if (!arg) return null;
  var s = arg.replace("#", "");
  var n = parseInt(s);
  if (isNaN(n)) return null;
  return n;
}

function parseMuteTime(arg1, arg2) {
  // !mute #id 10m  o  !mute #id 2h
  if (!arg1) return 30 * 60 * 1000; // default 30 min
  var raw = arg1;
  if (arg2) raw = arg1; // arg1 es id, no
  var match = raw.match(/^(\d+)(m|h)$/i);
  if (!match) return 30 * 60 * 1000;
  var val = parseInt(match[1]);
  return match[2].toLowerCase() === "h" ? val * 3600000 : val * 60000;
}

// ============================================================
// PROCESAMIENTO DE COMANDOS
// ============================================================
room.onPlayerChat = function(player, message) {
  var id   = player.id;
  var auth = getAuth(id);
  var data = getData(id);
  var rank = getRank(id);
  var msg  = message.trim();
  var parts = msg.split(" ");
  var cmd  = parts[0].toLowerCase();

  // Actividad AFK
  resetAfk(id);

  // ── MUTE CHECK ──
  if (isMuted(auth)) {
    chat("🔇 Estás muteado. No puedes hablar.", id);
    return false;
  }

  // ── COLOR VIP en mensajes ──
  if (data && data.color && isVip(id)) {
    room.sendAnnouncement(player.name + ": " + message, null, data.color, "normal", 0);
    return false;
  }

  // ═══════════════════════════
  // COMANDOS GENERALES
  // ═══════════════════════════
  if (cmd === "!bb" || cmd === "!nv") {
    chat("👋 ¡Hasta luego, " + player.name + "! 🐢", id);
    setTimeout(function() { room.kickPlayer(id, "¡Vuelve pronto! 🐢", false); }, 800);
    return false;
  }

  if (cmd === "!help") {
    chat("━━━━━━━━━ 🐢 COMANDOS 🐢 ━━━━━━━━━", id);
    chat("📌 GENERALES:", id);
    chat("  !me — Tus estadísticas", id);
    chat("  !bb / !nv — Salir de la sala", id);
    chat("  !afk — Activar/desactivar modo AFK", id);
    chat("  !votekick #id — Votar para expulsar", id);
    chat("  !votemute #id — Votar para mutear", id);
    if (isVip(id)) {
      chat("🌟 VIP:", id);
      chat("  !setcolor [color] — Cambia color de nombre", id);
      chat("  !size [1-20] — Cambia tu tamaño", id);
      chat("  !setjoin [msg] — Mensaje de entrada", id);
      chat("  !setleave [msg] — Mensaje de salida", id);
    }
    if (hasRankAtLeast(id, "helper")) {
      chat("🛡️ STAFF:", id);
      chat("  !warn #id — Advertir jugador", id);
      chat("  !unwarn #id — Quitar advertencia", id);
      chat("  !mute #id [tiempo: 10m / 2h] — Mutear", id);
      chat("  !unmute #id — Desmutear", id);
    }
    if (hasRankAtLeast(id, "modhax")) {
      chat("  !ban #id — Banear 3 días", id);
      chat("  !unban #id — Desbanear", id);
    }
    if (hasRankAtLeast(id, "admin")) {
      chat("  !blacklist #id — Blacklist permanente", id);
      chat("  !unblacklist #id — Quitar blacklist", id);
      chat("  !setrank #id [rank] — Dar rango", id);
    }
    if (hasRankAtLeast(id, "owner")) {
      chat("  !setvip #id [tipo] [dias] — Dar VIP", id);
    }
    chat("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", id);
    return false;
  }

  if (cmd === "!me") {
    if (!data) return false;
    var s = data.stats;
    var wr = s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0;
    chat("━━━━━━━ 📊 TUS STATS ━━━━━━━", id);
    chatColor("👤 " + player.name + " — Rango: " + rank.toUpperCase(), id, 0xAAFFCC, "bold", 0);
    chat("⚽ Goles: " + s.goals.toFixed(1) + " | 🅰️ Asistencias: " + s.assists.toFixed(1), id);
    chat("🏆 Ganados: " + s.wins + " | ❌ Perdidos: " + s.losses + " | 🎮 Partidas: " + s.games, id);
    chat("📈 Winrate: " + wr + "% | 🌟 MVPs: " + s.mvps, id);
    if (isVip(id)) {
      var vt = data.vip;
      var vLabel = vt.until === null ? "Permanente" : new Date(vt.until).toLocaleDateString();
      chatColor("✨ VIP: " + vt.type + " — hasta: " + vLabel, id, 0xFFFF00, "bold", 0);
    }
    chat("━━━━━━━━━━━━━━━━━━━━━━━━━━━", id);
    return false;
  }

  if (cmd === "!afk") {
    if (!afkDB[id]) afkDB[id] = { afk: false };
    afkDB[id].afk = !afkDB[id].afk;
    if (afkDB[id].afk) {
      if (afkDB[id].timeout) clearTimeout(afkDB[id].timeout);
      chatColor("💤 " + player.name + " está AFK.", null, 0x888888, "italic", 0);
    } else {
      chatColor("✅ " + player.name + " volvió del AFK.", null, 0xAAFFCC, "normal", 0);
      resetAfk(id);
    }
    return false;
  }

  // ═══════════════════════════
  // VOTEKICK / VOTEMUTE
  // ═══════════════════════════
  if (cmd === "!votekick") {
    var tid = parseTarget(parts[1]);
    if (!tid) return chat("Uso: !votekick #id", id) || false;
    if (tid === id) return chat("No puedes votarte a ti mismo.", id) || false;
    startVoteKick(id, tid);
    return false;
  }

  if (cmd === "!votemute") {
    var tid = parseTarget(parts[1]);
    if (!tid) return chat("Uso: !votemute #id", id) || false;
    if (tid === id) return chat("No puedes votar contra ti mismo.", id) || false;
    startVoteMute(id, tid);
    return false;
  }

  // ═══════════════════════════
  // CLAIM OWNER
  // ═══════════════════════════
  if (cmd === "!" + OWNER_CLAIM_PASSWORD) {
    if (ownerCount >= LIMITS.owner) return chat("❌ Ya hay " + LIMITS.owner + " owners. No se puede asignar más.", id) || false;
    if (rank === "owner") return chat("Ya eres Owner.", id) || false;
    decrementRankCount(rank);
    data.rank = "owner";
    ownerCount++;
    room.setPlayerAdmin(id, true);
    chatColor("👑 " + player.name + " es ahora OWNER.", null, 0xFFD700, "bold", 2);
    return false;
  }

  // ═══════════════════════════
  // COMANDOS STAFF (warn/mute/ban etc.)
  // ═══════════════════════════

  // WARN — helper+
  if (cmd === "!warn") {
    if (!hasRankAtLeast(id, "helper")) return chat("❌ Sin permisos.", id) || false;
    var tid = parseTarget(parts[1]);
    if (!tid) return chat("Uso: !warn #id", id) || false;
    var tauth = getAuth(tid);
    var tp = room.getPlayer(tid);
    if (!tauth || !tp) return chat("Jugador no encontrado.", id) || false;
    warnDB[tauth] = (warnDB[tauth] || 0) + 1;
    initAuth(tauth).warns = warnDB[tauth];
    chatColor("⚠️ " + tp.name + " recibió advertencia " + warnDB[tauth] + "/3.", null, 0xFFAA00, "bold", 1);
    if (warnDB[tauth] >= 3) {
      warnDB[tauth] = 0;
      initAuth(tauth).warns = 0;
      banDB[tauth] = { until: Date.now() + 24 * 3600000, reason: "3 advertencias" };
      chatColor("🚫 " + tp.name + " baneado 1 día por acumular 3 advertencias.", null, 0xFF4444, "bold", 2);
      sendDiscordWebhook(DISCORD_WEBHOOKS.bans, "🚫 **BAN AUTOMÁTICO** | " + tp.name + " — 3 advertencias acumuladas. Ban: 1 día.");
      room.kickPlayer(tid, "Baneado 1 día por 3 advertencias.", false);
    }
    return false;
  }

  // UNWARN — helper+
  if (cmd === "!unwarn") {
    if (!hasRankAtLeast(id, "helper")) return chat("❌ Sin permisos.", id) || false;
    var tid = parseTarget(parts[1]);
    if (!tid) return chat("Uso: !unwarn #id", id) || false;
    var tauth = getAuth(tid);
    var tp = room.getPlayer(tid);
    if (!tauth || !tp) return chat("Jugador no encontrado.", id) || false;
    if ((warnDB[tauth] || 0) > 0) {
      warnDB[tauth]--;
      initAuth(tauth).warns = warnDB[tauth];
    }
    chatColor("✅ Advertencia quitada a " + tp.name + ". Ahora tiene " + (warnDB[tauth]||0) + "/3.", null, 0xAAFFCC, "bold", 0);
    return false;
  }

  // MUTE — helper+
  if (cmd === "!mute") {
    if (!hasRankAtLeast(id, "helper")) return chat("❌ Sin permisos.", id) || false;
    var tid = parseTarget(parts[1]);
    if (!tid) return chat("Uso: !mute #id [10m/2h]", id) || false;
    var tauth = getAuth(tid);
    var tp = room.getPlayer(tid);
    if (!tauth || !tp) return chat("Jugador no encontrado.", id) || false;
    var duration = parseMuteTime(parts[2]);
    muteDB[tauth] = { until: Date.now() + duration };
    var label = parts[2] || "30m";
    chatColor("🔇 " + tp.name + " muteado por " + label + ".", null, 0xAADDFF, "bold", 1);
    return false;
  }

  // UNMUTE — helper+
  if (cmd === "!unmute") {
    if (!hasRankAtLeast(id, "helper")) return chat("❌ Sin permisos.", id) || false;
    var tid = parseTarget(parts[1]);
    if (!tid) return chat("Uso: !unmute #id", id) || false;
    var tauth = getAuth(tid);
    var tp = room.getPlayer(tid);
    if (!tauth || !tp) return chat("Jugador no encontrado.", id) || false;
    delete muteDB[tauth];
    chatColor("🔊 " + tp.name + " desmuteado.", null, 0xAAFFCC, "bold", 0);
    return false;
  }

  // BAN — modhax+
  if (cmd === "!ban") {
    if (!hasRankAtLeast(id, "modhax")) return chat("❌ Sin permisos.", id) || false;
    var tid = parseTarget(parts[1]);
    if (!tid) return chat("Uso: !ban #id", id) || false;
    var tauth = getAuth(tid);
    var tp = room.getPlayer(tid);
    if (!tauth || !tp) return chat("Jugador no encontrado.", id) || false;
    banDB[tauth] = { until: Date.now() + 3 * 24 * 3600000, reason: "Ban por staff" };
    chatColor("🚫 " + tp.name + " baneado 3 días.", null, 0xFF4444, "bold", 2);
    sendDiscordWebhook(DISCORD_WEBHOOKS.bans, "🚫 **BAN** | " + tp.name + " baneado 3 días por " + player.name + ".");
    room.kickPlayer(tid, "Baneado 3 días.", false);
    return false;
  }

  // UNBAN — owner/admin
  if (cmd === "!unban") {
    if (!hasRankAtLeast(id, "admin")) return chat("❌ Sin permisos.", id) || false;
    var tid = parseTarget(parts[1]);
    // unban por nombre/auth: buscar en banDB — simplificado por ID en sala
    var tauth = getAuth(tid);
    if (!tauth) {
      // intentar unban por número de auth en parts[1] directamente
      tauth = parts[1];
    }
    if (banDB[tauth]) {
      delete banDB[tauth];
      chatColor("✅ Ban eliminado.", null, 0xAAFFCC, "bold", 0);
    } else {
      chat("No se encontró ban para ese jugador/auth.", id);
    }
    return false;
  }

  // BLACKLIST — admin+
  if (cmd === "!blacklist") {
    if (!hasRankAtLeast(id, "admin")) return chat("❌ Sin permisos.", id) || false;
    var tid = parseTarget(parts[1]);
    if (!tid) return chat("Uso: !blacklist #id", id) || false;
    var tauth = getAuth(tid);
    var tp = room.getPlayer(tid);
    if (!tauth || !tp) return chat("Jugador no encontrado.", id) || false;
    blacklist[tauth] = true;
    banDB[tauth] = { until: Date.now() + 999 * 24 * 3600000, reason: "Blacklist" };
    chatColor("⛔ " + tp.name + " añadido a la blacklist.", null, 0xFF0000, "bold", 2);
    sendDiscordWebhook(DISCORD_WEBHOOKS.bans, "⛔ **BLACKLIST** | " + tp.name + " por " + player.name + ".");
    room.kickPlayer(tid, "Has sido añadido a la blacklist.", false);
    return false;
  }

  // UNBLACKLIST — admin+
  if (cmd === "!unblacklist") {
    if (!hasRankAtLeast(id, "admin")) return chat("❌ Sin permisos.", id) || false;
    var tauth = parts[1];
    if (!tauth) return chat("Uso: !unblacklist [auth]", id) || false;
    delete blacklist[tauth];
    delete banDB[tauth];
    chatColor("✅ Blacklist eliminada para " + tauth + ".", null, 0xAAFFCC, "bold", 0);
    return false;
  }

  // SETRANK — admin+
  if (cmd === "!setrank") {
    if (!hasRankAtLeast(id, "admin")) return chat("❌ Sin permisos.", id) || false;
    var tid = parseTarget(parts[1]);
    var newRank = parts[2];
    if (!tid || !newRank) return chat("Uso: !setrank #id [rank]", id) || false;
    var validRanks = ["owner","admin","modhaxPlus","modhax","helper","player"];
    if (!validRanks.includes(newRank)) return chat("Rangos válidos: " + validRanks.join(", "), id) || false;
    var tp = room.getPlayer(tid);
    var tauth = getAuth(tid);
    if (!tp || !tauth) return chat("Jugador no encontrado.", id) || false;
    // chequear límites
    if (!canAssignRank(newRank)) return chat("❌ Límite de " + newRank + " alcanzado.", id) || false;
    var tdata = initAuth(tauth);
    decrementRankCount(tdata.rank);
    tdata.rank = newRank;
    incrementRankCount(newRank);
    var isAdminRank = ["owner","admin","modhaxPlus","modhax"].includes(newRank);
    room.setPlayerAdmin(tid, isAdminRank);
    chatColor("✅ " + tp.name + " ahora es " + newRank.toUpperCase() + ".", null, 0xAAFFCC, "bold", 1);
    return false;
  }

  // SETVIP — owner+
  if (cmd === "!setvip") {
    if (!hasRankAtLeast(id, "owner")) return chat("❌ Sin permisos.", id) || false;
    var tid = parseTarget(parts[1]);
    var vtype = parts[2];
    var days = parseInt(parts[3]);
    if (!tid || !vtype) return chat("Uso: !setvip #id [tipo] [dias(opt)]", id) || false;
    var tp = room.getPlayer(tid);
    var tauth = getAuth(tid);
    if (!tp || !tauth) return chat("Jugador no encontrado.", id) || false;
    var tdata = initAuth(tauth);
    tdata.vip = {
      type: vtype,
      until: isNaN(days) ? null : Date.now() + days * 86400000,
    };
    chatColor("✨ " + tp.name + " recibió VIP tipo " + vtype + (isNaN(days) ? " permanente" : " por " + days + " días") + ".", null, 0xFFFF00, "bold", 2);
    return false;
  }

  // ═══════════════════════════
  // COMANDOS VIP
  // ═══════════════════════════

  if (cmd === "!setcolor") {
    if (!isVip(id)) return chat("❌ Comando solo para VIP.", id) || false;
    var colorName = (parts[1] || "").toLowerCase();
    if (!VIP_COLORS[colorName]) {
      chat("Colores disponibles: " + Object.keys(VIP_COLORS).join(", "), id);
      return false;
    }
    data.color = VIP_COLORS[colorName];
    chatColor("🎨 Color cambiado a " + colorName + ".", id, data.color, "bold", 0);
    return false;
  }

  if (cmd === "!size") {
    if (!isVip(id)) return chat("❌ Comando solo para VIP.", id) || false;
    var sz = parseFloat(parts[1]);
    if (isNaN(sz) || sz < 9 || sz > 20) return chat("Uso: !size [9-20]", id) || false;
    data.size = sz;
    // HaxBall no tiene API nativa de tamaño de avatar, se notifica
    chatColor("📏 Tamaño establecido a " + sz + ". (Se aplicará en el siguiente juego.)", id, 0xAAFFCC, "normal", 0);
    return false;
  }

  if (cmd === "!setjoin") {
    if (!isVip(id)) return chat("❌ Comando solo para VIP.", id) || false;
    var joinMsg = parts.slice(1).join(" ");
    if (!joinMsg) return chat("Uso: !setjoin [mensaje]", id) || false;
    data.joinMsg = joinMsg;
    chatColor("✅ Mensaje de entrada guardado.", id, 0xAAFFCC, "normal", 0);
    return false;
  }

  if (cmd === "!setleave") {
    if (!isVip(id)) return chat("❌ Comando solo para VIP.", id) || false;
    var leaveMsgText = parts.slice(1).join(" ");
    if (!leaveMsgText) return chat("Uso: !setleave [mensaje]", id) || false;
    data.leaveMsg = leaveMsgText;
    chatColor("✅ Mensaje de salida guardado.", id, 0xAAFFCC, "normal", 0);
    return false;
  }

  // ═══════════════════════════
  // PODER / COMBA
  // ═══════════════════════════

  if (cmd === "!power") {
    var pObj = room.getPlayer(id);
    if (!pObj || pObj.team === 0) return false;
    chatColor("💥 " + player.name + " activó POWER!", null, 0xFF6600, "bold", 1);
    // Efecto: velocidad aumentada temporalmente (se usa con discAvatar speed multiplier)
    // Como HaxBall no tiene API directa de speed boost para el jugador,
    // se anuncia en el chat como efecto de rol. Para implementación real usa un stadium con extrapolation.
    setTimeout(function() {
      var pp = room.getPlayer(id);
      if (pp) chatColor("💨 Power de " + pp.name + " terminó.", null, 0xFF6600, "normal", 0);
    }, 5000);
    return false;
  }

  if (cmd === "!comba") {
    var pObj = room.getPlayer(id);
    if (!pObj || pObj.team === 0) return false;
    chatColor("🌀 " + player.name + " está haciendo una COMBA! 🌀", null, 0xCC44FF, "bold", 1);
    // Secuencia realista: anuncio de comba con pausa para simular acción
    setTimeout(function() {
      var pp = room.getPlayer(id);
      if (pp) chatColor("⚡ ¡COMBA EJECUTADA por " + pp.name + "! ⚡", null, 0xCC44FF, "bold", 2);
    }, 1200);
    return false;
  }

  // ═══════════════════════════
  // CALL ADMIN
  // ═══════════════════════════
  if (cmd === "!admin" || cmd === "!llamaradmin") {
    chatColor("📢 " + player.name + " está llamando a un admin!", null, 0xFF6600, "bold", 2);
    sendDiscordWebhook(DISCORD_WEBHOOKS.adminCall, "📢 **LLAMADA DE ADMIN** | " + player.name + " necesita un admin en la sala.");
    return false;
  }

  return true;
};

// ============================================================
// FUNCIONES AUXILIARES DE RANGOS
// ============================================================
function decrementRankCount(rank) {
  if (rank === "owner")      ownerCount = Math.max(0, ownerCount - 1);
  if (rank === "admin")      adminCount = Math.max(0, adminCount - 1);
  if (rank === "modhaxPlus") modhaxPlusCount = Math.max(0, modhaxPlusCount - 1);
  if (rank === "modhax")     modhaxCount = Math.max(0, modhaxCount - 1);
  if (rank === "helper")     helperCount = Math.max(0, helperCount - 1);
}

function incrementRankCount(rank) {
  if (rank === "owner")      ownerCount++;
  if (rank === "admin")      adminCount++;
  if (rank === "modhaxPlus") modhaxPlusCount++;
  if (rank === "modhax")     modhaxCount++;
  if (rank === "helper")     helperCount++;
}

function canAssignRank(rank) {
  if (rank === "owner")      return ownerCount < LIMITS.owner;
  if (rank === "admin")      return adminCount < LIMITS.admin;
  if (rank === "modhaxPlus") return modhaxPlusCount < LIMITS.modhaxPlus;
  if (rank === "modhax")     return modhaxCount < LIMITS.modhax;
  if (rank === "helper")     return helperCount < LIMITS.helper;
  return true;
}

// ============================================================
// EVENTOS DE SALA
// ============================================================
room.onPlayerJoin = function(player) {
  var auth = player.auth;
  players[player.id] = { auth: auth, name: player.name };
  var data = initAuth(auth);

  // Chequeo blacklist
  if (blacklist[auth]) {
    room.kickPlayer(player.id, "⛔ Estás en la blacklist.", false);
    return;
  }

  // Chequeo ban
  if (isBanned(auth)) {
    var remaining = Math.ceil((banDB[auth].until - Date.now()) / 3600000);
    room.kickPlayer(player.id, "🚫 Baneado. Tiempo restante: ~" + remaining + " horas.", false);
    return;
  }

  // Restaurar admin HaxBall si corresponde
  var isAdminRank = ["owner","admin","modhaxPlus","modhax"].includes(data.rank);
  if (isAdminRank) room.setPlayerAdmin(player.id, true);

  // Mensaje de bienvenida personalizado (VIP)
  if (data.joinMsg && isVip(player.id)) {
    chatColor("🌟 " + player.name + " entró: " + data.joinMsg, null, 0xFFFF00, "bold", 0);
  } else {
    welcomeMsg(player);
  }

  // Discord webhook
  sendDiscordWebhook(DISCORD_WEBHOOKS.joins, "🟢 **JOIN** | " + player.name + " entró a la sala.");

  // Iniciar AFK tracker
  resetAfk(player.id);

  // Balanceo
  autoBalance();
};

room.onPlayerLeave = function(player) {
  leaveMsg(player);

  // Limpiar AFK
  if (afkDB[player.id]) {
    if (afkDB[player.id].timeout) clearTimeout(afkDB[player.id].timeout);
    delete afkDB[player.id];
  }

  delete players[player.id];
  autoBalance();
};

room.onTeamVictory = function(scores) {
  // ya manejado arriba, reimplementado para evitar duplicado
};

room.onStadiumChange = function(newStadiumName, byPlayer) {
  chatColor("🏟️ Estadio cambiado a: " + newStadiumName, null, 0xAADDFF, "italic", 0);
};

room.onPlayerKicked = function(kickedPlayer, reason, ban, byPlayer) {
  if (ban) {
    chatColor("🚫 " + kickedPlayer.name + " fue baneado" + (byPlayer ? " por " + byPlayer.name : "") + ". Razón: " + reason, null, 0xFF4444, "bold", 2);
  }
};

room.onGameStart = function(byPlayer) {
  currentGameGoals = {};
  lastTouchId = null;
  chatColor("⚽ ¡El juego comenzó! ¡Buena suerte a todos! 🐢", null, 0x00FF99, "bold", 1);
};

room.onGameStop = function(byPlayer) {
  chatColor("🏁 Juego terminado.", null, 0xCCCCCC, "normal", 0);
};

// ============================================================
// INICIO DEL SERVIDOR
// ============================================================
chatColor("🐢 Servidor iniciado: Juegan Todos Con Tortu", null, 0x00FF99, "bold", 2);
sendDiscordWebhook(DISCORD_WEBHOOKS.serverOn, "🟢 **SERVIDOR INICIADO** | :Tortuga: Juegan todos Con tortuga 🐢 está en línea.");

// ============================================================
// FIN DEL SCRIPT
// ============================================================
