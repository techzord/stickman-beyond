
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const W = 960;
const H = 500;
const GRAVITY = 0.58;

const ui = {
  health: document.getElementById("health"),
  healthFill: document.getElementById("healthFill"),
  coins: document.getElementById("coins"),
  level: document.getElementById("level"),
  enemyCount: document.getElementById("enemyCount"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlayTitle"),
  overlayText: document.getElementById("overlayText"),
  continueBtn: document.getElementById("continueBtn")
};

let keys = {};
let player;
let platforms = [];
let enemies = [];
let coins = [];
let pickups = [];
let particles = [];
let cameraX = 0;
let worldWidth = 2200;
let level = 1;
let totalCoins = 0;
let swordPower = 1;
let gameState = "menu";
let bossRoomStart = 0;
let bossRoomEnd = 0;
let ambientTimer = null;
let ambientStep = 0;
let selectedLevel = 1;
let portal;
let lastTime = 0;
let jumpQueued = false;
let attackQueued = false;
let invulnerable = 0;
let screenShake = 0;
let levelTheme = 0;
let hazards = [];
let arrows = [];
let bossWaves = [];
let bossFireballs = [];
let bossIntroFrames = 0;
let bossIntroTriggered = false;
let savedLevel = 1;
let soundOn = true;
let audioContext = null;
let lastSavedCoins = 0;
let activeTrialPower = "";
let trialPowerFrames = 0;
let basePlayerSpeed = 3.15;
let laserBolts = [];

function loadProgress() {
  try {
    const data = JSON.parse(localStorage.getItem("stickmanBeyondLimitsSave") || "{}");
    savedLevel = Math.max(1, Math.min(50, Number(data.level) || 1));
    totalCoins = Math.max(0, Number(data.coins) || 0);
    swordPower = Math.max(1, Math.min(3, Number(data.swordPower) || 1));
  } catch (_) { savedLevel = 1; totalCoins = 0; swordPower = 1; }
}
function saveProgress() {
  try {
    localStorage.setItem("stickmanBeyondLimitsSave", JSON.stringify({ level: savedLevel, coins: totalCoins, swordPower }));
  } catch (_) {}
}
function playSound(type) {
  if (!soundOn) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === "suspended") audioContext.resume();
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const presets = {
      jump: [360, 620, .09, "sine"], coin: [700, 1120, .12, "sine"], power: [520, 1450, .2, "triangle"], laser: [880, 180, .28, "sawtooth"],
      attack: [240, 120, .08, "sawtooth"], hit: [150, 70, .12, "square"],
      hurt: [190, 55, .18, "sawtooth"], win: [440, 880, .28, "triangle"],
      lose: [220, 75, .35, "triangle"], hazard: [130, 45, .2, "square"]
    };
    const p = presets[type] || presets.hit;
    osc.type = p[3]; osc.frequency.setValueAtTime(p[0], now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(35, p[1]), now + p[2]);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.34, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + p[2]);
    osc.connect(gain); gain.connect(audioContext.destination); osc.start(now); osc.stop(now + p[2] + .02);
  } catch (_) {}
}


function isBossLevel(n = level) { return n % 10 === 0; }
function worldIndex(n = level) { return Math.min(4, Math.floor((n - 1) / 10)); }
function worldName(n = level) { return ["Forgotten Valley", "Dreadwood Frontier", "Venom Depths", "Phantom Citadel", "Inferno Crownlands"][worldIndex(n)]; }
function bossName(n = level) { return ["THE ASH KING", "THE FROST TYRANT", "THE PLAGUE EMPEROR", "THE VOID QUEEN", "THE INFERNAL KING"][Math.max(0, Math.min(4, Math.floor(n / 10) - 1))]; }
function togglePause() {
  if (gameState === "playing") {
    gameState = "paused";
    ui.overlayTitle.textContent = "GAME PAUSED";
    ui.overlayText.textContent = "Your progress is safe. Take a breath.";
    ui.continueBtn.textContent = "RESUME GAME";
    ui.overlay.classList.remove("hidden");
    const b = document.getElementById("pauseBtn"); if (b) b.textContent = "▶ Resume";
  } else if (gameState === "paused") {
    gameState = "playing";
    ui.overlay.classList.add("hidden");
    const b = document.getElementById("pauseBtn"); if (b) b.textContent = "Ⅱ Pause";
  }
}
function playBossMusic() {
  if (!soundOn) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === "suspended") audioContext.resume();
    const now = audioContext.currentTime;
    [[55, 2.8, "sawtooth", .10], [82.4, 2.8, "triangle", .07], [110, 2.2, "sine", .045]].forEach(([freq, duration, type, volume]) => {
      const osc = audioContext.createOscillator(), gain = audioContext.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(volume, now + .18); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      osc.connect(gain); gain.connect(audioContext.destination); osc.start(now); osc.stop(now + duration + .03);
    });
  } catch (_) {}
}
function startAmbientMusic() {
  if (!soundOn || ambientTimer) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === "suspended") audioContext.resume();
    const notes = [110, 146.83, 164.81, 130.81, 98, 130.81, 146.83, 196];
    ambientTimer = window.setInterval(() => {
      if (!soundOn || !audioContext || gameState !== "playing") return;
      const now = audioContext.currentTime, osc = audioContext.createOscillator(), gain = audioContext.createGain();
      osc.type = ambientStep % 4 === 0 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(notes[ambientStep % notes.length] * (isBossLevel() ? .75 : 1), now);
      gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(isBossLevel() ? .045 : .022, now + .08); gain.gain.exponentialRampToValueAtTime(.0001, now + .52);
      osc.connect(gain); gain.connect(audioContext.destination); osc.start(now); osc.stop(now + .55); ambientStep++;
    }, 560);
  } catch (_) {}
}
function stopAmbientMusic() { if (ambientTimer) window.clearInterval(ambientTimer); ambientTimer = null; }

function makePlayer() {
  return {
    x: 65,
    y: 330,
    w: 26,
    h: 54,
    vx: 0,
    vy: 0,
    speed: 3.15,
    jumpPower: 11.5,
    grounded: false,
    facing: 1,
    health: 100,
    attackTimer: 0,
    attackCooldown: 0,
    attackHit: new Set(),
    anim: 0
  };
}

function addPlatform(x, y, w, h = 18) {
  platforms.push({ x, y, w, h });
}

function makeLevel(n) {
  platforms = [];
  enemies = [];
  coins = [];
  pickups = [];
  particles = [];
  hazards = [];
  arrows = [];
  bossWaves = [];
  bossFireballs = [];
  bossIntroFrames = 0;
  bossIntroTriggered = false;
  laserBolts = [];

  // Levels have different lengths and layouts.
  worldWidth = 2200 + n * 68;
  levelTheme = worldIndex(n);
  const bossLevel = isBossLevel(n);
  bossRoomStart = bossLevel ? worldWidth - 1120 : 0;
  bossRoomEnd = bossLevel ? worldWidth : 0;

  const floorY = 440;
  let gaps = [];

  if (n === 1) {
    gaps = [[470, 535], [980, 1050], [1480, 1550]];
  } else if (n === 2) {
    gaps = [[330, 405], [740, 830], [1220, 1310], [1700, 1780]];
  } else if (n === 3) {
    gaps = [[390, 490], [880, 970], [1370, 1460], [1810, 1900]];
  } else if (bossLevel) {
    gaps = [[760, 835], [1320, 1395], [1900, 1970]];
  } else {
    const gapCount = Math.min(3 + Math.floor(n / 2), 7);
    for (let i = 0; i < gapCount; i++) {
      const gx = 330 + i * ((worldWidth - 650) / gapCount);
      gaps.push([gx, gx + 65 + Math.min(n * 3, 40)]);
    }
  }

  // Ground sections leave actual gaps in the floor.
  let cursor = 0;
  for (const [start, end] of gaps) {
    if (start > cursor) addPlatform(cursor, floorY, start - cursor, 80);
    cursor = end;
  }
  if (cursor < worldWidth) {
    addPlatform(cursor, floorY, worldWidth - cursor, 80);
  }
  if (bossLevel) {
    // A descent into a wide underground arena. The boss floor stays clear for dodging.
    addPlatform(Math.max(28, bossRoomStart - 300), 270, 105, 16);
    addPlatform(Math.max(142, bossRoomStart - 190), 328, 108, 16);
    addPlatform(Math.max(260, bossRoomStart - 75), 386, 135, 16);
    addPlatform(bossRoomStart, floorY, worldWidth - bossRoomStart, 80);
    addPlatform(bossRoomStart + 180, 350, 120, 16);
    addPlatform(bossRoomStart + 430, 315, 130, 16);
    addPlatform(bossRoomStart + 700, 360, 135, 16);
  }

  // Different platform arrangements for different levels.
  const layouts = [
    [
      [245, 365, 125], [590, 330, 135],
      [790, 375, 140], [1110, 345, 135],
      [1320, 300, 145], [1640, 350, 135]
    ],
    [
      [170, 365, 110], [430, 330, 125],
      [640, 280, 120], [920, 355, 145],
      [1130, 310, 125], [1410, 270, 145],
      [1700, 345, 120]
    ],
    [
      [220, 350, 130], [540, 295, 120],
      [700, 360, 110], [1010, 315, 140],
      [1260, 270, 120], [1530, 340, 145],
      [1810, 300, 130]
    ],
    [
      [180, 360, 115], [410, 310, 120],
      [650, 355, 120], [890, 285, 130],
      [1130, 340, 110], [1360, 285, 130],
      [1610, 340, 120], [1850, 300, 130]
    ],
    [
      [200, 355, 125], [465, 305, 120], [720, 350, 130],
      [990, 290, 135], [1260, 340, 125], [1530, 275, 135],
      [1800, 325, 130], [2070, 285, 140]
    ]
  ];

  const layout = layouts[levelTheme];

  if (!bossLevel) {
    for (const [x, y, w] of layout) {
      if (x < worldWidth - 150) addPlatform(x, y, w);
    }
  }
  // Extra platforms for later worlds, spread out so each level has parkour between fights.
  if (n >= 5 && !bossLevel) {
    for (let i = 0; i < Math.min(n - 3, 6); i++) {
      const x = 300 + i * 285;
      if (x < worldWidth - 180) {
        addPlatform(x, 255 + (i % 2) * 55, 100, 16);
      }
    }
  }

  // One encounter at a time, with wide parkour gaps between fights.
  const count = bossLevel ? 4 : Math.min(4 + Math.floor(n / 12), 8);
  const startX = bossLevel ? bossRoomStart + 140 : 330;
  const endX = bossLevel ? worldWidth - 280 : worldWidth - 260;
  const spacing = count > 1 ? (endX - startX) / (count - 1) : 0;
  for (let i = 0; i < count; i++) {
    const x = startX + i * spacing;
    const isBoss = bossLevel && i === count - 1;
    const isElite = !isBoss && ((n >= 4 && i % 3 === 2) || (n >= 8 && i === count - 2));
    let kind;
    if (isBoss) kind = "boss";
    else if (isElite) kind = "elite";
    else if (n >= 41 && i % 3 === 0) kind = "infernal";
    else if (n >= 31 && i % 3 === 0) kind = "wraith";
    else if (n >= 21 && i % 3 === 0) kind = "venom";
    else if (n >= 11 && i % 3 === 0) kind = "stalker";
    else if (n >= 2 && i % 3 === 1) kind = "archer";
    else if (n >= 3 && i % 3 === 2) kind = "brute";
    else kind = "fighter";
    const tier = Math.max(0, Math.floor(n / 10) - 1);
    const hp = isBoss ? 170 + tier * 95 : Math.min(3 + Math.floor((n - 1) / 3) + (isElite ? 3 : 0) + (["brute", "venom", "infernal"].includes(kind) ? 3 : 0), 28);
    const patrolRadius = isBoss ? 220 : (kind === "archer" ? 95 : (["brute", "venom"].includes(kind) ? 115 : 140));
    const w = isBoss ? 76 : isElite ? 42 : (["brute", "venom", "infernal"].includes(kind) ? 46 : kind === "archer" ? 32 : 34);
    const h = isBoss ? 82 : isElite ? 52 : (["brute", "venom", "infernal"].includes(kind) ? 51 : kind === "archer" ? 45 : 44);
    enemies.push({
      x, homeX: x, patrolRadius, y: floorY - h, w, h, vx: 0,
      speed: Math.min((kind === "fighter" || kind === "stalker" ? 1.0 : ["brute", "venom", "infernal"].includes(kind) ? .72 : kind === "archer" ? .5 : .8) + n * .022, 2.25),
      hp, maxHp: hp, direction: -1, alive: true, attackCooldown: 0,
      anim: Math.random() * 10, elite: isElite, boss: isBoss, kind, tier,
      shotCooldown: Math.max(100, 230 - n * 1.4 + Math.random() * 65),
      laserCooldown: 120 + Math.random() * 100, laserTimer: 0, laserFired: false,
      bossCooldown: Math.max(80, 180 - tier * 14) + Math.random() * 45, bossCharge: 0,
      fireCooldown: Math.max(75, 160 - tier * 14) + Math.random() * 45, dashCooldown: Math.max(100, 240 - tier * 20), shockCooldown: 100,
      type: (i + n) % 3, patrolDirection: i % 2 ? -1 : 1, attacking: false
    });
  }

  // Coins appear along the route and above some platforms.
  for (let x = 145, i = 0; x < worldWidth - 130; x += 92, i++) {
    const platform = platforms.find(p =>
      p.y < floorY &&
      x > p.x + 5 &&
      x < p.x + p.w - 5
    );

    let coinY = platform
      ? platform.y - 25
      : floorY - 30 - (i % 3) * 14;

    if (gaps.some(([a, b]) => x > a - 15 && x < b + 15)) {
      coinY = floorY - 72;
    }

    coins.push({
      x,
      y: coinY,
      collected: false,
      phase: Math.random() * 6
    });
  }

  // Random power-ups: each world gets a few useful, collectible upgrades.
  const pickupTypes = ["health", "sword", "shield"];
  const pickupCount = bossLevel ? 5 : Math.min(6, 2 + Math.floor(n / 8));
  for (let i = 0; i < pickupCount; i++) {
    let px = 250 + Math.random() * (worldWidth - 520);
    // Avoid gaps and prefer solid ground or a reachable platform.
    for (let tries = 0; tries < 12 && gaps.some(([a, b]) => px > a - 8 && px < b + 8); tries++) {
      px = 250 + Math.random() * (worldWidth - 520);
    }
    const platform = platforms.find(p => p.y < floorY && px >= p.x + 18 && px <= p.x + p.w - 18);
    const py = platform ? platform.y - 27 : floorY - 32;
    pickups.push({ x: px, y: py, type: pickupTypes[Math.floor(Math.random() * pickupTypes.length)], collected: false, phase: Math.random() * 6 });
  }

  // Level-specific hazards: visible, avoidable danger zones.
  const hazardCount = bossLevel ? 2 : Math.min(2 + Math.floor(n * 0.22), 7);
  for (let i = 0; i < hazardCount; i++) {
    const x = 230 + i * ((worldWidth - 500) / hazardCount) + (i % 2 ? 34 : 0);
    if (gaps.some(([a, b]) => x > a - 70 && x < b + 30)) continue;
    // Keep hazard lanes away from enemy encounter centers and the boss arena.
    if (enemies.some(e => Math.abs(e.homeX - x) < 95)) continue;
    if (bossLevel && x >= bossRoomStart - 80) continue;
    const kind = n >= 7 && i % 4 === 3 ? "poison" : (n >= 3 && (i % 2 === 1 || (i === 0 && n >= 5)) ? "lava" : "spikes");
    hazards.push({ x, y: floorY - (kind === "spikes" ? 15 : 8), w: kind === "spikes" ? 34 + (n % 3) * 5 : 48 + (n % 3) * 6, h: kind === "spikes" ? 15 : 8, kind, phase: Math.random() * 6 });
  }

  portal = { x: worldWidth - 105, y: floorY - 76 };
}

function resetGame() {
  // Restart retries the current level without wiping earned coins or saved progress.
  startLevel();
}

function startLevel() {
  player = makePlayer();

  // Slightly harder movement at higher levels.
  player.speed = Math.min(3.15 + (level - 1) * 0.08, 4.1);
  basePlayerSpeed = player.speed;
  player.jumpPower = 11.5;

  makeLevel(level);
  cameraX = 0;
  invulnerable = 0;
  screenShake = 0;
  gameState = "playing";
  ui.overlay.classList.add("hidden");
  updateHUD();
}

function openPowerSelection() {
  const modal = document.getElementById("powerModal");
  if (modal) modal.classList.remove("hidden");
}
function closePowerSelection() {
  const modal = document.getElementById("powerModal");
  if (modal) modal.classList.add("hidden");
}
function activateTrialPower(kind) {
  if (gameState !== "playing") return;
  activeTrialPower = kind;
  trialPowerFrames = 600; // 10 seconds at 60 FPS
  if (kind === "health") {
    player.health = Math.min(100, player.health + 40);
    activeTrialPower = "health";
  } else if (kind === "sword") {
    showPickupToast("SUPER SWORD: 10 SECONDS");
  } else if (kind === "speed") {
    player.speed = Math.min(basePlayerSpeed + 2.1, 6.2);
    showPickupToast("SPEED BOOST: 10 SECONDS");
  } else if (kind === "shield") {
    invulnerable = Math.max(invulnerable, 600);
    showPickupToast("SHIELD: 10 SECONDS");
  }
  playSound("power");
  burst(player.x + player.w / 2, player.y + player.h / 2, kind === "sword" ? "#8df7ff" : kind === "speed" ? "#ffdf70" : kind === "health" ? "#5dffb1" : "#c5a2ff", 20);
  closePowerSelection();
  updateHUD();
}
// Rewarded-ad providers should call this only after their verified reward callback.
window.onRewardedAdCompleted = openPowerSelection;

function updateHUD() {
  ui.health.textContent = Math.max(0, Math.ceil(player.health));
  ui.healthFill.style.width = Math.max(0, player.health) + "%";

  ui.healthFill.style.background = player.health < 30
    ? "linear-gradient(90deg,#ff526d,#ff9a87)"
    : "linear-gradient(90deg,#4de0ad,#9af5c5)";

  ui.coins.textContent = totalCoins;
  ui.level.textContent = level + " / 50";
  ui.enemyCount.textContent = enemies.filter(e => e.alive).length;
}

function showOverlay(title, message, buttonText) {
  ui.overlayTitle.textContent = title;
  ui.overlayText.textContent = message;
  ui.continueBtn.textContent = buttonText;
  ui.overlay.classList.remove("hidden");
}

function nextAction() {
  if (gameState === "paused") { togglePause(); return; }
  if (gameState === "won") {
    if (level >= 50) {
      gameState = "menu";
      showLevelSelect();
      return;
    }
    level = Math.min(50, level + 1);
    savedLevel = Math.max(savedLevel, level);
    saveProgress();
    startLevel();
  } else if (gameState === "dead") {
    startLevel();
  }
}

function refreshLevelGrid() {
  const grid = document.getElementById("levelGrid");
  if (!grid) return;
  grid.innerHTML = "";
  for (let n = 1; n <= 50; n++) {
    const unlocked = n <= savedLevel;
    const boss = n % 10 === 0;
    const btn = document.createElement("button");
    btn.className = "level-tile " + (unlocked ? "unlocked" : "locked") + (boss ? " boss" : "") + (n === selectedLevel ? " current" : "");
    btn.disabled = !unlocked;
    btn.setAttribute("aria-label", unlocked ? `Play level ${n}${boss ? ', king boss' : ''}` : `Level ${n} locked`);
    btn.innerHTML = `${boss ? '<span class="crown">👑</span>' : ''}${unlocked ? n : '🔒'}<span class="tile-sub">${boss ? 'KING BOSS' : 'LEVEL'}</span>`;
    if (unlocked) btn.addEventListener("click", () => beginLevelFromMenu(n));
    grid.appendChild(btn);
  }
  const summary = document.getElementById("unlockSummary");
  if (summary) summary.textContent = `Levels 1–${savedLevel} unlocked · ${50 - savedLevel} still locked · ${Math.floor((savedLevel - 1) / 10)} kings defeated`;
  const cont = document.getElementById("continueGameBtn");
  if (cont) cont.textContent = `CONTINUE · LEVEL ${Math.min(savedLevel, 50)}`;
}
function hideStartupScreens() {
  ["mainMenu", "levelSelectScreen", "loadingScreen"].forEach(id => document.getElementById(id)?.classList.add("hidden"));
}
function showMainMenu() {
  gameState = "menu";
  document.getElementById("mainMenu")?.classList.remove("hidden");
  document.getElementById("levelSelectScreen")?.classList.add("hidden");
  document.getElementById("loadingScreen")?.classList.add("hidden");
  refreshLevelGrid();
}
function showLevelSelect() {
  gameState = "menu";
  document.getElementById("mainMenu")?.classList.add("hidden");
  document.getElementById("levelSelectScreen")?.classList.remove("hidden");
  document.getElementById("loadingScreen")?.classList.add("hidden");
  refreshLevelGrid();
}
function beginLevelFromMenu(n) {
  if (n > savedLevel) return;
  selectedLevel = n;
  level = n;
  hideStartupScreens();
  startLevel();
  startAmbientMusic();
}
document.getElementById("startGameBtn")?.addEventListener("click", () => showLevelSelect());
document.getElementById("openLevelsBtn")?.addEventListener("click", () => showLevelSelect());
document.getElementById("continueGameBtn")?.addEventListener("click", () => beginLevelFromMenu(Math.min(savedLevel, 50)));
document.getElementById("backToMenuBtn")?.addEventListener("click", showMainMenu);

ui.continueBtn.addEventListener("click", nextAction);
document.getElementById("restartBtn").addEventListener("click", resetGame);
document.getElementById("pauseBtn")?.addEventListener("click", togglePause);
const soundBtn = document.getElementById("soundBtn");
soundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? "♫ Sound: ON" : "♫ Sound: OFF";
  if (soundOn) { playSound("coin"); startAmbientMusic(); } else stopAmbientMusic();
});
const crouchBtn = document.getElementById("crouchBtn");
if (crouchBtn) {
  const crouchDown = e => { e.preventDefault(); setKey("s", true); };
  const crouchUp = e => { e.preventDefault(); setKey("s", false); };
  crouchBtn.addEventListener("pointerdown", crouchDown);
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => crouchBtn.addEventListener(ev, crouchUp));
}

// Fullscreen support.
const shell = document.getElementById("gameShell");
const fullscreenBtn = document.getElementById("fullscreenBtn");

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await shell.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    alert("Fullscreen is not available in this browser.");
  }
}

const powerRewardBtn = document.getElementById("powerRewardBtn");
if (powerRewardBtn) powerRewardBtn.addEventListener("click", openPowerSelection);
document.querySelectorAll("[data-trial-power]").forEach(button => {
  button.addEventListener("click", () => activateTrialPower(button.dataset.trialPower));
});
const powerCloseBtn = document.getElementById("powerCloseBtn");
if (powerCloseBtn) powerCloseBtn.addEventListener("click", closePowerSelection);

fullscreenBtn.addEventListener("click", toggleFullscreen);

document.addEventListener("fullscreenchange", () => {
  fullscreenBtn.textContent = document.fullscreenElement
    ? "⛶ Exit Full Screen"
    : "⛶ Full Screen";
});

function setKey(key, down) {
  keys[key] = down;
}

window.addEventListener("keydown", e => {
  const key = e.key.toLowerCase();

  if ([" ", "arrowup", "arrowleft", "arrowright", "arrowdown"].includes(key)) {
    e.preventDefault();
  }

  if ((key === "p" || key === "escape") && !e.repeat) { togglePause(); return; }
  if (!keys[key]) {
    if (key === " " || key === "w" || key === "arrowup") jumpQueued = true;
    if (key === "j" || key === "k") attackQueued = true;
    if (key === "f") toggleFullscreen();
  }

  setKey(key, true);
  if (key === "r") resetGame();
});

window.addEventListener("keyup", e => setKey(e.key.toLowerCase(), false));
window.addEventListener("blur", () => { keys = {}; });

function bindHoldButton(id, key) {
  const btn = document.getElementById(id);

  const down = e => {
    e.preventDefault();
    setKey(key, true);
  };

  const up = e => {
    e.preventDefault();
    setKey(key, false);
  };

  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointerleave", up);
  btn.addEventListener("pointercancel", up);
}

bindHoldButton("leftBtn", "arrowleft");
bindHoldButton("rightBtn", "arrowright");

document.getElementById("jumpBtn").addEventListener("pointerdown", e => {
  e.preventDefault();
  jumpQueued = true;
});

document.getElementById("attackBtn").addEventListener("pointerdown", e => {
  e.preventDefault();
  attackQueued = true;
});

function overlaps(a, b) {
  return a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y;
}

function burst(x, y, color, amount = 9) {
  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3.5;

    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 20 + Math.random() * 15,
      maxLife: 35,
      size: 2 + Math.random() * 3,
      color
    });
  }
}

function damagePlayer(amount, sourceX) {
  if (invulnerable > 0 || gameState !== "playing") return;

  player.health -= amount;
  player.vx = player.x < sourceX ? -4.5 : 4.5;
  player.vy = -4;
  invulnerable = 60;
  screenShake = 7;

  burst(
    player.x + player.w / 2,
    player.y + player.h / 2,
    "#ff526d",
    12
  );

  if (player.health <= 0) {
    player.health = 0;
    gameState = "dead";
    playSound("lose");
    saveProgress();
    showOverlay(
      "LEVEL " + level + " FAILED",
      "Retry this level. Your unlocked progress and coins are saved.",
      "Retry Level"
    );
  }
}

function attack() {
  if (player.attackCooldown > 0 || gameState !== "playing") return;
  playSound("attack");

  player.attackTimer = 14;
  player.attackCooldown = 30;
  player.attackHit = new Set();
}

function updatePlayer() {
  const left = keys.a || keys.arrowleft;
  const right = keys.d || keys.arrowright;

  const crouching = keys.s || keys.arrowdown;
  if (crouching && player.grounded) {
    if (player.h !== 38) player.y += 16;
    player.h = 38;
  } else {
    if (player.h === 38) player.y -= 16;
    player.h = 54;
  }

  if (left && !right) {
    player.vx = -player.speed * (crouching ? 0.55 : 1);
    player.facing = -1;
  } else if (right && !left) {
    player.vx = player.speed * (crouching ? 0.55 : 1);
    player.facing = 1;
  } else {
    player.vx *= 0.76;
    if (Math.abs(player.vx) < 0.12) player.vx = 0;
  }

  if (jumpQueued && player.grounded) {
    player.vy = -player.jumpPower;
    playSound("jump");
    player.grounded = false;
    burst(player.x + player.w / 2, player.y + player.h, "#a9c8e9", 5);
  }
  jumpQueued = false;

  if (attackQueued) attack();
  attackQueued = false;

  if (player.attackTimer > 0) player.attackTimer--;
  if (player.attackCooldown > 0) player.attackCooldown--;
  if (invulnerable > 0) invulnerable--;
  if (trialPowerFrames > 0) {
    trialPowerFrames--;
    if (trialPowerFrames === 0) {
      if (activeTrialPower === "speed") player.speed = basePlayerSpeed;
      if (activeTrialPower === "sword") showPickupToast("SWORD TRIAL ENDED");
      if (activeTrialPower === "shield") showPickupToast("SHIELD TRIAL ENDED");
      activeTrialPower = "";
    }
  }

  player.anim += Math.abs(player.vx) * (crouching ? 0.13 : 0.18);

  const oldY = player.y;
  player.x += player.vx;
  player.x = Math.max(0, Math.min(worldWidth - player.w, player.x));

  player.vy += GRAVITY;
  player.y += player.vy;
  player.grounded = false;

  for (const p of platforms) {
    const horizontal = player.x + player.w > p.x &&
      player.x < p.x + p.w;

    if (
      horizontal &&
      player.vy >= 0 &&
      oldY + player.h <= p.y + 5 &&
      player.y + player.h >= p.y
    ) {
      player.y = p.y - player.h;
      player.vy = 0;
      player.grounded = true;
    }
  }

  // Falling into a gap costs health and returns the player to safety.
  if (player.y > H + 70) {
    player.health -= 25;
    burst(player.x, H - 20, "#ff657b", 10);

    if (player.health <= 0) {
      player.health = 0;
      gameState = "dead";
      playSound("lose");
      saveProgress();
      showOverlay("LEVEL " + level + " FAILED", "Retry this level. Your unlocked progress is saved.", "Retry Level");
    } else {
      player.x = Math.max(30, player.x - 110);
      player.y = 250;
      player.vy = 0;
      player.vx = 0;
      invulnerable = 80;
    }
  }
}

function updateEnemies() {
  const crouching = !!(keys.s || keys.arrowdown) && player.grounded;
  for (const e of enemies) {
    if (!e.alive) continue;
    e.anim += Math.abs(e.vx) > 0.15 ? 0.19 : 0.075;
    if (e.attackCooldown > 0) e.attackCooldown--;

    const dx = player.x + player.w / 2 - (e.x + e.w / 2);
    const distance = Math.abs(dx);
    const leftBound = Math.max(0, e.homeX - e.patrolRadius);
    const rightBound = Math.min(worldWidth - e.w, e.homeX + e.patrolRadius);
    const aggroRange = e.kind === "archer" ? 330 : (e.boss ? 360 : (e.elite ? 255 : 220));
    // Only the nearest living encounter ahead activates. This creates a clear fight, then a parkour stretch.
    const nearestEncounter = enemies
      .filter(other => other.alive)
      .sort((a, b) => Math.abs((a.x + a.w / 2) - (player.x + player.w / 2)) - Math.abs((b.x + b.w / 2) - (player.x + player.w / 2)))[0];
    const playerInZone = distance < aggroRange && (e === nearestEncounter || distance < 55);
    e.shotCooldown--;

    // Elite laser is a close-range, telegraphed attack. A grounded crouch avoids the beam.
    if (e.elite && !e.boss) {
      if (e.laserCooldown > 0) e.laserCooldown--;
      if (e.laserTimer > 0) {
        e.laserTimer--;
        if (e.laserTimer === 10 && !e.laserFired) {
          e.laserFired = true;
          const beamY = e.y + 8;
          const beamX = player.x + player.w / 2;
          const between = distance < 235;
          if (between && !crouching && player.y < beamY + 8 && player.y + player.h > beamY - 8) damagePlayer(22, e.x);
          laserBolts.push({ x1: e.x + e.w / 2, x2: beamX, y: beamY, life: 13 });
          playSound("laser");
          burst(e.x + e.w / 2, beamY, "#f4a7ff", 8);
        }
      } else if (distance < 215 && distance > 42 && e.laserCooldown <= 0) {
        e.laserTimer = 36;
        e.laserFired = false;
        e.laserCooldown = 190 + Math.random() * 65;
      }
    }

    // Final boss: telegraph a ground shockwave, then launch it toward the player.
    // Jump over the low wave; the long warning makes the attack readable and fair.
    if (e.boss && playerInZone) {
      if (e.bossCooldown > 0) e.bossCooldown--;
      if (e.bossCharge > 0) {
        e.bossCharge--;
        e.vx *= 0.75;
        if (e.bossCharge === 1) {
          const waveDir = dx < 0 ? -1 : 1;
          bossWaves.push({ x: e.x + e.w / 2, y: 425, vx: waveDir * (2.15 + level * 0.035), life: 190, damage: 18 + e.tier * 2, tier: e.tier });
          e.bossCooldown = 245;
          playSound("laser");
          burst(e.x + e.w / 2, 426, "#ff7b43", 14);
        }
      } else if (e.bossCooldown <= 0 && distance < 310) {
        e.bossCharge = 48;
        e.attacking = true;
      }
    }

    if (e.boss && playerInZone) {
      if (e.fireCooldown > 0) e.fireCooldown--;
      if (e.dashCooldown > 0) e.dashCooldown--;
      if (e.fireCooldown <= 0 && distance > 100 && distance < 560 && !e.bossCharge) {
        const dir = dx < 0 ? -1 : 1;
        bossFireballs.push({ x: e.x + e.w / 2 + dir * 18, y: e.y + 22, vx: dir * (3.0 + e.tier * .22), vy: -1.4 - e.tier * .08, life: 180, damage: 16 + e.tier * 3, phase: Math.random() * 6, tier: e.tier });
        if (e.tier >= 2) bossFireballs.push({ x: e.x + e.w / 2 + dir * 18, y: e.y + 12, vx: dir * (2.6 + e.tier * .18), vy: -2.2, life: 180, damage: 12 + e.tier * 2, phase: Math.random() * 6, tier: e.tier });
        e.fireCooldown = Math.max(72, 175 - e.tier * 20) + Math.random() * 40;
        e.attacking = true; playSound("laser"); burst(e.x + e.w / 2, e.y + 24, ["#ff7b43", "#72d8ff", "#a7ff55", "#c38cff", "#ff2e35"][e.tier || 0], 8);
      }
      if (e.dashCooldown <= 0 && distance > 100 && distance < 420 && !e.dashFrames) {
        e.dashFrames = Math.max(16, 24 - e.tier * 2); e.dashDirection = dx < 0 ? -1 : 1;
        e.dashCooldown = Math.max(105, 250 - e.tier * 24); e.attacking = true;
      }
      if (e.dashFrames > 0) {
        e.dashFrames--; e.vx = (e.dashDirection || (dx < 0 ? -1 : 1)) * (4.4 + e.tier * .35);
        if (overlaps(player, e) && e.attackCooldown <= 0) { damagePlayer(20 + e.tier * 3, e.x); e.attackCooldown = 75; }
      }
    }

    if (e.kind === "archer") {
      // Archers hold a small firing pocket and visibly draw their bow; they do not rush the player.
      e.direction = dx < 0 ? -1 : 1;
      if (distance < 145) e.vx = -e.direction * e.speed * 0.52;
      else if (distance > 285 && playerInZone) e.vx = e.direction * e.speed * 0.38;
      else e.vx = 0;
      if (playerInZone && distance < 390 && e.shotCooldown <= 0) {
        // One deliberate, slower arrow per draw cycle; long cooldown prevents arrow spam.
        arrows.push({ x: e.x + e.w / 2 + e.direction * 12, y: e.y + 2, vx: e.direction * (1.16 + level * 0.012), vy: -0.005, life: 300, damage: 9 + Math.floor(level / 3) });
        e.shotCooldown = 365 + Math.random() * 85;
        e.attacking = true;
      } else if (e.shotCooldown % 24 === 0) e.attacking = false;
    } else if (playerInZone) {
      e.direction = dx < 0 ? -1 : 1;
      const targetX = Math.max(0, Math.min(worldWidth - e.w, player.x + player.w / 2 - e.w / 2));
      // Chase outside the patrol box too, but never leave the level; this fixes enemies spinning at their boundary.
      if (Math.abs(targetX - e.x) > 7) e.vx = Math.sign(targetX - e.x) * e.speed * (e.kind === "brute" || e.boss ? 0.72 : 0.88);
      else e.vx = 0;
    } else {
      // Local patrol: enemies stay in their own area and turn at patrol boundaries.
      if (e.x <= leftBound + 2) e.patrolDirection = 1;
      if (e.x + e.w >= rightBound - 2) e.patrolDirection = -1;
      e.vx = e.patrolDirection * e.speed * (e.kind === "brute" ? 0.48 : 0.62);
      e.direction = e.vx < 0 ? -1 : 1;
    }

    e.x += e.vx;
    const moveLeftBound = playerInZone ? 0 : leftBound;
    const moveRightBound = playerInZone ? worldWidth - e.w : rightBound;
    if (e.x < moveLeftBound) { e.x = moveLeftBound; e.vx = 0; e.patrolDirection = 1; }
    if (e.x > moveRightBound) { e.x = moveRightBound; e.vx = 0; e.patrolDirection = -1; }

    if (overlaps(player, e) && e.attackCooldown <= 0) {
      damagePlayer(e.elite ? 17 : 9 + Math.min(level, 8), e.x);
      e.attackCooldown = 55;
    }

    if (player.attackTimer > 0 && !player.attackHit.has(e)) {
      const swordBox = {
        x: player.facing === 1 ? player.x + player.w - 2 : player.x - (40 + swordPower * 4),
        y: player.y + 5, w: 42 + swordPower * 4, h: 39
      };
      if (overlaps(swordBox, e)) {
        player.attackHit.add(e);
        e.hp -= (activeTrialPower === "sword" && trialPowerFrames > 0 ? 3 : swordPower);
        e.vx = player.facing * (e.boss ? 1.5 : 4);
        playSound("hit");
        burst(e.x + e.w / 2, e.y + 20, e.elite ? "#d7a5ff" : "#ffad72", 10);
        screenShake = 3;
        if (e.hp <= 0) {
          e.alive = false;
          totalCoins += e.boss ? 50 : (e.elite ? 6 : 3);
          if (e.boss) {
            // A guaranteed final-boss reward makes the last fight feel worthwhile.
            pickups.push({ x: e.x + e.w / 2, y: 440 - 32, type: swordPower < 3 ? "sword" : "health", collected: false, phase: 0 });
          }
          saveProgress();
          burst(e.x + e.w / 2, e.y + e.h / 2, "#ffdc72", 16);
        }
      }
    }
  }
}

function updateCoins() {
  for (const c of coins) {
    if (c.collected) continue;

    const rect = { x: c.x - 9, y: c.y - 10, w: 18, h: 20 };

    if (overlaps(player, rect)) {
      c.collected = true;
      totalCoins++;
      playSound("coin");
      saveProgress();
      burst(c.x, c.y, "#ffda72", 8);
    }
  }
}

function updatePickups() {
  for (const item of pickups) {
    if (item.collected) continue;
    const box = { x: item.x - 13, y: item.y - 14, w: 26, h: 28 };
    if (!overlaps(player, box)) continue;
    item.collected = true;
    if (item.type === "health") {
      const healAmount = Math.min(45, 30 + level * 2);
      player.health = Math.min(100, player.health + healAmount);
      playSound("power");
      burst(item.x, item.y, "#5dffb1", 14);
      showPickupToast("+" + healAmount + " HEALTH");
    } else if (item.type === "sword") {
      swordPower = Math.min(3, swordPower + 1);
      playSound("power");
      burst(item.x, item.y, "#8df7ff", 16);
      saveProgress();
      showPickupToast("SWORD POWER x" + swordPower);
    } else {
      invulnerable = Math.max(invulnerable, 180 + level * 12);
      playSound("power");
      burst(item.x, item.y, "#c5a2ff", 14);
      showPickupToast("SHIELD: " + Math.round((180 + level * 12) / 60) + " SECONDS");
    }
    updateHUD();
  }
}

let pickupToast = "";
let pickupToastTimer = 0;
function showPickupToast(message) {
  pickupToast = message;
  pickupToastTimer = 90;
}

function updateHazardsAndArrows() {
  for (const bolt of laserBolts) bolt.life--;
  laserBolts = laserBolts.filter(b => b.life > 0);
  for (const h of hazards) {
    if (h.kind === "spikes") {
      const playerFeet = player.y + player.h;
      const overlapsX = player.x + player.w > h.x && player.x < h.x + h.w;
      if (overlapsX && playerFeet >= h.y && player.y < h.y + h.h + 5 && player.vy >= 0) {
        damagePlayer(18, h.x + h.w / 2);
        player.vy = -5.5;
      }
    } else {
      const rect = { x: h.x, y: h.y - 2, w: h.w, h: 24 };
      if (overlaps(player, rect) && invulnerable <= 0) {
        damagePlayer(h.kind === "lava" ? 20 : 12, h.x + h.w / 2);
      }
    }
  }
  for (const wave of bossWaves) {
    wave.x += wave.vx;
    wave.life--;
    const waveBox = { x: wave.x - 20, y: wave.y - 8, w: 40, h: 14 };
    if (overlaps(player, waveBox) && player.y + player.h > wave.y - 17 && invulnerable <= 0) {
      damagePlayer(wave.damage, wave.x);
      wave.life = 0;
    }
  }
  bossWaves = bossWaves.filter(wave => wave.life > 0 && wave.x > cameraX - 120 && wave.x < cameraX + W + 120);

  for (const f of bossFireballs) {
    f.x += f.vx; f.y += f.vy; f.vy += .035; f.life--;
    if (overlaps(player, { x: f.x - 13, y: f.y - 12, w: 26, h: 24 })) {
      damagePlayer(f.damage || 18, f.x); f.life = 0;
      burst(f.x, f.y, ["#ff7b43", "#72d8ff", "#a7ff55", "#c38cff", "#ff2e35"][f.tier || 0], 12);
    }
  }
  bossFireballs = bossFireballs.filter(f => f.life > 0 && f.x > cameraX - 120 && f.x < cameraX + W + 120);

  for (const a of arrows) {
    a.x += a.vx; a.y += a.vy; a.life--;
    const box = { x: a.x - 7, y: a.y - 3, w: 14, h: 6 };
    const crouching = !!(keys.s || keys.arrowdown) && player.grounded;
    // A timed sword swing parries and destroys incoming arrows before they hit the player.
    if (player.attackTimer > 0) {
      const swordBox = { x: player.facing === 1 ? player.x + player.w - 2 : player.x - (40 + swordPower * 4), y: player.y + 5, w: 42 + swordPower * 4, h: 39 };
      if (overlaps(swordBox, box)) {
        a.life = 0;
        playSound("hit");
        burst(a.x, a.y, "#e8f8ff", 6);
        continue;
      }
    }
    // Arrows are aimed high: crouching lowers the silhouette below their flight path.
    if (overlaps(player, box) && !(crouching && a.y < player.y + 12)) {
      damagePlayer(a.damage || (9 + Math.floor(level / 3)), a.x);
      a.life = 0;
    }
  }
  arrows = arrows.filter(a => a.life > 0 && a.x > cameraX - 100 && a.x < cameraX + W + 100);
}

function updateParticles() {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.vx *= 0.98;
    p.life--;
  }

  particles = particles.filter(p => p.life > 0);
}

function update() {
  if (gameState === "playing" && isBossLevel(level) && !bossIntroTriggered && player.x > bossRoomStart + 20) {
    bossIntroTriggered = true; bossIntroFrames = 210; gameState = "bossIntro"; playBossMusic();
  }
  if (gameState !== "playing") {
    updateParticles();
    return;
  }

  updatePlayer();
  updateEnemies();
  updateCoins();
  updatePickups();
  if (pickupToastTimer > 0) pickupToastTimer--;
  updateHazardsAndArrows();
  updateParticles();

  cameraX = Math.max(0, Math.min(
    worldWidth - W,
    player.x + player.w / 2 - W * 0.42
  ));

  if (player.x > portal.x - 20) {
    if (enemies.every(e => !e.alive)) {
      gameState = "won";
      playSound("win");
      savedLevel = Math.max(savedLevel, Math.min(50, level + 1));
      saveProgress();
      if (level >= 50) {
        showOverlay("BEYOND LIMITS!", "You defeated the Infernal King and cleared all 50 levels. Total coins: " + totalCoins, "Level Select");
      } else if (isBossLevel(level)) {
        showOverlay("👑 KING DEFEATED!", bossName(level) + " has fallen. World " + (worldIndex(level) + 2) + " is unlocked!", "Next World →");
      } else {
        showOverlay("LEVEL " + level + " COMPLETE!", "Parkour cleared. Progress saved — the next level is now unlocked.", "Next Level →");
      }
    } else {
      player.x = portal.x - 25;
    }
  }

  if (screenShake > 0) screenShake *= 0.8;
  if (screenShake < 0.3) screenShake = 0;

  updateHUD();
}

function drawUndergroundRoom(time) {
  if (!isBossLevel(level)) return;
  const left = bossRoomStart - cameraX, right = bossRoomEnd - cameraX;
  if (right < 0 || left > W) return;
  ctx.save(); ctx.fillStyle = "#070914"; ctx.fillRect(left, 0, right - left, H);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#101326"); g.addColorStop(1, "#2b171d"); ctx.fillStyle = g; ctx.fillRect(left, 0, right - left, H);
  for (let x = Math.max(left + 20, 0); x < Math.min(right, W); x += 185) {
    ctx.strokeStyle = "#49303b"; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 15, 80); ctx.lineTo(x + 7, 145); ctx.stroke();
    ctx.fillStyle = "#ff7438"; ctx.shadowColor = "#ff4b23"; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(x + 40, 225 + Math.sin(time * .006 + x) * 3, 5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = .25; ctx.fillStyle = "#ff5837";
  for (let i = 0; i < 10; i++) { const px = left + ((time * .015 + i * 97) % Math.max(1, right - left)); const py = 90 + ((i * 57 + time * .02) % 300); ctx.beginPath(); ctx.arc(px, py, 2 + i % 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
function drawBossIntro(time) {
  ctx.save(); ctx.fillStyle = "#03040beF"; ctx.fillRect(0, 0, W, H);
  const pulse = .65 + Math.sin(time * .012) * .18; ctx.globalAlpha = pulse; ctx.strokeStyle = "#ff623c"; ctx.lineWidth = 2; ctx.strokeRect(105, 145, 750, 205);
  ctx.shadowColor = "#ff3f25"; ctx.shadowBlur = 24; ctx.fillStyle = "#ff633e"; ctx.font = "900 15px Arial"; ctx.textAlign = "center";
  ctx.fillText("WORLD " + (worldIndex(level) + 1) + " KING CHALLENGE", W / 2, 190);
  ctx.fillStyle = "#fff0e7"; ctx.font = "900 40px Arial"; ctx.fillText(bossName(level), W / 2, 250);
  ctx.fillStyle = "#e7b9b1"; ctx.font = "bold 13px Arial"; ctx.fillText("DEFEAT THE KING TO UNLOCK THE NEXT WORLD", W / 2, 292);
  ctx.textAlign = "left"; ctx.restore();
}
function drawBossFireballs(time) {
  const colors = ["#ff4c20", "#72d8ff", "#a7ff55", "#c38cff", "#ff2e35"];
  for (const f of bossFireballs) {
    const x = f.x - cameraX, color = colors[f.tier || 0]; ctx.save(); ctx.translate(x, f.y); ctx.rotate(time * .012);
    ctx.shadowColor = color; ctx.shadowBlur = 20; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff0a0"; ctx.beginPath(); ctx.arc(-2, -2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-14, 4); ctx.lineTo(-25, 1); ctx.lineTo(-18, -4); ctx.stroke(); ctx.restore();
  }
}

function drawBackground(time) {
  const themes = [
    ["#101c36", "#263c56", "#172b42"],
    ["#18251b", "#3c5736", "#1d3224"],
    ["#0c2630", "#28565b", "#123940"],
    ["#211932", "#493b6c", "#241d3b"],
    ["#281a19", "#684036", "#3b2526"]
  ];

  const theme = themes[levelTheme];
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, theme[0]);
  sky.addColorStop(0.7, theme[1]);
  sky.addColorStop(1, theme[2]);

  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Stars and drifting embers.
  for (let i = 0; i < 65; i++) {
    let x = (i * 137 - cameraX * 0.15) % (W + 30);
    if (x < 0) x += W + 30;

    const y = (i * 67) % 245;
    ctx.fillStyle = levelTheme === 3
      ? "#ffb18b88"
      : "#d5e6ff77";

    ctx.fillRect(x, y, i % 4 === 0 ? 3 : 2, i % 4 === 0 ? 3 : 2);
  }

  // Parallax mountains.
  for (let i = 0; i < 8; i++) {
    const x = i * 190 - (cameraX * 0.28 % 190);

    ctx.fillStyle = theme[2];
    ctx.beginPath();
    ctx.moveTo(x - 30, 420);
    ctx.lineTo(x + 80, 185 + (i % 3) * 35);
    ctx.lineTo(x + 210, 420);
    ctx.closePath();
    ctx.fill();
  }

  // Ruins in the distance.
  for (let i = 0; i < 9; i++) {
    const x = i * 300 - (cameraX * 0.5 % 300);

    ctx.fillStyle = levelTheme === 3 ? "#50312f" : "#243751";
    ctx.fillRect(x, 320, 35, 90);
    ctx.fillRect(x - 8, 310, 51, 12);
    ctx.fillRect(x + 10, 290, 15, 20);
  }

  // Atmospheric moon, haze bands, and sharper distant spires.
  ctx.save();
  ctx.globalAlpha = .6;
  const moonX = 770 - (cameraX * .06 % 150);
  const moonY = 90 + levelTheme * 8;
  ctx.fillStyle = levelTheme === 3 ? "#ff9b70" : "#a9e8f4";
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 24;
  ctx.beginPath(); ctx.arc(moonX, moonY, 29, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.globalAlpha = .13; ctx.fillStyle = "#e4f6ff";
  for (let i = 0; i < 5; i++) ctx.fillRect((i * 240 - cameraX * .18 % 240), 225 + i % 2 * 20, 130, 2);
  ctx.globalAlpha = .35;
  for (let i = 0; i < 12; i++) {
    const sx = i * 115 - (cameraX * .38 % 115);
    ctx.fillStyle = levelTheme === 3 ? "#9a5745" : "#17283d";
    ctx.beginPath(); ctx.moveTo(sx, 410); ctx.lineTo(sx + 25, 260 + (i % 4) * 18); ctx.lineTo(sx + 49, 410); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // World label.
  const names = ["Forgotten Valley", "Dreadwood Frontier", "Venom Depths", "Phantom Citadel", "Inferno Crownlands"];

  ctx.fillStyle = "#ffffffb0";
  ctx.font = "bold 12px Arial";
  ctx.fillText("LEVEL " + level + "  /  " + names[levelTheme], 18, 22);
}

function drawPlatforms() {
  for (const p of platforms) {
    const x = p.x - cameraX;
    if (x + p.w < 0 || x > W) continue;
    const top = levelTheme === 3 ? "#ff9b67" : (levelTheme === 2 ? "#61e6c2" : "#79c9df");
    const mid = levelTheme === 3 ? "#67352e" : (levelTheme === 1 ? "#43314e" : "#243b55");
    const dark = levelTheme === 3 ? "#2b1a20" : "#101c2e";
    // Layered stone slab with beveled edge, cracks and luminous top seam.
    ctx.fillStyle = dark; ctx.fillRect(x, p.y + 5, p.w, p.h);
    ctx.fillStyle = mid; ctx.fillRect(x, p.y + 3, p.w, Math.min(26, p.h));
    ctx.fillStyle = top; ctx.fillRect(x, p.y, p.w, 4);
    ctx.fillStyle = "#ffffff25"; ctx.fillRect(x + 4, p.y + 6, Math.max(0, p.w - 8), 2);
    ctx.fillStyle = "#050b1680";
    for (let bx = x + 16; bx < x + p.w - 8; bx += 42) {
      ctx.fillRect(bx, p.y + 13, 19, 3);
      ctx.fillRect(bx + 21, p.y + 22, 7, 2);
    }
    ctx.strokeStyle = "#00000035"; ctx.lineWidth = 1;
    for (let bx = x + 29; bx < x + p.w; bx += 83) {
      ctx.beginPath(); ctx.moveTo(bx, p.y + 4); ctx.lineTo(bx - 4, p.y + 12); ctx.lineTo(bx + 2, p.y + 18); ctx.stroke();
    }
  }
}

function drawHazards(time) {
  for (const h of hazards) {
    const x = h.x - cameraX;
    if (x + h.w < 0 || x > W) continue;
    if (h.kind === "spikes") {
      ctx.fillStyle = "#b8c8d9"; ctx.strokeStyle = "#e8f2ff"; ctx.lineWidth = 1;
      const count = Math.max(3, Math.floor(h.w / 12));
      for (let i = 0; i < count; i++) {
        const sx = x + i * h.w / count; const sw = h.w / count;
        ctx.beginPath(); ctx.moveTo(sx, h.y + h.h); ctx.lineTo(sx + sw / 2, h.y); ctx.lineTo(sx + sw, h.y + h.h); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    } else {
      const lava = h.kind === "lava";
      if (lava) {
        ctx.save(); ctx.shadowColor = "#ff4d21"; ctx.shadowBlur = 16;
        ctx.fillStyle = "#5a1b1b"; ctx.fillRect(x, h.y, h.w, 20);
        ctx.fillStyle = "#ff4b24"; ctx.fillRect(x, h.y + 2, h.w, 5);
        ctx.fillStyle = "#ffb23e";
        for (let i = 0; i < h.w; i += 15) {
          const bob = Math.sin(time * .009 + h.phase + i) * 3;
          ctx.beginPath(); ctx.ellipse(x + i + 5, h.y + 5 + bob, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = .35;
        for (let i = 0; i < 3; i++) {
          const bx = x + ((time * .025 + i * 23 + h.phase * 10) % Math.max(1, h.w));
          const by = h.y - 5 - ((time * .035 + i * 9) % 20);
          ctx.fillStyle = "#ffcf68"; ctx.beginPath(); ctx.arc(bx, by, 2 + i % 2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      } else {
        ctx.fillStyle = "#174d45"; ctx.fillRect(x, h.y, h.w, 20);
        ctx.fillStyle = "#51e5a0";
        for (let i = 0; i < h.w; i += 16) {
          const bob = Math.sin(time * .008 + h.phase + i) * 2;
          ctx.fillRect(x + i, h.y + 2 + bob, 10, 3);
        }
        ctx.globalAlpha = .25; ctx.fillStyle = "#75ffb6"; ctx.fillRect(x, h.y - 5, h.w, 5); ctx.globalAlpha = 1;
      }
    }
  }
}
function drawLaserEffects() {
  for (const e of enemies) {
    if (!e.alive || !e.elite || e.boss || e.laserTimer <= 0) continue;
    const x1 = e.x + e.w / 2 - cameraX;
    const x2 = player.x + player.w / 2 - cameraX;
    const y = e.y + 8;
    const telegraph = e.laserTimer > 10;
    ctx.save();
    ctx.globalAlpha = telegraph ? .45 + Math.sin(e.laserTimer * .8) * .25 : .95;
    ctx.strokeStyle = telegraph ? "#ffb4ff" : "#ff5df2";
    ctx.lineWidth = telegraph ? 2 : 8;
    ctx.shadowColor = "#ff53f4"; ctx.shadowBlur = telegraph ? 8 : 22;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    ctx.restore();
  }
  for (const b of laserBolts) {
    ctx.save(); ctx.globalAlpha = Math.min(1, b.life / 6);
    ctx.strokeStyle = "#ffd8ff"; ctx.lineWidth = 7; ctx.shadowColor = "#ff53f4"; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.moveTo(b.x1 - cameraX, b.y); ctx.lineTo(b.x2 - cameraX, b.y); ctx.stroke(); ctx.restore();
  }
}

function drawArrows() {
  for (const a of arrows) {
    const x = a.x - cameraX;
    ctx.save();
    ctx.translate(x, a.y);
    ctx.rotate(a.vx < 0 ? Math.PI : 0);
    // Readable wooden arrow: shaft, metal tip, and feather fletching.
    ctx.lineCap = "round";
    ctx.strokeStyle = "#5b3925"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(12, 0); ctx.stroke();
    ctx.strokeStyle = "#d7b47a"; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(10, 0); ctx.stroke();
    ctx.fillStyle = "#d8e3eb"; ctx.strokeStyle = "#778b9b"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(9, -4.5); ctx.lineTo(11, 0); ctx.lineTo(9, 4.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#b43d49";
    ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-22, -4); ctx.lineTo(-20, 0); ctx.lineTo(-22, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  for (const wave of bossWaves) {
    const x = wave.x - cameraX;
    ctx.save();
    const waveColors = ["#ff7b43", "#72d8ff", "#a7ff55", "#c38cff", "#ff2e35"];
    ctx.shadowColor = waveColors[wave.tier || 0]; ctx.shadowBlur = 16;
    ctx.strokeStyle = waveColors[wave.tier || 0]; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x - 19, wave.y + 3); ctx.lineTo(x - 10, wave.y - 8); ctx.lineTo(x, wave.y + 3); ctx.lineTo(x + 10, wave.y - 8); ctx.lineTo(x + 19, wave.y + 3); ctx.stroke();
    ctx.restore();
  }
}

function drawCoins(time) {
  for (const c of coins) {
    if (c.collected) continue;

    const x = c.x - cameraX;
    if (x < -30 || x > W + 30) continue;

    const bob = Math.sin(time * 0.004 + c.phase) * 4;

    ctx.save();
    ctx.translate(x, c.y + bob);
    ctx.shadowColor = "#ffce58";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ffce58";

    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#fff0a4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 6, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

function drawPickups(time) {
  for (const item of pickups) {
    if (item.collected) continue;
    const x = item.x - cameraX;
    if (x < -35 || x > W + 35) continue;
    const y = item.y + Math.sin(time * 0.005 + item.phase) * 5;
    const color = item.type === "health" ? "#55ff9a" : item.type === "sword" ? "#7cefff" : "#c39aff";
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = color; ctx.shadowBlur = 17;
    ctx.fillStyle = "#111c2e";
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = color; ctx.strokeStyle = color;
    if (item.type === "health") {
      ctx.fillRect(-3, -8, 6, 16); ctx.fillRect(-8, -3, 16, 6);
    } else if (item.type === "sword") {
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-5, 7); ctx.lineTo(6, -7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, -8); ctx.lineTo(8, -8); ctx.lineTo(8, -2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-8, 5); ctx.lineTo(-2, 9); ctx.stroke();
    } else {
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, -5); ctx.lineTo(6, 3); ctx.lineTo(0, 9); ctx.lineTo(-6, 3); ctx.lineTo(-7, -5); ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPortal(time) {
  const x = portal.x - cameraX;
  if (x < -80 || x > W + 80) return;

  const unlocked = enemies.every(e => !e.alive);
  const pulse = 1 + Math.sin(time * 0.005) * 0.08;

  ctx.save();
  ctx.translate(x, portal.y + 38);
  ctx.scale(pulse, pulse);

  ctx.shadowColor = unlocked ? "#6bffce" : "#ff697f";
  ctx.shadowBlur = unlocked ? 24 : 10;
  ctx.strokeStyle = unlocked ? "#6bffce" : "#ff697f";
  ctx.lineWidth = 5;

  ctx.beginPath();
  ctx.ellipse(0, 0, 25, 38, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = unlocked ? "#40e4d033" : "#ff697f22";
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 33, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  ctx.fillStyle = unlocked ? "#a4ffdf" : "#ffd0d8";
  ctx.font = "bold 10px Arial";
  ctx.textAlign = "center";
  ctx.fillText(unlocked ? "ENTER" : "LOCKED", x, portal.y - 10);
  ctx.textAlign = "left";
}

function drawStickman() {
  if (invulnerable > 0 && Math.floor(invulnerable / 5) % 2 === 0) return;
  const x = player.x - cameraX;
  const y = player.y;
  const crouching = player.h < 45;
  const moving = Math.abs(player.vx) > 0.3 && player.grounded;
  const gait = moving ? Math.sin(player.anim) : 0;
  const swing = moving ? gait * 10 : 0;
  const bob = moving ? Math.abs(Math.sin(player.anim * 2)) * 2.2 : 0;
  const attacking = player.attackTimer > 0;
  const slash = attacking ? Math.sin((14 - player.attackTimer) / 14 * Math.PI) : 0;

  ctx.save();
  ctx.translate(x + player.w / 2, y + bob);
  ctx.scale(player.facing, 1);
  ctx.fillStyle = "#050b1488";
  ctx.beginPath(); ctx.ellipse(0, player.h + 1, crouching ? 15 : 17, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "#dce9ff"; ctx.lineWidth = 5; ctx.fillStyle = "#dce9ff";

  if (crouching) {
    // Low, bent pose that stays inside the shorter crouch hitbox.
    ctx.beginPath(); ctx.arc(1, 11, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 19); ctx.lineTo(3, 28); ctx.lineTo(11, 29); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, 22); ctx.lineTo(10, 24); ctx.lineTo(14, 29); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1, 22); ctx.lineTo(-7, 27); ctx.lineTo(-12, 28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(11, 29); ctx.lineTo(5 + swing * .25, 34); ctx.lineTo(-1, 35); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 29); ctx.lineTo(12, 34); ctx.lineTo(17, 34); ctx.stroke();
  } else {
    const headY = 9;
    ctx.beginPath(); ctx.arc(0, headY, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(gait * 1.8, 36); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gait * 1.8, 22); ctx.lineTo(10 + swing * .45, 29 - gait * 2); ctx.moveTo(gait * 1.8, 22); ctx.lineTo(-9 - swing * .4, 29 + gait * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gait * 1.8, 36); ctx.lineTo(8 + swing, 44 + Math.abs(gait) * 3); ctx.lineTo(10 + swing, 51); ctx.moveTo(gait * 1.8, 36); ctx.lineTo(-8 - swing, 44 + Math.abs(gait) * 3); ctx.lineTo(-10 - swing, 51); ctx.stroke();
  }

  // A proper sword with grip, guard and bright blade; slash arc animates during attacks.
  const handX = crouching ? 13 : 8;
  const handY = crouching ? 25 : 27;
  const swordAngle = attacking ? -0.9 + slash * 1.65 : -0.72;
  ctx.save(); ctx.translate(handX, handY); ctx.rotate(swordAngle);
  ctx.strokeStyle = "#8a5b36"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(5, 0); ctx.stroke();
  ctx.strokeStyle = "#ffe7a0"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(3, -5); ctx.lineTo(3, 5); ctx.stroke();
  ctx.shadowColor = attacking ? "#63fff0" : "#9adfff"; ctx.shadowBlur = attacking ? 18 : 7;
  ctx.fillStyle = "#e9ffff"; ctx.strokeStyle = "#9fefff"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(5, -3); ctx.lineTo(28 + swordPower * 3, 0); ctx.lineTo(5, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();

  if (attacking && !crouching) {
    ctx.strokeStyle = "#a5fff4"; ctx.lineWidth = 3; ctx.shadowColor = "#63fff0"; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(9, 26, 30, -1.25 + slash * .25, .5 + slash * .4); ctx.stroke();
  }
  ctx.restore();
}

function drawMonster(e) {
  const x = e.x - cameraX, y = e.y;
  if (x < -70 || x > W + 70) return;
  const gait = Math.sin(e.anim) * (Math.abs(e.vx) > 0.12 ? 1 : 0.22);
  const bob = Math.abs(gait) * 2;
  const main = e.boss ? ["#ff633e", "#77dfff", "#9fe84c", "#c38cff", "#ff3d47"][e.tier || 0] : e.elite ? "#a56cff" : e.kind === "archer" ? "#d6b45e" : e.kind === "brute" ? "#b95b4d" : e.kind === "stalker" ? "#6c9e76" : e.kind === "venom" ? "#8bcf47" : e.kind === "wraith" ? "#a79bff" : e.kind === "infernal" ? "#ff6038" : ["#ff596d", "#e76b48", "#8e69d7"][e.type];
  const dark = e.boss ? ["#60231f", "#193b54", "#28451c", "#35234f", "#581a22"][e.tier || 0] : e.elite ? "#42245f" : e.kind === "archer" ? "#56452b" : e.kind === "brute" ? "#512b2b" : e.kind === "stalker" ? "#1c3829" : e.kind === "venom" ? "#32451b" : e.kind === "wraith" ? "#342e59" : e.kind === "infernal" ? "#5b211b" : "#4b2035";
  const w = e.w, h = e.h;
  ctx.save(); ctx.translate(x + w / 2, y + bob); ctx.scale(e.direction, 1); ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.fillStyle = "#05081188"; ctx.beginPath(); ctx.ellipse(0, h + 1, w * .62, 4, 0, 0, Math.PI * 2); ctx.fill();

  // Each monster has its own silhouette, gait and attack pose.
  if (e.kind === "archer") {
    // Light, hooded archer with animated legs, arm and drawn bow.
    ctx.strokeStyle = dark; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-4, h - 13); ctx.lineTo(-7 + gait * 5, h - 2); ctx.moveTo(4, h - 13); ctx.lineTo(8 - gait * 5, h - 2); ctx.stroke();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-10, 9); ctx.lineTo(0, -3); ctx.lineTo(11, 9); ctx.lineTo(8, 29); ctx.lineTo(-8, 29); ctx.closePath(); ctx.fill();
    ctx.fillStyle = main; ctx.beginPath(); ctx.moveTo(-8, 10); ctx.lineTo(0, 1); ctx.lineTo(8, 10); ctx.lineTo(6, 30); ctx.lineTo(-6, 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d8b08b"; ctx.beginPath(); ctx.arc(0, 8, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-8, 7); ctx.lineTo(0, -4); ctx.lineTo(9, 7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = main; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(2, 19); ctx.lineTo(11, 23 + (e.attacking ? -3 : gait * 2)); ctx.stroke();
    ctx.strokeStyle = "#f7df9c"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(13, 22, 11, -1.2, 1.2); ctx.stroke();
    ctx.strokeStyle = "#fff2c7"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(9, 12); ctx.lineTo(9, 32); ctx.stroke();
    if (e.attacking) { ctx.strokeStyle = "#ffe8b2"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, 22); ctx.lineTo(22, 22); ctx.stroke(); }
    ctx.fillStyle = "#fff2a8"; ctx.fillRect(2, 7, 4, 2);
  } else if (e.kind === "brute") {
    // Heavy square body, plated shoulders, tusks and a weighted swinging arm.
    ctx.strokeStyle = dark; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-8, h - 17); ctx.lineTo(-11 + gait * 3, h - 2); ctx.moveTo(8, h - 17); ctx.lineTo(12 - gait * 3, h - 2); ctx.stroke();
    ctx.fillStyle = dark; ctx.fillRect(-w * .55, 15, w * 1.1, h - 27);
    ctx.fillStyle = main; ctx.fillRect(-w * .47, 13, w * .94, h - 29);
    ctx.fillStyle = "#d88b70"; ctx.fillRect(-w * .58, 14, 10, 18); ctx.fillRect(w * .42, 14, 10, 18);
    ctx.fillStyle = "#f1b5a0"; ctx.beginPath(); ctx.moveTo(-w * .55, 16); ctx.lineTo(-w * .8, 7); ctx.lineTo(-w * .42, 13); ctx.moveTo(w * .45, 15); ctx.lineTo(w * .75, 5); ctx.lineTo(w * .56, 20); ctx.fill();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.roundRect(-12, 0, 24, 22, 5); ctx.fill();
    ctx.fillStyle = main; ctx.beginPath(); ctx.roundRect(-10, 2, 20, 18, 4); ctx.fill();
    ctx.fillStyle = "#fff0d4"; ctx.beginPath(); ctx.moveTo(-7, 16); ctx.lineTo(-4, 23); ctx.lineTo(-1, 16); ctx.moveTo(2, 16); ctx.lineTo(5, 23); ctx.lineTo(8, 16); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-w * .4, 22); ctx.lineTo(-w * .58, 33 + gait * 2); ctx.moveTo(w * .4, 22); ctx.lineTo(w * .6, 34 - gait * 2); ctx.stroke();
    ctx.fillStyle = "#ffdf72"; ctx.fillRect(-7, 8, 4, 3); ctx.fillRect(3, 8, 4, 3);
  } else if (e.elite && !e.boss) {
    // Elite is a floating armored sentinel with a distinct crystal core.
    const float = Math.sin(e.anim * 1.6) * 3;
    ctx.translate(0, float);
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-13, 13); ctx.lineTo(-w * .55, 29); ctx.lineTo(-9, h - 7); ctx.lineTo(9, h - 7); ctx.lineTo(w * .55, 29); ctx.lineTo(13, 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = main; ctx.beginPath(); ctx.moveTo(-10, 15); ctx.lineTo(0, 7); ctx.lineTo(10, 15); ctx.lineTo(7, h - 10); ctx.lineTo(-7, h - 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f3d8ff"; ctx.shadowColor = "#ef66ff"; ctx.shadowBlur = 18; ctx.beginPath(); ctx.moveTo(0, 22); ctx.lineTo(7, 29); ctx.lineTo(0, 38); ctx.lineTo(-7, 29); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff4ff"; ctx.fillRect(-8, 10, 5, 3); ctx.fillRect(3, 10, 5, 3);
    ctx.strokeStyle = "#e5c9ff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-10, 22); ctx.lineTo(-18, 32 + gait * 3); ctx.moveTo(10, 22); ctx.lineTo(18, 32 - gait * 3); ctx.stroke();
    ctx.fillStyle = "#f0baff"; ctx.beginPath(); ctx.moveTo(-10, 4); ctx.lineTo(-6, -9); ctx.lineTo(0, 3); ctx.lineTo(6, -9); ctx.lineTo(10, 4); ctx.closePath(); ctx.fill();
  } else if (e.boss) {
    // Large plated boss with a crown, wide stance and pulsing chest.
    ctx.strokeStyle = dark; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(-11, h - 20); ctx.lineTo(-15 + gait * 4, h - 2); ctx.moveTo(11, h - 20); ctx.lineTo(15 - gait * 4, h - 2); ctx.stroke();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-22, 16); ctx.lineTo(-w * .52, 28); ctx.lineTo(-w * .42, h - 10); ctx.lineTo(w * .42, h - 10); ctx.lineTo(w * .52, 28); ctx.lineTo(22, 16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = main; ctx.beginPath(); ctx.moveTo(-17, 18); ctx.lineTo(0, 9); ctx.lineTo(17, 18); ctx.lineTo(13, h - 14); ctx.lineTo(-13, h - 14); ctx.closePath(); ctx.fill();
    const kingMetal = ["#ffd166", "#8feaff", "#c7ff70", "#d9b3ff", "#ff8b6d"][e.tier || 0];
    ctx.fillStyle = kingMetal; ctx.shadowColor = kingMetal; ctx.shadowBlur = 12 + Math.sin(e.anim) * 4;
    ctx.beginPath();
    if ((e.tier || 0) === 1) { ctx.moveTo(-16, 5); ctx.lineTo(-12, -12); ctx.lineTo(-4, -3); ctx.lineTo(0, -7); ctx.lineTo(6, -17); ctx.lineTo(11, -3); ctx.lineTo(16, 5); }
    else if ((e.tier || 0) === 2) { ctx.moveTo(-16, 5); ctx.lineTo(-19, -8); ctx.lineTo(-7, -2); ctx.lineTo(0, -15); ctx.lineTo(7, -2); ctx.lineTo(19, -8); ctx.lineTo(16, 5); }
    else if ((e.tier || 0) === 3) { ctx.moveTo(-16, 5); ctx.lineTo(-10, -14); ctx.lineTo(-2, -5); ctx.lineTo(0, -18); ctx.lineTo(4, -4); ctx.lineTo(14, -14); ctx.lineTo(16, 5); }
    else { ctx.moveTo(-15, 5); ctx.lineTo(-12, -10); ctx.lineTo(-4, -2); ctx.lineTo(0, -17); ctx.lineTo(5, -2); ctx.lineTo(13, -10); ctx.lineTo(15, 5); }
    ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff0a0"; ctx.shadowColor = kingMetal; ctx.shadowBlur = 16 + Math.sin(e.anim) * 5; ctx.fillRect(-10, 12, 6, 4); ctx.fillRect(4, 12, 6, 4); ctx.shadowBlur = 0;
    ctx.fillStyle = kingMetal; ctx.beginPath(); ctx.arc(0, h * .52, 7 + Math.sin(e.anim * 2) * 1.5, 0, Math.PI * 2); ctx.fill();
  } else if (["stalker", "venom", "wraith", "infernal"].includes(e.kind)) {
    // New monster silhouettes unlock in each 10-level world.
    const bobber = Math.sin(e.anim * 1.7) * 3;
    ctx.translate(0, e.kind === "wraith" ? bobber : 0);
    if (e.kind === "stalker") {
      ctx.strokeStyle = dark; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-7, h - 16); ctx.lineTo(-13 + gait * 5, h - 1); ctx.moveTo(7, h - 16); ctx.lineTo(13 - gait * 5, h - 1); ctx.stroke();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-10, 13); ctx.lineTo(-17, 29); ctx.lineTo(-9, h - 12); ctx.lineTo(9, h - 12); ctx.lineTo(17, 29); ctx.lineTo(10, 13); ctx.closePath(); ctx.fill();
      ctx.fillStyle = main; ctx.beginPath(); ctx.moveTo(-8, 14); ctx.lineTo(0, 5); ctx.lineTo(8, 14); ctx.lineTo(5, h - 14); ctx.lineTo(-5, h - 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-8, 7); ctx.lineTo(-18, -9); ctx.lineTo(-4, -2); ctx.lineTo(2, -5); ctx.lineTo(13, -13); ctx.lineTo(9, 7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#b8ffcb"; ctx.shadowColor = main; ctx.shadowBlur = 12; ctx.fillRect(-6, 7, 4, 3); ctx.fillRect(3, 7, 4, 3); ctx.shadowBlur = 0;
      ctx.strokeStyle = main; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-8, 22); ctx.lineTo(-18, 34 + gait * 3); ctx.moveTo(8, 22); ctx.lineTo(18, 32 - gait * 3); ctx.stroke();
    } else if (e.kind === "venom") {
      ctx.strokeStyle = dark; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-9, h - 18); ctx.lineTo(-12 + gait * 4, h - 1); ctx.moveTo(9, h - 18); ctx.lineTo(13 - gait * 4, h - 1); ctx.stroke();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(0, 29, 22, 19, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = main; ctx.beginPath(); ctx.ellipse(0, 28, 17, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-13, 17); ctx.lineTo(-20, 7); ctx.lineTo(-8, 12); ctx.lineTo(0, 6); ctx.lineTo(9, 12); ctx.lineTo(20, 6); ctx.lineTo(12, 19); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#eaff8d"; ctx.shadowColor = "#a7ff55"; ctx.shadowBlur = 12; ctx.fillRect(-8, 15, 5, 4); ctx.fillRect(4, 15, 5, 4); ctx.shadowBlur = 0;
      ctx.strokeStyle = main; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-13, 27); ctx.lineTo(-23, 35 + gait * 2); ctx.moveTo(13, 27); ctx.lineTo(23, 35 - gait * 2); ctx.stroke();
    } else if (e.kind === "wraith") {
      ctx.globalAlpha = .88; ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-12, 10); ctx.lineTo(0, -5); ctx.lineTo(13, 10); ctx.lineTo(11, 34); ctx.lineTo(18, h - 3); ctx.lineTo(5, h - 12); ctx.lineTo(0, h - 2); ctx.lineTo(-7, h - 12); ctx.lineTo(-18, h - 3); ctx.lineTo(-11, 34); ctx.closePath(); ctx.fill();
      ctx.fillStyle = main; ctx.beginPath(); ctx.moveTo(-9, 12); ctx.lineTo(0, 1); ctx.lineTo(9, 12); ctx.lineTo(6, 33); ctx.lineTo(0, 28); ctx.lineTo(-6, 33); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#f1eaff"; ctx.shadowColor = main; ctx.shadowBlur = 18; ctx.fillRect(-7, 9, 5, 3); ctx.fillRect(3, 9, 5, 3); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      ctx.strokeStyle = main; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-9, 19); ctx.lineTo(-22, 29 + gait * 3); ctx.moveTo(9, 19); ctx.lineTo(22, 29 - gait * 3); ctx.stroke();
    } else {
      ctx.strokeStyle = dark; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(-9, h - 17); ctx.lineTo(-13 + gait * 3, h - 1); ctx.moveTo(9, h - 17); ctx.lineTo(14 - gait * 3, h - 1); ctx.stroke();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-17, 15); ctx.lineTo(-25, 27); ctx.lineTo(-15, h - 10); ctx.lineTo(15, h - 10); ctx.lineTo(25, 27); ctx.lineTo(17, 15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = main; ctx.beginPath(); ctx.moveTo(-13, 16); ctx.lineTo(0, 4); ctx.lineTo(13, 16); ctx.lineTo(10, h - 13); ctx.lineTo(-10, h - 13); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffcf73"; ctx.beginPath(); ctx.moveTo(-12, 6); ctx.lineTo(-19, -7); ctx.lineTo(-5, -1); ctx.lineTo(0, -14); ctx.lineTo(6, -1); ctx.lineTo(18, -8); ctx.lineTo(12, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff3ad"; ctx.shadowColor = "#ff4a2c"; ctx.shadowBlur = 13; ctx.fillRect(-8, 12, 5, 4); ctx.fillRect(4, 12, 5, 4); ctx.shadowBlur = 0;
      ctx.strokeStyle = main; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-13, 22); ctx.lineTo(-22, 36 + gait * 2); ctx.moveTo(13, 22); ctx.lineTo(22, 35 - gait * 2); ctx.stroke();
    }
  } else {
    // Basic fighter: narrow torso, asymmetric shoulder guard and twin short blades.
    ctx.strokeStyle = dark; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-5, h - 14); ctx.lineTo(-8 + gait * 5, h - 2); ctx.moveTo(5, h - 14); ctx.lineTo(8 - gait * 5, h - 2); ctx.stroke();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-10, 15); ctx.lineTo(-7, 10); ctx.lineTo(7, 10); ctx.lineTo(11, 19); ctx.lineTo(6, h - 12); ctx.lineTo(-6, h - 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = main; ctx.beginPath(); ctx.moveTo(-7, 17); ctx.lineTo(0, 12); ctx.lineTo(7, 17); ctx.lineTo(5, h - 15); ctx.lineTo(-5, h - 15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-9, 10); ctx.lineTo(-7, 1); ctx.lineTo(0, -3); ctx.lineTo(8, 2); ctx.lineTo(10, 12); ctx.closePath(); ctx.fill();
    // Jagged horned helmet and glowing hostile eyes.
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-7, 3); ctx.lineTo(-13, -7); ctx.lineTo(-3, -2); ctx.lineTo(0, -6); ctx.lineTo(4, -2); ctx.lineTo(13, -8); ctx.lineTo(8, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = main; ctx.beginPath(); ctx.arc(0, 8, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff273f"; ctx.shadowColor = "#ff1738"; ctx.shadowBlur = 8; ctx.fillRect(-6, 7, 4, 3); ctx.fillRect(3, 7, 4, 3); ctx.shadowBlur = 0;
    ctx.fillStyle = "#f2d9c8"; ctx.beginPath(); ctx.moveTo(-4, 14); ctx.lineTo(-1, 18); ctx.lineTo(0, 14); ctx.moveTo(2, 14); ctx.lineTo(5, 18); ctx.lineTo(6, 14); ctx.fill();
    ctx.strokeStyle = main; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-6, 21); ctx.lineTo(-13, 30 + gait * 3); ctx.moveTo(6, 21); ctx.lineTo(12, 30 - gait * 3); ctx.stroke();
  }
  ctx.restore();

  const barW = e.boss ? 64 : e.elite ? 52 : 42;
  const barX = x + w / 2 - barW / 2, barY = y - 19;
  ctx.fillStyle = "#111827"; ctx.fillRect(barX, barY, barW, 6);
  ctx.fillStyle = e.boss ? "#ffbd63" : e.elite ? "#d6a0ff" : "#ff6179";
  ctx.fillRect(barX, barY, barW * Math.max(0, e.hp / e.maxHp), 6);
  ctx.strokeStyle = "#ffffffbb"; ctx.lineWidth = 1; ctx.strokeRect(barX, barY, barW, 6);
  if (e.elite || e.kind === "archer" || e.kind === "brute") {
    ctx.fillStyle = e.boss ? "#ffd3a6" : e.elite ? "#ead4ff" : "#ffe3a1";
    ctx.font = "bold 9px Arial"; ctx.textAlign = "center";
    ctx.fillText(e.boss ? bossName(level) : e.elite ? "ELITE" : e.kind === "archer" ? "ARCHER" : e.kind === "brute" ? "BRUTE" : e.kind.toUpperCase(), x + w / 2, barY - 4); ctx.textAlign = "left";
  }
  if (e.boss && e.bossCharge > 0) {
    ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(e.bossCharge * 0.55) * 0.2;
    ctx.strokeStyle = "#ff8b46"; ctx.lineWidth = 3; ctx.shadowColor = "#ff5b2e"; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 31 + Math.sin(e.bossCharge * .5) * 5, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - cameraX, p.y, p.size, p.size);
  }

  ctx.globalAlpha = 1;
}

function draw(time) {
  ctx.save();

  if (screenShake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * screenShake,
      (Math.random() - 0.5) * screenShake
    );
  }

  drawBackground(time);
  if (isBossLevel(level)) drawUndergroundRoom(time);
  drawPlatforms();
  drawHazards(time);
  drawCoins(time);
  drawPickups(time);
  drawLaserEffects();
  drawArrows();
  drawBossFireballs(time);
  drawPortal(time);

  for (const e of enemies) {
    if (e.alive) drawMonster(e);
  }

  drawStickman();
  drawParticles();

  ctx.restore();

  // Progress bar.
  const progress = Math.min(1, player.x / portal.x);

  ctx.fillStyle = "#0a1120cc";
  ctx.fillRect(16, 36, 160, 18);

  ctx.fillStyle = "#b6c9e5";
  ctx.font = "10px Arial";
  ctx.fillText("WORLD PROGRESS", 22, 48);

  ctx.fillStyle = "#2b3d57";
  ctx.fillRect(22, 50, 148, 3);

  ctx.fillStyle = "#62e6d6";
  ctx.fillRect(22, 50, 148 * progress, 3);

  // Compact power-up notification and current sword strength.
  ctx.fillStyle = "#0a1120cc"; ctx.fillRect(W - 184, 14, 168, 38);
  ctx.fillStyle = "#9fefff"; ctx.font = "bold 11px Arial";
  ctx.fillText("SWORD POWER  x" + swordPower, W - 174, 29);
  ctx.fillStyle = "#dce9ff"; ctx.font = "10px Arial";
  ctx.fillText(trialPowerFrames > 0 ? activeTrialPower.toUpperCase() + " " + Math.ceil(trialPowerFrames / 60) + "s" : "Find glowing power-ups", W - 174, 43);
  if (pickupToastTimer > 0) {
    ctx.globalAlpha = Math.min(1, pickupToastTimer / 12);
    ctx.fillStyle = "#071421dd"; ctx.fillRect(W / 2 - 115, 75, 230, 34);
    ctx.strokeStyle = "#70f4e3"; ctx.strokeRect(W / 2 - 115, 75, 230, 34);
    ctx.fillStyle = "#c8fff8"; ctx.font = "bold 14px Arial"; ctx.textAlign = "center";
    ctx.fillText(pickupToast, W / 2, 96); ctx.textAlign = "left"; ctx.globalAlpha = 1;
  }
}

function loop(time = 0) {
  const delta = lastTime ? Math.min((time - lastTime) / 16.67, 2) : 1;
  lastTime = time;

  if (gameState === "playing") {
    const steps = Math.max(1, Math.ceil(delta));
    for (let i = 0; i < steps; i++) update();
  } else if (gameState === "bossIntro") {
    bossIntroFrames--; updateParticles();
    if (bossIntroFrames <= 0) gameState = "playing";
  } else if (gameState !== "paused") updateParticles();

  draw(time);
  if (gameState === "bossIntro") drawBossIntro(time);
  requestAnimationFrame(loop);
}

loadProgress();
level = 1;
selectedLevel = 1;
player = makePlayer();
makeLevel(level);
updateHUD();
window.setTimeout(() => {
  document.getElementById("loadingScreen")?.classList.add("hidden");
  document.getElementById("mainMenu")?.classList.remove("hidden");
  refreshLevelGrid();
}, 950);
requestAnimationFrame(loop);
