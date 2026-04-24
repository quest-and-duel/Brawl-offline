/**
 * Arena Demo — top-down shooter vs bots (Brawl-like prototype).
 * Vanilla canvas, no build step.
 */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const elHp = document.getElementById("hp");
const elBots = document.getElementById("bots");
const elState = document.getElementById("state");

let W = canvas.width;
let H = canvas.height;

const keys = new Set();
let mouseX = W / 2;
let mouseY = H / 2;
/** Атака удержанием, как с пробелом: ЛКМ и ПКМ */
let mouseLeftHeld = false;
let mouseRightHeld = false;

// ── Мобильное управление ──────────────────────────────────────────────────────
const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

/** Виртуальный джойстик (левая сторона экрана) */
const mJoy = { active: false, id: -1, baseX: 0, baseY: 0, dx: 0, dy: 0 };
/** Прицел / стрельба (правая сторона) */
const mAim = { active: false, id: -1, x: 0, y: 0 };

/** Кнопки HUD на мобильном: { id, label, x, y, r, action } */
const MOB_BTN_R = 36;
let mobBtns = [];  // инициализируются в buildMobBtns() при каждом resize/loadLevel

function buildMobBtns() {
  // Кнопки рисуются поверх canvas в draw()
  // Координаты — в пространстве canvas (не CSS)
  mobBtns = [
    { id: "menu",   label: "M",  ax: W - 52,      ay: 52,      r: MOB_BTN_R },
    { id: "wpnL",   label: "◀", ax: 52,           ay: H - 52,  r: MOB_BTN_R },
    { id: "wpnR",   label: "▶", ax: 52 + MOB_BTN_R * 2 + 12, ay: H - 52, r: MOB_BTN_R },
  ];
}

function scaledTouch(touch) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / Math.max(1, rect.width);
  const scaleY = canvas.height / Math.max(1, rect.height);
  return {
    x: (touch.clientX - rect.left) * scaleX,
    y: (touch.clientY - rect.top)  * scaleY,
  };
}
// ─────────────────────────────────────────────────────────────────────────────

const STATE = {
  MENU: "menu",
  PLAYING: "playing",
  WON: "won",
  LOST: "lost",
  CLEARED: "cleared",
  CHOOSING: "choosing",
};
let state = STATE.MENU;
let menuHoverIdx = -1;

const PLAYER = {
  r: 18,
  speed: 220,
  maxHp: 100,
  fireCd: 0.35,
  bulletSpeed: 520,
  bulletDamage: 22,
  color: "#3b82f6",
  emoji: "😎",
  regenDelay: 2.5,
  regenRate: 9,
};

const WEAPONS = {
  pistol:   { fireCd: 0.35, bullets: 1, spread: 0,    damageMul: 1,    melee: false, label: "Пистолет 🔫" },
  shotgun:  { fireCd: 0.6,  bullets: 3, spread: 0.3,  damageMul: 0.5,  melee: false, label: "Дробовик 💥" },
  axe:      { fireCd: 0.45, bullets: 0, spread: 0,    damageMul: 1,    melee: true,  meleeRange: 58, meleeArc: 1.2, label: "Топор 🪓" },
  minigun:  { fireCd: 0.1,  bullets: 1, spread: 0.08, damageMul: 1,    melee: false, baseDamage: 5, label: "Миниган 🌀" },
};

const AXE_BASE_DAMAGE = 45;

const BOT_TYPES = {
  ranger: {
    kind: "ranger",
    r: 16,
    speed: 95,
    maxHp: 60,
    fireCd: 0.9,
    bulletSpeed: 380,
    bulletDamage: 12,
    aggroRange: 440,
    keepDistance: 220,
    reactTime: 0.45,
    regenDelay: 3.5,
    regenRate: 4,
    color: "#ef4444",
    stroke: "#fca5a5",
    emoji: "🤖",
  },
  melee: {
    kind: "melee",
    r: 19,
    speed: 130,
    maxHp: 110,
    attackCd: 0.55,
    attackRange: 6,
    attackDamage: 22,
    aggroRange: 520,
    reactTime: 0.3,
    regenDelay: 3.5,
    regenRate: 6,
    color: "#a855f7",
    stroke: "#e9d5ff",
    emoji: "👹",
  },
  boss: {
    kind: "boss",
    r: 38,
    speed: 75,
    maxHp: 500,
    attackCd: 1.2,
    attackRange: 12,
    attackDamage: 60,
    aggroRange: 1400,
    reactTime: 0.5,
    regenDelay: 6,
    regenRate: 5,
    color: "#7c2d12",
    stroke: "#fbbf24",
    emoji: "👺",
    summonEvery: 15,
  },
  mage: {
    kind: "mage",
    r: 18,
    speed: 117,
    maxHp: 270,
    fireCd: 0.63,
    bulletSpeed: 360,
    blastRadius: 78,
    blastDamage: 22,
    aggroRange: 480,
    keepDistance: 210,
    reactTime: 0.3,
    regenDelay: 4.5,
    regenRate: 5.3,
    summonEvery: 15,
    color: "#7c3aed",
    stroke: "#c4b5fd",
    emoji: "🧙",
  },
  skeleton: {
    kind: "skeleton",
    r: 12,
    speed: 105,
    maxHp: 25,
    attackCd: 0.6,
    attackRange: 4,
    attackDamage: 7,
    aggroRange: 400,
    reactTime: 0.3,
    regenDelay: 5,
    regenRate: 1.5,
    color: "#c8d6e5",
    stroke: "#64748b",
    emoji: "💀",
  },
};

const DOG = {
  r: 13,
  speed: 180,
  maxHp: 75,
  damage: 10,
  attackCd: 0.8,
  attackRange: 4,
  aggroRange: 280,
  stunOnHit: 1.5,
  emoji: "🐶",
};

const UPGRADES = {
  shotgun: { id: "shotgun", title: "🔫 Дробовик", desc: "3 пули с разбросом, по ½ урона каждая" },
  axe: { id: "axe", title: "🪓 Топор", desc: "+100 к макс. HP, удар вблизи на 45 урона (+бонус с дропов)" },
  dog: {
    id: "dog",
    title: "🐶 Собачка",
    desc: "75 HP, бьёт вблизи на 10, 20% оглушение, 10% полный отхил собаки, после смерти — снова на следующем уровне",
  },
  minigun: { id: "minigun", title: "🌀 Миниган", desc: "5 урона, 0.25с между выстрелами — высокая скорострельность" },
};

const LEVELS = [
  {
    name: "1 — Разминка",
    desc: "2 стрелка · 1 ближник",
    emoji: "🎯",
    w: 960,
    h: 540,
    walls: [
      { x: 180, y: 120, w: 120, h: 24 },
      { x: 660, y: 120, w: 120, h: 24 },
      { x: 420, y: 240, w: 120, h: 24 },
      { x: 200, y: 380, w: 160, h: 24 },
      { x: 600, y: 380, w: 160, h: 24 },
    ],
    bots: [
      { rx: 0.2, ry: 0.18, kind: "ranger" },
      { rx: 0.8, ry: 0.18, kind: "ranger" },
      { rx: 0.5, ry: 0.1, kind: "melee" },
    ],
    spawn: { rx: 0.5, ry: 0.82 },
    drops: false,
  },
  {
    name: "2 — Коридоры",
    desc: "2 стрелка · 2 ближника",
    emoji: "🏛️",
    w: 960,
    h: 540,
    walls: [
      { x: 120, y: 80, w: 24, h: 200 },
      { x: 816, y: 80, w: 24, h: 200 },
      { x: 120, y: 360, w: 24, h: 120 },
      { x: 816, y: 360, w: 24, h: 120 },
      { x: 300, y: 200, w: 360, h: 24 },
      { x: 300, y: 320, w: 360, h: 24 },
      { x: 460, y: 80, w: 40, h: 90 },
      { x: 460, y: 370, w: 40, h: 90 },
    ],
    bots: [
      { rx: 0.2, ry: 0.15, kind: "ranger" },
      { rx: 0.8, ry: 0.15, kind: "ranger" },
      { rx: 0.2, ry: 0.82, kind: "melee" },
      { rx: 0.8, ry: 0.82, kind: "melee" },
    ],
    spawn: { rx: 0.5, ry: 0.5 },
    drops: true,
  },
  {
    name: "3 — Пилоны",
    desc: "3 стрелка · 2 ближника",
    emoji: "🗿",
    w: 960,
    h: 540,
    walls: [
      { x: 240, y: 120, w: 48, h: 48 },
      { x: 672, y: 120, w: 48, h: 48 },
      { x: 240, y: 372, w: 48, h: 48 },
      { x: 672, y: 372, w: 48, h: 48 },
      { x: 456, y: 120, w: 48, h: 48 },
      { x: 456, y: 372, w: 48, h: 48 },
      { x: 344, y: 244, w: 272, h: 52 },
    ],
    bots: [
      { rx: 0.15, ry: 0.25, kind: "ranger" },
      { rx: 0.85, ry: 0.25, kind: "ranger" },
      { rx: 0.15, ry: 0.75, kind: "ranger" },
      { rx: 0.5, ry: 0.1, kind: "melee" },
      { rx: 0.5, ry: 0.9, kind: "melee" },
    ],
    spawn: { rx: 0.5, ry: 0.5 },
    drops: true,
  },
  {
    name: "4 — Лабиринт",
    desc: "3 стрелка · 3 ближника",
    emoji: "🌀",
    w: 1200,
    h: 720,
    walls: [
      { x: 100, y: 100, w: 320, h: 24 },
      { x: 780, y: 100, w: 320, h: 24 },
      { x: 100, y: 596, w: 320, h: 24 },
      { x: 780, y: 596, w: 320, h: 24 },
      { x: 560, y: 200, w: 80, h: 120 },
      { x: 560, y: 400, w: 80, h: 120 },
      { x: 360, y: 340, w: 160, h: 40 },
      { x: 680, y: 340, w: 160, h: 40 },
      { x: 200, y: 260, w: 60, h: 200 },
      { x: 940, y: 260, w: 60, h: 200 },
      { x: 400, y: 150, w: 24, h: 120 },
      { x: 776, y: 150, w: 24, h: 120 },
      { x: 400, y: 450, w: 24, h: 120 },
      { x: 776, y: 450, w: 24, h: 120 },
    ],
    bots: [
      { rx: 0.12, ry: 0.15, kind: "ranger" },
      { rx: 0.88, ry: 0.15, kind: "ranger" },
      { rx: 0.12, ry: 0.85, kind: "ranger" },
      { rx: 0.88, ry: 0.85, kind: "ranger" },
      { rx: 0.3, ry: 0.5, kind: "melee" },
      { rx: 0.7, ry: 0.5, kind: "melee" },
    ],
    spawn: { rx: 0.5, ry: 0.5 },
    drops: true,
  },
  {
    name: "5 — Босс",
    desc: "Могучий босс + призыватель",
    emoji: "💀",
    w: 1280,
    h: 720,
    walls: [
      { x: 260, y: 200, w: 110, h: 24 },
      { x: 910, y: 200, w: 110, h: 24 },
      { x: 260, y: 496, w: 110, h: 24 },
      { x: 910, y: 496, w: 110, h: 24 },
      { x: 580, y: 120, w: 120, h: 28 },
      { x: 580, y: 572, w: 120, h: 28 },
      { x: 120, y: 340, w: 40, h: 40 },
      { x: 1120, y: 340, w: 40, h: 40 },
    ],
    bots: [{ rx: 0.5, ry: 0.2, kind: "boss" }],
    spawn: { rx: 0.5, ry: 0.85 },
    drops: true,
    boss: true,
  },
  {
    name: "6 — Арена мага",
    desc: "Маг + 2 стрелка + скелеты",
    emoji: "🧙",
    w: 1100,
    h: 640,
    walls: [
      { x: 80, y: 120, w: 200, h: 22 },
      { x: 820, y: 120, w: 200, h: 22 },
      { x: 80, y: 498, w: 200, h: 22 },
      { x: 820, y: 498, w: 200, h: 22 },
      { x: 480, y: 60, w: 140, h: 28 },
      { x: 480, y: 552, w: 140, h: 28 },
      { x: 180, y: 300, w: 22, h: 120 },
      { x: 898, y: 300, w: 22, h: 120 },
    ],
    bots: [
      { rx: 0.5, ry: 0.38, kind: "mage" },
      { rx: 0.12, ry: 0.5, kind: "ranger" },
      { rx: 0.88, ry: 0.5, kind: "ranger" },
    ],
    spawn: { rx: 0.5, ry: 0.88 },
    drops: true,
  },
];

let player;
let bots;
let dog = null;
let bullets;
let pickups;
let walls;
let slashes;
let particles;
let floaters;
let bossSummonTimer = 0;
let bgCanvas = null;
let hurtFlash = 0;
let time = 0;
let currentLevel = 0;
/** Кэш для оверлея (не делать find в draw каждый кадр) */
let hudOverlayBossT = 0;
let hudOverlayMageT = 0;
let hudHasBoss = false;
let hudHasMage = false;

function rectCircleResolve(cx, cy, cr, rx, ry, rw, rh) {
  if (cx >= rx && cx <= rx + rw && cy >= ry && cy <= ry + rh) {
    const leftPush = cx - rx + cr;
    const rightPush = rx + rw - cx + cr;
    const topPush = cy - ry + cr;
    const bottomPush = ry + rh - cy + cr;
    const m = Math.min(leftPush, rightPush, topPush, bottomPush);
    if (m === leftPush) return { px: -leftPush, py: 0 };
    if (m === rightPush) return { px: rightPush, py: 0 };
    if (m === topPush) return { px: 0, py: -topPush };
    return { px: 0, py: bottomPush };
  }
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= cr * cr) return null;
  const d = Math.sqrt(d2) || 0.0001;
  const overlap = cr - d + 0.01;
  return { px: (dx / d) * overlap, py: (dy / d) * overlap };
}

function circleHitsWall(cx, cy, cr, w) {
  if (cx + cr < w.x || cx - cr > w.x + w.w || cy + cr < w.y || cy - cr > w.y + w.h) return false;
  return !!rectCircleResolve(cx, cy, cr, w.x, w.y, w.w, w.h);
}

function showMenu() {
  state = STATE.MENU;
  canvas.width = 960;
  canvas.height = 540;
  W = 960;
  H = 540;
  if (isMobile) buildMobBtns();
}

function newGame() {
  showMenu();
}

function startFromLevel(idx) {
  currentLevel = idx;
  player = {
    x: 0,
    y: 0,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    damageBonus: 0,
    cd: 0,
    sinceHit: 999,
    hitFlash: 0,
    weapon: "pistol",
    upgrades: new Set(),
  };
  dog = null;
  loadLevel(idx);
  // Уровни 5 и 6 — выдаём все баффы сразу (после loadLevel, чтобы позиции и walls были готовы)
  if (idx >= 4) {
    applyUpgrade("shotgun");
    applyUpgrade("axe");
    applyUpgrade("dog");
    applyUpgrade("minigun");
  }
}

function buildBackground(w, h, levelWalls) {
  const oc = document.createElement("canvas");
  oc.width = w;
  oc.height = h;
  const oc2 = oc.getContext("2d");
  const TILE = 40;

  // Пол — чередующиеся плитки
  for (let ty = 0; ty < h; ty += TILE) {
    for (let tx = 0; tx < w; tx += TILE) {
      const even = ((tx / TILE + ty / TILE) & 1) === 0;
      oc2.fillStyle = even ? "#1a2536" : "#1e2b3e";
      oc2.fillRect(tx, ty, TILE, TILE);
      // Тонкая линия стыка
      oc2.strokeStyle = "rgba(0,0,0,0.25)";
      oc2.lineWidth = 1;
      oc2.strokeRect(tx + 0.5, ty + 0.5, TILE - 1, TILE - 1);
    }
  }

  // Стены — кирпичная кладка
  for (const wall of levelWalls) {
    const { x, y, w: ww, h: wh } = wall;
    // Основной фон стены
    oc2.fillStyle = "#3d3224";
    oc2.fillRect(x, y, ww, wh);

    // Кирпичная сетка
    const BRICK_W = 24;
    const BRICK_H = 12;
    for (let row = 0; row * BRICK_H < wh; row++) {
      const offset = (row & 1) === 0 ? 0 : BRICK_W / 2;
      for (let col = -1; col * BRICK_W < ww + BRICK_W; col++) {
        const bx = x + col * BRICK_W + offset;
        const by = y + row * BRICK_H;
        const bw = Math.min(BRICK_W - 2, x + ww - bx - 1);
        const bh = Math.min(BRICK_H - 2, y + wh - by - 1);
        if (bw <= 0 || bh <= 0) continue;
        oc2.fillStyle = "#5c4733";
        oc2.fillRect(bx + 1, by + 1, bw, bh);
        // Светлая грань сверху/слева
        oc2.fillStyle = "rgba(255,220,160,0.12)";
        oc2.fillRect(bx + 1, by + 1, bw, 2);
        oc2.fillRect(bx + 1, by + 1, 2, bh);
      }
    }
    // Контур стены
    oc2.strokeStyle = "#7c5c3a";
    oc2.lineWidth = 2;
    oc2.strokeRect(x + 1, y + 1, ww - 2, wh - 2);
  }

  return oc;
}

function loadLevel(idx) {
  currentLevel = idx;
  state = STATE.PLAYING;
  time = 0;
  bullets = [];
  pickups = [];
  slashes = [];
  particles = [];
  floaters = [];
  hurtFlash = 0;
  bossSummonTimer = 0;

  const L = LEVELS[idx];
  canvas.width = L.w;
  canvas.height = L.h;
  W = L.w;
  H = L.h;

  walls = L.walls.map((w) => ({ ...w }));
  bgCanvas = buildBackground(W, H, walls);
  if (isMobile) buildMobBtns();

  player.x = L.spawn.rx * W;
  player.y = L.spawn.ry * H;
  player.cd = 0;
  player.sinceHit = 999;
  player.hitFlash = 0;
  player.hp = Math.min(player.maxHp, player.hp + 40);

  bots = L.bots.map((b) => makeBot(b.rx * W, b.ry * H, b.kind));

  if (player.upgrades.has("dog")) {
    if (!dog || dog.hp <= 0) {
      dog = makeDog();
    }
    dog.maxHp = DOG.maxHp;
    dog.x = player.x - 30;
    dog.y = player.y + 30;
    dog.hp = Math.min(dog.maxHp, dog.hp + 25);
    dog.cd = 0;
    dog.sinceHit = 999;
    dog.hitFlash = 0;
    resolveWalls(dog, DOG.r);
  }

  resolveWalls(player, PLAYER.r);
  for (const b of bots) resolveWalls(b, b.type.r);

  elState.textContent = "";
  updateHud();
}

function makeBot(x, y, kind) {
  const t = BOT_TYPES[kind];
  const b = {
    x,
    y,
    hp: t.maxHp,
    cd: 0.6 + Math.random() * 0.4,
    reactLeft: t.reactTime,
    sinceHit: 999,
    hitFlash: 0,
    stunLeft: 0,
    type: t,
    // LOS cache — пересчитывается ~каждые 0.1 с, а не каждый кадр
    losCd: Math.random() * 0.12,
    seesPlayerC: false,
    seesDogC: false,
    distToDogC: Infinity,
    // Кэш угла steering (steerAround — дорогой)
    steerCd: Math.random() * 0.07,
    steerAngle: 0,
  };
  if (kind === "mage") b.summonTimer = 0;
  return b;
}

function makeDog() {
  return {
    x: 0,
    y: 0,
    hp: DOG.maxHp,
    maxHp: DOG.maxHp,
    cd: 0,
    sinceHit: 999,
    hitFlash: 0,
    steerCd: 0,
    steerAngle: 0,
  };
}

/** Пистолет всегда; дробовик и топор — после наград на уровнях. */
function getAvailableWeaponIds() {
  const out = ["pistol"];
  if (player.upgrades.has("shotgun")) out.push("shotgun");
  if (player.upgrades.has("axe")) out.push("axe");
  if (player.upgrades.has("minigun")) out.push("minigun");
  return out;
}

/**
 * @param {number} delta -1 = предыдущее (←), +1 = следующее (→)
 */
function cyclePlayerWeapon(delta) {
  const list = getAvailableWeaponIds();
  if (list.length <= 1) return;
  let i = list.indexOf(player.weapon);
  if (i < 0) i = 0;
  i = (i + delta + list.length) % list.length;
  player.weapon = list[i];
  updateHud();
}

function updateHud() {
  const lvlLabel = LEVELS[currentLevel]?.name ?? "?";
  const wpn = (WEAPONS[player.weapon] || WEAPONS.pistol).label;
  const dogTxt = dog && dog.hp > 0 ? ` · 🐶 ${Math.ceil(dog.hp)}` : "";
  const hpLine = `HP: ${Math.max(0, Math.ceil(player.hp))}/${player.maxHp} · ${wpn} · Ур. ${lvlLabel}${dogTxt}`;
  if (elHp.textContent !== hpLine) elHp.textContent = hpLine;
  const alive = bots.filter((b) => b.hp > 0).length;
  const botLine = `Боты: ${alive}`;
  if (elBots.textContent !== botLine) elBots.textContent = botLine;
  let st = "";
  if (state === STATE.WON) st = "Уровень пройден — выберите награду (1/2/3)";
  else if (state === STATE.CLEARED) st = "Игра пройдена! R — заново";
  else if (state === STATE.LOST) st = "Поражение — R";
  if (elState.textContent !== st) elState.textContent = st;
}

function circleWallOverlap(cx, cy, cr) {
  for (const w of walls) {
    const r = rectCircleResolve(cx, cy, cr, w.x, w.y, w.w, w.h);
    if (r) return r;
  }
  return null;
}

function resolveWalls(ent, radius) {
  for (let iter = 0; iter < 4; iter++) {
    let any = false;
    for (const w of walls) {
      const r = rectCircleResolve(ent.x, ent.y, radius, w.x, w.y, w.w, w.h);
      if (r) {
        ent.x += r.px;
        ent.y += r.py;
        any = true;
      }
    }
    if (!any) break;
  }
}

function moveEntity(ent, dx, dy, radius) {
  ent.x += dx;
  resolveWalls(ent, radius);
  ent.y += dy;
  resolveWalls(ent, radius);
  ent.x = Math.max(radius, Math.min(W - radius, ent.x));
  ent.y = Math.max(radius, Math.min(H - radius, ent.y));
}

function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

function lineHitsWall(x0, y0, x1, y1, pad = 0) {
  for (const w of walls) {
    if (segmentRectIntersect(x0, y0, x1, y1, w.x - pad, w.y - pad, w.w + pad * 2, w.h + pad * 2))
      return true;
  }
  return false;
}

function segmentRectIntersect(x0, y0, x1, y1, rx, ry, rw, rh) {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - rx, rx + rw - x0, y0 - ry, ry + rh - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

const STEER_OFFSETS = [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 1.9, -1.9, Math.PI * 0.65, -Math.PI * 0.65];

function steerAround(ent, radius, targetAngle) {
  // Короткий луч прямо вперёд — если свободно, идём туда
  const look = radius * 2.4;
  for (let i = 0; i < STEER_OFFSETS.length; i++) {
    const a = targetAngle + STEER_OFFSETS[i];
    const nx = ent.x + Math.cos(a) * look;
    const ny = ent.y + Math.sin(a) * look;
    if (nx < radius || nx > W - radius || ny < radius || ny > H - radius) continue;
    // Проверяем отрезок от текущей позиции до предполагаемой следующей
    if (!lineHitsWall(ent.x, ent.y, nx, ny, radius * 0.6)) return a;
  }
  // Если все направления заблокированы — случайный угол назад
  return targetAngle + Math.PI + (Math.random() - 0.5) * 1.2;
}

/** Ближний бой: удар по собаке с этим шансом не наносит урон (визуальный «промах»). */
const MELEE_DOG_MISS = 0.3;

function botThink(b, dt) {
  const t = b.type;

  if (b.stunLeft > 0) { b.stunLeft -= dt; return; }

  const d = dist(b.x, b.y, player.x, player.y);
  const angToPlayer = Math.atan2(player.y - b.y, player.x - b.x);

  // ── LOS-кэш: пересчёт ~каждые 0.12 с вместо каждого кадра (~7 раз/с вместо 60) ──
  b.losCd -= dt;
  if (b.losCd <= 0) {
    b.losCd = 0.10 + Math.random() * 0.04;
    b.seesPlayerC = d < t.aggroRange && !lineHitsWall(b.x, b.y, player.x, player.y);
    if (dog && dog.hp > 0) {
      const dDog = dist(b.x, b.y, dog.x, dog.y);
      b.distToDogC = dDog;
      b.seesDogC = dDog < t.aggroRange && !lineHitsWall(b.x, b.y, dog.x, dog.y);
    } else {
      b.distToDogC = Infinity;
      b.seesDogC = false;
    }
  }

  const seesP = b.seesPlayerC;
  b.cd -= dt;

  if (t.kind === "ranger" || t.kind === "mage") {
    const hasTarget = seesP || b.seesDogC;
    if (hasTarget) b.reactLeft -= dt;
    else b.reactLeft = t.reactTime;

    if (t.kind === "mage") {
      b.summonTimer += dt;
      if (b.summonTimer >= t.summonEvery) { b.summonTimer = 0; mageSummonSkeletons(b); }
    }

    let moveAngle = angToPlayer;
    let moveScale = 1;
    const rangerRetreating = t.kind !== "skeleton" && b.hp < t.maxHp * 0.5;
    if (rangerRetreating && seesP && d < t.keepDistance + 120) {
      moveAngle = angToPlayer + Math.PI;
      moveScale = 0.7;
    } else if (seesP && d < t.keepDistance) {
      moveAngle = angToPlayer + Math.PI;
      moveScale = t.kind === "mage" ? 0.88 : 0.9;
    } else if (seesP && d < t.keepDistance + 40) {
      moveScale = 0;
    }

    // ── Steer-кэш: пересчёт ~каждые 0.09 с ──
    b.steerCd -= dt;
    if (b.steerCd <= 0) {
      b.steerAngle = steerAround(b, t.r, moveAngle);
      b.steerCd = 0.07 + Math.random() * 0.04;
    }
    moveEntity(b, Math.cos(b.steerAngle) * t.speed * moveScale * dt, Math.sin(b.steerAngle) * t.speed * moveScale * dt, t.r);

    if (hasTarget && b.reactLeft <= 0) {
      const usePlayer = !b.seesDogC || (seesP && d <= b.distToDogC);
      const tx = usePlayer ? player.x : dog.x;
      const ty = usePlayer ? player.y : dog.y;
      const ang = Math.atan2(ty - b.y, tx - b.x);
      if (t.kind === "mage") tryMageBlast(b, ang, t);
      else tryFire(b, ang, t, "bot");
    }
  } else {
    // melee / boss / skeleton
    const seesDog = b.seesDogC;
    const dD = b.distToDogC;
    if (seesP || seesDog) b.reactLeft -= dt;
    else b.reactLeft = t.reactTime;

    // Отступление при < 50% HP (не скелеты)
    const retreating = t.kind !== "skeleton" && b.hp < t.maxHp * 0.5;
    const moveTarget = retreating ? angToPlayer + Math.PI : angToPlayer;

    b.steerCd -= dt;
    if (b.steerCd <= 0) {
      b.steerAngle = steerAround(b, t.r, moveTarget);
      b.steerCd = 0.07 + Math.random() * 0.04;
    }

    const contactP = t.r + PLAYER.r + t.attackRange;
    const contactD = t.r + DOG.r + t.attackRange;
    const moveSpeed = retreating ? t.speed * 0.75 : t.speed;
    if (retreating || d > contactP - 2) {
      moveEntity(b, Math.cos(b.steerAngle) * moveSpeed * dt, Math.sin(b.steerAngle) * moveSpeed * dt, t.r);
    }
    if (b.reactLeft <= 0 && b.cd <= 0) {
      const inP = seesP && d <= contactP;
      const inD = seesDog && dD <= contactD;
      if (inP && inD) {
        if (d <= dD) {
          damagePlayer(t.attackDamage);
          b.cd = t.attackCd;
          spawnSlash(b.x, b.y, angToPlayer, t.kind === "boss" ? 48 : 28);
        } else {
          const angToDog = Math.atan2(dog.y - b.y, dog.x - b.x);
          b.cd = t.attackCd;
          if (Math.random() >= MELEE_DOG_MISS) damageDog(t.attackDamage);
          else spawnFloater(b.x, b.y - t.r, "Промах", "#9ca3af");
          spawnSlash(b.x, b.y, angToDog, t.kind === "boss" ? 48 : 28);
        }
      } else if (inP) {
        damagePlayer(t.attackDamage);
        b.cd = t.attackCd;
        spawnSlash(b.x, b.y, angToPlayer, t.kind === "boss" ? 48 : 28);
      } else if (inD) {
        const angToDog = Math.atan2(dog.y - b.y, dog.x - b.x);
        b.cd = t.attackCd;
        if (Math.random() >= MELEE_DOG_MISS) damageDog(t.attackDamage);
        else spawnFloater(b.x, b.y - t.r, "Промах", "#9ca3af");
        spawnSlash(b.x, b.y, angToDog, t.kind === "boss" ? 48 : 28);
      }
    }
  }
}

function dogThink(dt) {
  if (!dog || dog.hp <= 0) return;
  dog.cd -= dt;

  let target = null;
  let bestD = DOG.aggroRange;
  for (const b of bots) {
    if (b.hp <= 0) continue;
    const d = dist(dog.x, dog.y, b.x, b.y);
    if (d < bestD && !lineHitsWall(dog.x, dog.y, b.x, b.y)) {
      bestD = d;
      target = b;
    }
  }

  dog.steerCd -= dt;
  if (target) {
    const ang = Math.atan2(target.y - dog.y, target.x - dog.x);
    const contact = DOG.r + target.type.r + DOG.attackRange;
    if (bestD > contact - 2) {
      if (dog.steerCd <= 0) {
        dog.steerAngle = steerAround(dog, DOG.r, ang);
        dog.steerCd = 0.07 + Math.random() * 0.04;
      }
      moveEntity(dog, Math.cos(dog.steerAngle) * DOG.speed * dt, Math.sin(dog.steerAngle) * DOG.speed * dt, DOG.r);
    }
    if (bestD <= contact && dog.cd <= 0) {
      damageBot(target, DOG.damage);
      if (Math.random() < 0.2) target.stunLeft = Math.max(target.stunLeft, DOG.stunOnHit);
      if (Math.random() < 0.1) {
        dog.hp = dog.maxHp;
        spawnFloater(dog.x, dog.y - DOG.r * 2, "Полное HP!", "#4ade80");
      }
      dog.cd = DOG.attackCd;
      spawnSlash(target.x, target.y, ang + Math.PI, 22);
    }
  } else {
    const d = dist(dog.x, dog.y, player.x, player.y);
    if (d > 60) {
      const ang = Math.atan2(player.y - dog.y, player.x - dog.x);
      if (dog.steerCd <= 0) {
        dog.steerAngle = steerAround(dog, DOG.r, ang);
        dog.steerCd = 0.07 + Math.random() * 0.04;
      }
      moveEntity(dog, Math.cos(dog.steerAngle) * DOG.speed * 0.85 * dt, Math.sin(dog.steerAngle) * DOG.speed * 0.85 * dt, DOG.r);
    }
  }
}

function tryFire(from, angle, cfg, owner, extraDamage = 0) {
  if (from.cd > 0) return;
  from.cd = cfg.fireCd;
  const muzzle = cfg.r + 6;
  bullets.push({
    x: from.x + Math.cos(angle) * muzzle,
    y: from.y + Math.sin(angle) * muzzle,
    vx: Math.cos(angle) * cfg.bulletSpeed,
    vy: Math.sin(angle) * cfg.bulletSpeed,
    owner,
    damage: (cfg.bulletDamage ?? 14) + extraDamage,
    r: cfg.kind === "boss" ? 8 : 5,
    life: 1.4,
  });
}

/**
 * Снаряд мага: при столкновении взрывается небольшим радиусом, 15 урона по существам в зоне.
 */
function tryMageBlast(from, angle, cfg) {
  if (from.cd > 0) return;
  from.cd = cfg.fireCd;
  const muzzle = cfg.r + 8;
  bullets.push({
    x: from.x + Math.cos(angle) * muzzle,
    y: from.y + Math.sin(angle) * muzzle,
    vx: Math.cos(angle) * cfg.bulletSpeed,
    vy: Math.sin(angle) * cfg.bulletSpeed,
    owner: "bot",
    r: 7,
    life: 2.2,
    magicBlast: true,
    blastRadius: cfg.blastRadius,
    blastDamage: cfg.blastDamage,
  });
}

function detonateMageBlast(bx, by, R, damage) {
  const pr = R + PLAYER.r;
  if (dist2(bx, by, player.x, player.y) < pr * pr) {
    damagePlayer(damage);
  }
  if (dog && dog.hp > 0) {
    const dr = R + DOG.r;
    if (dist2(bx, by, dog.x, dog.y) < dr * dr) {
      damageDog(damage);
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI * 2 * i) / 4;
    particles.push({
      x: bx + Math.cos(a) * R * 0.5,
      y: by + Math.sin(a) * R * 0.5,
      vx: Math.cos(a) * 90,
      vy: Math.sin(a) * 90,
      life: 0.35,
      total: 0.35,
      color: "#a78bfa",
      r: 2.5,
    });
  }
  spawnImpact(bx, by, "#8b5cf6");
}

function mageSummonSkeletons(mage) {
  for (let i = 0; i < 3; i++) {
    const a = (Math.PI * 2 * i) / 3 + (Math.random() - 0.5) * 0.3;
    const distOff = 44 + Math.random() * 18;
    let nx = mage.x + Math.cos(a) * distOff;
    let ny = mage.y + Math.sin(a) * distOff;
    nx = Math.max(mage.type.r + 8, Math.min(W - mage.type.r - 8, nx));
    ny = Math.max(mage.type.r + 8, Math.min(H - mage.type.r - 8, ny));
    const sk = makeBot(nx, ny, "skeleton");
    resolveWalls(sk, sk.type.r);
    bots.push(sk);
  }
  spawnFloater(mage.x, mage.y - mage.type.r - 18, "Скелеты!", "#c4b5fd");
}

/**
 * Unified player attack: pistol / shotgun shoot bullets, axe swings a melee arc.
 */
function playerAttack(angle) {
  const wp = WEAPONS[player.weapon] || WEAPONS.pistol;
  if (player.cd > 0) return;
  player.cd = wp.fireCd;
  const baseDmg = wp.melee
    ? AXE_BASE_DAMAGE + player.damageBonus
    : wp.baseDamage !== undefined
      ? wp.baseDamage + player.damageBonus * 0.3
      : (PLAYER.bulletDamage + player.damageBonus) * wp.damageMul;

  if (wp.melee) {
    slashes.push({ x: player.x, y: player.y, ang: angle, life: 0.2, r: wp.meleeRange });
    for (const b of bots) {
      if (b.hp <= 0) continue;
      const d = dist(player.x, player.y, b.x, b.y);
      if (d > wp.meleeRange + b.type.r) continue;
      const a = Math.atan2(b.y - player.y, b.x - player.x);
      let da = Math.abs(a - angle);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da <= wp.meleeArc / 2 && !lineHitsWall(player.x, player.y, b.x, b.y)) {
        damageBot(b, baseDmg);
      }
    }
    return;
  }

  const muzzle = PLAYER.r + 6;
  for (let i = 0; i < wp.bullets; i++) {
    const spread = wp.bullets > 1 ? (i / (wp.bullets - 1) - 0.5) * wp.spread : 0;
    const a = angle + spread;
    bullets.push({
      x: player.x + Math.cos(a) * muzzle,
      y: player.y + Math.sin(a) * muzzle,
      vx: Math.cos(a) * PLAYER.bulletSpeed,
      vy: Math.sin(a) * PLAYER.bulletSpeed,
      owner: "player",
      damage: baseDmg,
      r: 5,
      life: 1.2,
    });
  }
}

function damagePlayer(amount) {
  player.hp -= amount;
  player.sinceHit = 0;
  player.hitFlash = 0.18;
  hurtFlash = Math.max(hurtFlash, 0.4);
  spawnImpact(player.x, player.y, "#f87171");
  spawnFloater(player.x, player.y - PLAYER.r, `-${Math.ceil(amount)}`, "#f87171");
}

function damageDog(amount) {
  if (!dog || dog.hp <= 0) return;
  dog.hp -= amount;
  dog.sinceHit = 0;
  dog.hitFlash = 0.18;
  spawnImpact(dog.x, dog.y, "#fbbf24");
  spawnFloater(dog.x, dog.y - DOG.r, `-${Math.ceil(amount)}`, "#fbbf24");
}

function damageBot(b, amount) {
  b.hp -= amount;
  b.sinceHit = 0;
  b.hitFlash = 0.15;
  spawnImpact(b.x, b.y, "#fde047");
  spawnFloater(b.x, b.y - b.type.r, `-${Math.ceil(amount)}`, "#fde047");
  if (b.hp <= 0 && b.type.kind !== "skeleton") maybeDropPickup(b.x, b.y);
}

function spawnSlash(x, y, ang, r = 28) {
  slashes.push({ x, y, ang, life: 0.18, r });
}

const MAX_PARTICLES = 80;
const MAX_FLOATERS = 40;
const MAX_BULLETS = 80;

function spawnImpact(x, y, color) {
  for (let i = 0; i < 3; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 120;
    particles.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      life: 0.35,
      total: 0.35,
      color,
      r: 2 + Math.random() * 2,
    });
  }
}

function spawnFloater(x, y, text, color) {
  floaters.push({ x, y, text, color, life: 0.7, total: 0.7 });
}

const PICKUP_TYPES = {
  damage: { color: "#fb923c", label: "+урон", dmg: 4, hp: 0, mhp: 0 },
  health: { color: "#22c55e", label: "+HP", dmg: 0, hp: 25, mhp: 20 },
};

function maybeDropPickup(x, y) {
  if (!LEVELS[currentLevel].drops) return;
  const kind = Math.random() < 0.5 ? "damage" : "health";
  pickups.push({ x, y, kind, bob: Math.random() * Math.PI * 2 });
}

function collectPickup(p) {
  const t = PICKUP_TYPES[p.kind];
  if (!t) return;
  player.damageBonus += t.dmg;
  player.maxHp += t.mhp;
  player.hp = Math.min(player.maxHp, player.hp + t.hp);
}

function resolveEntityOverlaps() {
  const list = [];
  for (const b of bots) if (b.hp > 0) list.push({ ref: b, r: b.type.r, kind: b.type.kind });
  if (dog && dog.hp > 0) list.push({ ref: dog, r: DOG.r, kind: "dog" });

  const n = list.length;
  const maxIter = n > 18 ? 1 : 2;

  for (let iter = 0; iter < maxIter; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = list[i];
        const b = list[j];
        // скелеты толкают друг друга
        const dx = b.ref.x - a.ref.x;
        const dy = b.ref.y - a.ref.y;
        const minD = a.r + b.r;
        const minD2 = minD * minD;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD2) continue;
        const d = Math.sqrt(d2) || 0.0001;
        const push = (minD - d) / 2 + 0.01;
        const nx = dx / d;
        const ny = dy / d;
        a.ref.x -= nx * push;
        a.ref.y -= ny * push;
        b.ref.x += nx * push;
        b.ref.y += ny * push;
        a.ref.x = Math.max(a.r, Math.min(W - a.r, a.ref.x));
        a.ref.y = Math.max(a.r, Math.min(H - a.r, a.ref.y));
        b.ref.x = Math.max(b.r, Math.min(W - b.r, b.ref.x));
        b.ref.y = Math.max(b.r, Math.min(H - b.r, b.ref.y));
      }
      const ent = list[i];
      const dx = player.x - ent.ref.x;
      const dy = player.y - ent.ref.y;
      const minD = ent.r + PLAYER.r;
      const minD2 = minD * minD;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD2) continue;
      const d = Math.sqrt(d2) || 0.0001;
      const push = (minD - d) / 2 + 0.01;
      const nx = dx / d;
      const ny = dy / d;
      ent.ref.x -= nx * push;
      ent.ref.y -= ny * push;
      player.x += nx * push;
      player.y += ny * push;
      ent.ref.x = Math.max(ent.r, Math.min(W - ent.r, ent.ref.x));
      ent.ref.y = Math.max(ent.r, Math.min(H - ent.r, ent.ref.y));
      player.x = Math.max(PLAYER.r, Math.min(W - PLAYER.r, player.x));
      player.y = Math.max(PLAYER.r, Math.min(H - PLAYER.r, player.y));
    }
  }
}

function bossSummon() {
  const spots = [
    { x: 80, y: 80 },
    { x: W - 80, y: 80 },
    { x: 80, y: H - 80 },
    { x: W - 80, y: H - 80 },
  ];
  const r = spots[Math.floor(Math.random() * spots.length)];
  const m = spots[Math.floor(Math.random() * spots.length)];
  const ranger = makeBot(r.x, r.y, "ranger");
  const melee = makeBot(m.x, m.y, "melee");
  resolveWalls(ranger, ranger.type.r);
  resolveWalls(melee, melee.type.r);
  bots.push(ranger);
  bots.push(melee);
  spawnFloater(W / 2, 40, "Босс призывает подмогу!", "#fbbf24");
}

function update(dt) {
  if (state === STATE.MENU) return;
  time += dt;
  if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  if (floaters.length > MAX_FLOATERS) floaters.splice(0, floaters.length - MAX_FLOATERS);
  if (bullets.length > MAX_BULLETS) bullets.splice(0, bullets.length - MAX_BULLETS);
  if (state !== STATE.PLAYING) return;

  let mx = 0;
  let my = 0;
  if (keys.has("KeyW")) my -= 1;
  if (keys.has("KeyS")) my += 1;
  if (keys.has("KeyA")) mx -= 1;
  if (keys.has("KeyD")) mx += 1;
  // Мобильный джойстик
  if (isMobile && mJoy.active) { mx += mJoy.dx; my += mJoy.dy; }
  const len = Math.hypot(mx, my);
  if (len > 0) { mx /= len; my /= len; }
  moveEntity(player, mx * PLAYER.speed * dt, my * PLAYER.speed * dt, PLAYER.r);

  const aim = Math.atan2(mouseY - player.y, mouseX - player.x);
  player.cd -= dt;
  if (mouseLeftHeld || mouseRightHeld) playerAttack(aim);

  for (const b of bots) botThink(b, dt);
  dogThink(dt);

  const boss = bots.find((b) => b.type.kind === "boss" && b.hp > 0);
  if (boss) {
    bossSummonTimer += dt;
    if (bossSummonTimer >= boss.type.summonEvery) {
      bossSummonTimer = 0;
      bossSummon();
    }
  }

  for (const bullet of bullets) {
    bullet.life -= dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
  }

  for (const bullet of bullets) {
    const br = bullet.r;
    if (bullet.magicBlast) {
      let hitWall = false;
      for (const w of walls) {
        if (circleHitsWall(bullet.x, bullet.y, br, w)) {
          hitWall = true;
          break;
        }
      }
      if (hitWall) {
        detonateMageBlast(bullet.x, bullet.y, bullet.blastRadius, bullet.blastDamage);
        bullet.life = 0;
        continue;
      }
      if (dist2(bullet.x, bullet.y, player.x, player.y) < (PLAYER.r + br) * (PLAYER.r + br)) {
        detonateMageBlast(bullet.x, bullet.y, bullet.blastRadius, bullet.blastDamage);
        bullet.life = 0;
        continue;
      }
      if (dog && dog.hp > 0 && dist2(bullet.x, bullet.y, dog.x, dog.y) < (DOG.r + br) * (DOG.r + br)) {
        detonateMageBlast(bullet.x, bullet.y, bullet.blastRadius, bullet.blastDamage);
        bullet.life = 0;
        continue;
      }
      continue;
    }
    let hitWall = false;
    for (const w of walls) {
      if (circleHitsWall(bullet.x, bullet.y, br, w)) {
        hitWall = true;
        break;
      }
    }
    if (hitWall) {
      bullet.life = 0;
      spawnImpact(bullet.x, bullet.y, "#94a3b8");
      continue;
    }
    if (bullet.owner === "bot") {
      const pR2 = (PLAYER.r + br) * (PLAYER.r + br);
      if (dist2(bullet.x, bullet.y, player.x, player.y) < pR2) {
        damagePlayer(bullet.damage);
        bullet.life = 0;
        continue;
      }
      if (dog && dog.hp > 0) {
        const dR2 = (DOG.r + br) * (DOG.r + br);
        if (dist2(bullet.x, bullet.y, dog.x, dog.y) < dR2) {
          damageDog(bullet.damage);
          bullet.life = 0;
          continue;
        }
      }
    } else {
      for (const b of bots) {
        if (b.hp <= 0) continue;
        const hitR = b.type.r + br;
        if (dist2(bullet.x, bullet.y, b.x, b.y) < hitR * hitR) {
          damageBot(b, bullet.damage);
          bullet.life = 0;
          break;
        }
      }
    }
  }

  // Фильтрация пуль на месте вместо создания нового массива каждый кадр
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
      bullets.splice(i, 1);
    }
  }

  for (const p of pickups) p.bob += dt * 3;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (dist(p.x, p.y, player.x, player.y) < PLAYER.r + 12) {
      collectPickup(p);
      pickups.splice(i, 1);
    }
  }

  player.sinceHit += dt;
  if (player.hp > 0 && player.sinceHit >= PLAYER.regenDelay && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + PLAYER.regenRate * dt);
  }
  if (dog && dog.hp > 0) {
    dog.sinceHit += dt;
    if (dog.sinceHit >= 3 && dog.hp < dog.maxHp) dog.hp = Math.min(dog.maxHp, dog.hp + 5 * dt);
  }
  for (const b of bots) {
    if (b.hp <= 0) continue;
    b.sinceHit += dt;
    if (b.sinceHit >= b.type.regenDelay && b.hp < b.type.maxHp) {
      b.hp = Math.min(b.type.maxHp, b.hp + b.type.regenRate * dt);
    }
  }

  for (const s of slashes) s.life -= dt;
  for (let i = slashes.length - 1; i >= 0; i--) if (slashes[i].life <= 0) slashes.splice(i, 1);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.88;
    p.vy *= 0.88;
  }

  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt;
    if (f.life <= 0) { floaters.splice(i, 1); continue; }
    f.y -= 22 * dt;
  }

  if (hurtFlash > 0) hurtFlash = Math.max(0, hurtFlash - dt);
  if (player.hitFlash > 0) player.hitFlash = Math.max(0, player.hitFlash - dt);
  if (dog && dog.hitFlash > 0) dog.hitFlash = Math.max(0, dog.hitFlash - dt);
  for (const b of bots) if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt);

  resolveEntityOverlaps();

  // Удаляем мёртвых ботов из массива — без этого он растёт бесконечно (призывы босса/мага)
  for (let i = bots.length - 1; i >= 0; i--) {
    if (bots[i].hp <= 0) bots.splice(i, 1);
  }

  if (player.hp <= 0) {
    player.hp = 0;
    state = STATE.LOST;
  } else if (bots.length === 0 && time > 0.3) {
    if (currentLevel + 1 >= LEVELS.length) state = STATE.CLEARED;
    else state = STATE.WON;
  }

  if (state === STATE.PLAYING) {
    const bossE = bots.find((b) => b.type.kind === "boss" && b.hp > 0);
    hudHasBoss = !!bossE;
    hudOverlayBossT = bossE ? Math.max(0, bossE.type.summonEvery - bossSummonTimer) : 0;
    const mageE = bots.find((b) => b.type.kind === "mage" && b.hp > 0);
    hudHasMage = !!mageE;
    hudOverlayMageT = mageE ? Math.max(0, mageE.type.summonEvery - mageE.summonTimer) : 0;
  }

  updateHud();
}

const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",system-ui,sans-serif';

let _drawEmojiFontPx = -1;

function drawEmoji(x, y, r, emoji, flash) {
  const fp = 0 | (r * 2.1);
  if (fp !== _drawEmojiFontPx) {
    _drawEmojiFontPx = fp;
    ctx.font = `${fp}px ${EMOJI_FONT}`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (flash > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.55, flash * 3)})`;
    ctx.fill();
    ctx.restore();
  }
  ctx.fillText(emoji, x, y);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawHealthBar(x, y, w, h, ratio) {
  const u = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  ctx.fillStyle = "#334155";
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = u > 0.35 ? "#22c55e" : "#f97316";
  ctx.fillRect(x - w / 2, y, w * u, h);
}

function drawPickup(p) {
  const t = PICKUP_TYPES[p.kind];
  if (!t) return;
  const yoff = Math.sin(p.bob) * 3;
  ctx.save();
  ctx.translate(p.x, p.y + yoff);
  ctx.fillStyle = t.color;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (p.kind === "health") {
    ctx.moveTo(-5, 0);
    ctx.lineTo(5, 0);
    ctx.moveTo(0, -5);
    ctx.lineTo(0, 5);
  } else {
    ctx.moveTo(-5, 3);
    ctx.lineTo(0, -5);
    ctx.lineTo(5, 3);
  }
  ctx.stroke();
  ctx.restore();
}

function drawChoiceOverlay() {
  ctx.fillStyle = "rgba(0,0,0,0.68)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f8fafc";
  ctx.font = `bold 28px ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`Уровень ${currentLevel + 1} пройден`, W / 2, 60);
  ctx.font = `16px ${EMOJI_FONT}`;
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Выберите награду (1 / 2 / 3 / 4)", W / 2, 88);

  const options = getAvailableUpgrades();
  const COLS = 2;
  const cardW = 260;
  const cardH = 140;
  const gapX = 20;
  const gapY = 14;
  const rows = Math.ceil(options.length / COLS);
  const totalGridH = rows * cardH + (rows - 1) * gapY;
  const gridTop = H / 2 - totalGridH / 2 + 10;

  options.forEach((u, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const rowCount = Math.min(COLS, options.length - row * COLS);
    const rowW = rowCount * cardW + (rowCount - 1) * gapX;
    const rowStartX = (W - rowW) / 2;
    const x = rowStartX + col * (cardW + gapX);
    const y = gridTop + row * (cardH + gapY);

    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = "#7dd3fc";
    ctx.lineWidth = 2.5;
    roundRect(x, y, cardW, cardH, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#fde68a";
    ctx.font = `bold 36px ${EMOJI_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(`${i + 1}`, x + 30, y + 50);

    ctx.fillStyle = "#f8fafc";
    ctx.font = `bold 18px ${EMOJI_FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(u.title, x + 58, y + 36);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = `13px ${EMOJI_FONT}`;
    wrapText(u.desc, x + 16, y + 66, cardW - 24, 18);
    ctx.textAlign = "center";
  });

  if (options.length === 0) {
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `18px ${EMOJI_FONT}`;
    ctx.fillText("Все награды получены — Space для следующего уровня", W / 2, H / 2);
  }
  ctx.textAlign = "left";
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(text, x, y, maxW, lh) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line + w + " ";
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line.trim(), x, yy);
      line = w + " ";
      yy += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line.trim(), x, yy);
}

function drawMenu() {
  _drawEmojiFontPx = -1;
  ctx.fillStyle = "#0f1a2e";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#f1f5f9";
  ctx.font = `bold 36px ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⚔️  Выбор уровня", W / 2, 48);

  ctx.font = `15px ${EMOJI_FONT}`;
  ctx.fillStyle = "#64748b";
  ctx.fillText("Кликни на карточку или нажми 1–6", W / 2, 82);

  const cardW = 264;
  const cardH = 170;
  const cols = 3;
  const rows = 2;
  const gapX = 20;
  const gapY = 18;
  const totalW = cols * cardW + (cols - 1) * gapX;
  const startX = (W - totalW) / 2;
  const startY = 110;

  for (let i = 0; i < LEVELS.length; i++) {
    const L = LEVELS[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = startX + col * (cardW + gapX);
    const cy = startY + row * (cardH + gapY);
    const hov = menuHoverIdx === i;

    ctx.fillStyle = hov ? "#1e3a5f" : "#16253a";
    ctx.strokeStyle = hov ? "#7dd3fc" : "#334155";
    ctx.lineWidth = hov ? 2.5 : 1.5;
    roundRect(cx, cy, cardW, cardH, 14);
    ctx.fill();
    ctx.stroke();

    const numLabel = `${i + 1}`;
    ctx.fillStyle = hov ? "#38bdf8" : "#475569";
    ctx.font = `bold 13px ${EMOJI_FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(numLabel, cx + 12, cy + 10);

    ctx.font = `bold 34px ${EMOJI_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(L.emoji || "🎮", cx + cardW / 2, cy + 52);

    ctx.fillStyle = "#f1f5f9";
    ctx.font = `bold 15px ${EMOJI_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(L.name, cx + cardW / 2, cy + 96);

    ctx.fillStyle = "#94a3b8";
    ctx.font = `13px ${EMOJI_FONT}`;
    ctx.fillText(L.desc || "", cx + cardW / 2, cy + 120);

    if (i >= 4) {
      ctx.fillStyle = "#fbbf24";
      ctx.font = `bold 11px ${EMOJI_FONT}`;
      ctx.fillText("🎁 Все баффы выданы", cx + cardW / 2, cy + 140);
    }

    if (hov) {
      ctx.fillStyle = "#0ea5e9";
      roundRect(cx + 40, cy + cardH - 38, cardW - 80, 26, 8);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `bold 13px ${EMOJI_FONT}`;
      ctx.fillText("Играть", cx + cardW / 2, cy + cardH - 25);
    }
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawMobileControls() {
  if (!isMobile || state !== STATE.PLAYING) return;
  ctx.save();

  // ── Джойстик (левая сторона) ─────────────────────────
  const jbx = mJoy.active ? mJoy.baseX : W * 0.18;
  const jby = mJoy.active ? mJoy.baseY : H * 0.78;
  const JOY_MAX = 70;

  // Основа
  ctx.beginPath();
  ctx.arc(jbx, jby, JOY_MAX, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Стик
  const stx = jbx + mJoy.dx * JOY_MAX;
  const sty = jby + mJoy.dy * JOY_MAX;
  ctx.beginPath();
  ctx.arc(stx, sty, 32, 0, Math.PI * 2);
  ctx.fillStyle = mJoy.active ? "rgba(125,211,252,0.55)" : "rgba(255,255,255,0.18)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // ── Зона прицела (правая сторона) ────────────────────
  if (mAim.active) {
    ctx.beginPath();
    ctx.arc(mAim.x, mAim.y, 40, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(251,191,36,0.5)";
    ctx.lineWidth = 3;
    ctx.stroke();
    // Крестик
    ctx.strokeStyle = "rgba(251,191,36,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mAim.x - 12, mAim.y); ctx.lineTo(mAim.x + 12, mAim.y);
    ctx.moveTo(mAim.x, mAim.y - 12); ctx.lineTo(mAim.x, mAim.y + 12);
    ctx.stroke();
  }

  // ── Кнопки HUD ───────────────────────────────────────
  for (const btn of mobBtns) {
    ctx.beginPath();
    ctx.arc(btn.ax, btn.ay, btn.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(30,50,80,0.72)";
    ctx.fill();
    ctx.strokeStyle = "rgba(125,211,252,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#e2e8f0";
    ctx.font = `bold 18px ${EMOJI_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(btn.label, btn.ax, btn.ay);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function draw() {
  if (state === STATE.MENU) {
    drawMenu();
    return;
  }
  _drawEmojiFontPx = -1;
  if (bgCanvas) {
    ctx.drawImage(bgCanvas, 0, 0);
  } else {
    ctx.fillStyle = "#1a2332";
    ctx.fillRect(0, 0, W, H);
  }

  for (const p of pickups) drawPickup(p);

  drawHealthBar(player.x, player.y - PLAYER.r - 14, 44, 4, player.hp / player.maxHp);
  drawEmoji(player.x, player.y, PLAYER.r, PLAYER.emoji, player.hitFlash);

  const aim = Math.atan2(mouseY - player.y, mouseX - player.x);
  ctx.strokeStyle = "rgba(147, 197, 253, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(player.x + Math.cos(aim) * (PLAYER.r + 24), player.y + Math.sin(aim) * (PLAYER.r + 24));
  ctx.stroke();

  if (dog && dog.hp > 0) {
    drawHealthBar(dog.x, dog.y - DOG.r - 10, 30, 3, dog.hp / dog.maxHp);
    drawEmoji(dog.x, dog.y, DOG.r, DOG.emoji, dog.hitFlash);
  }

  for (const b of bots) {
    if (b.hp <= 0) continue;
    drawHealthBar(b.x, b.y - b.type.r - 12, b.type.kind === "boss" ? 80 : 36, b.type.kind === "boss" ? 6 : 3, b.hp / b.type.maxHp);
    drawEmoji(b.x, b.y, b.type.r, b.type.emoji, b.hitFlash);
    if (b.stunLeft > 0) {
      ctx.font = `18px ${EMOJI_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("💫", b.x, b.y - b.type.r - 22);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  }

  ctx.beginPath();
  for (const bullet of bullets) {
    if (!bullet.magicBlast) continue;
    const rr = bullet.r + 1;
    ctx.moveTo(bullet.x + rr, bullet.y);
    ctx.arc(bullet.x, bullet.y, rr, 0, Math.PI * 2);
  }
  if (bullets.some((b) => b.magicBlast)) {
    ctx.fillStyle = "#a78bfa";
    ctx.fill();
  }
  ctx.beginPath();
  for (const bullet of bullets) {
    if (bullet.magicBlast || bullet.owner !== "player") continue;
    const rr = bullet.r;
    ctx.moveTo(bullet.x + rr, bullet.y);
    ctx.arc(bullet.x, bullet.y, rr, 0, Math.PI * 2);
  }
  {
    const has = bullets.some((b) => !b.magicBlast && b.owner === "player");
    if (has) {
      ctx.fillStyle = "#fde047";
      ctx.fill();
    }
  }
  ctx.beginPath();
  for (const bullet of bullets) {
    if (bullet.magicBlast || bullet.owner === "player") continue;
    const rr = bullet.r;
    ctx.moveTo(bullet.x + rr, bullet.y);
    ctx.arc(bullet.x, bullet.y, rr, 0, Math.PI * 2);
  }
  {
    const has = bullets.some((b) => !b.magicBlast && b.owner !== "player");
    if (has) {
      ctx.fillStyle = "#fb923c";
      ctx.fill();
    }
  }

  for (const s of slashes) {
    const a = s.life / 0.18;
    ctx.strokeStyle = `rgba(253, 224, 71, ${a})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, s.ang - 0.7, s.ang + 0.7);
    ctx.stroke();
  }

  // Частицы: один batched path на цвет (без per-particle globalAlpha — дорогой state change)
  if (particles.length) {
    ctx.globalAlpha = 0.82;
    let curColor = null;
    ctx.beginPath();
    for (let pi = 0; pi < particles.length; pi++) {
      const p = particles[pi];
      if (p.color !== curColor) {
        if (curColor !== null) ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath();
        curColor = p.color;
      }
      ctx.moveTo(p.x + p.r, p.y);
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    }
    if (curColor !== null) ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.font = `bold 14px ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  for (const f of floaters) {
    const a = f.total > 0 ? f.life / f.total : 0;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";

  if (hudHasBoss) {
    ctx.fillStyle = "#fbbf24";
    ctx.font = `bold 14px ${EMOJI_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(`Призыв босса через ${hudOverlayBossT.toFixed(1)}с`, W / 2, 22);
    ctx.textAlign = "left";
  }
  if (hudHasMage) {
    ctx.fillStyle = "#c4b5fd";
    ctx.font = `bold 14px ${EMOJI_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(`Скелеты мага через ${hudOverlayMageT.toFixed(1)}с`, W / 2, hudHasBoss ? 42 : 22);
    ctx.textAlign = "left";
  }

  if (hurtFlash > 0) {
    const a = Math.min(0.45, hurtFlash) * 0.55;
    ctx.fillStyle = `rgba(239,68,68,${a})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (state === STATE.WON) {
    drawChoiceOverlay();
  } else if (state !== STATE.PLAYING) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#f8fafc";
    ctx.font = `bold 32px ${EMOJI_FONT}`;
    ctx.textAlign = "center";
    let title = "";
    let hint = "";
    if (state === STATE.LOST) {
      title = "Поражение";
      hint = "M — меню уровней  ·  R — заново с начала";
    } else if (state === STATE.CLEARED) {
      title = "Все уровни пройдены! 🏆";
      hint = "M — меню уровней  ·  R — заново";
    }
    ctx.fillText(title, W / 2, H / 2 - 8);
    ctx.font = `18px ${EMOJI_FONT}`;
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(hint, W / 2, H / 2 + 28);
    ctx.textAlign = "left";
  }

  drawMobileControls();
}

function getAvailableUpgrades() {
  return Object.values(UPGRADES).filter((u) => !player.upgrades.has(u.id));
}

function applyUpgrade(id) {
  if (player.upgrades.has(id)) return;
  player.upgrades.add(id);
  if (id === "shotgun") player.weapon = "shotgun";
  if (id === "minigun") player.weapon = "minigun";
  if (id === "axe") {
    player.maxHp += 100;
    player.hp += 100;
    player.weapon = "axe";
  }
  if (id === "dog") {
    dog = makeDog();
    dog.x = player.x - 30;
    dog.y = player.y + 30;
    resolveWalls(dog, DOG.r);
  }
}

function advanceLevel() {
  if (currentLevel + 1 < LEVELS.length) loadLevel(currentLevel + 1);
}

let last = performance.now();
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
  try {
    update(dt);
    draw();
  } catch (err) {
    console.error("[game]", err);
  }
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyR") {
    newGame();
    return;
  }
  if (e.code === "KeyM") {
    showMenu();
    return;
  }
  if (state === STATE.MENU) {
    const menuKey = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5,
                      Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4, Numpad6: 5 }[e.code];
    if (menuKey !== undefined && menuKey < LEVELS.length) startFromLevel(menuKey);
    return;
  }
  if (state === STATE.WON) {
    const opts = getAvailableUpgrades();
    if (opts.length === 0) {
      if (e.code === "Space") advanceLevel();
      return;
    }
    const idx = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[e.code];
    if (idx !== undefined && opts[idx]) {
      applyUpgrade(opts[idx].id);
      advanceLevel();
    }
    return;
  }
  if (state === STATE.PLAYING && (e.code === "ArrowLeft" || e.code === "ArrowRight")) {
    if (!e.repeat) {
      e.preventDefault();
      cyclePlayerWeapon(e.code === "ArrowLeft" ? -1 : 1);
    }
    return;
  }
  keys.add(e.code);
  if (e.code === "Space") e.preventDefault();
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
});

function syncMouseFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const rw = Math.max(1, rect.width);
  const rh = Math.max(1, rect.height);
  const scaleX = canvas.width / rw;
  const scaleY = canvas.height / rh;
  mouseX = (e.clientX - rect.left) * scaleX;
  mouseY = (e.clientY - rect.top) * scaleY;
}

canvas.addEventListener("mousemove", (e) => {
  syncMouseFromEvent(e);
  if (state === STATE.MENU) {
    const cardW = 264, cardH = 170, cols = 3, gapX = 20, gapY = 18;
    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = (W - totalW) / 2;
    const startY = 110;
    let found = -1;
    for (let i = 0; i < LEVELS.length; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gapX);
      const cy = startY + row * (cardH + gapY);
      if (mouseX >= cx && mouseX <= cx + cardW && mouseY >= cy && mouseY <= cy + cardH) { found = i; break; }
    }
    menuHoverIdx = found;
    canvas.style.cursor = found >= 0 ? "pointer" : "default";
  }
});

canvas.addEventListener("click", (e) => {
  if (state !== STATE.MENU) return;
  syncMouseFromEvent(e);
  if (menuHoverIdx >= 0 && menuHoverIdx < LEVELS.length) startFromLevel(menuHoverIdx);
});

canvas.addEventListener("mousedown", (e) => {
  if (state !== STATE.PLAYING) return;
  if (e.button === 0) {
    mouseLeftHeld = true;
    syncMouseFromEvent(e);
  } else if (e.button === 2) {
    mouseRightHeld = true;
    syncMouseFromEvent(e);
  }
  if (e.button === 0 || e.button === 2) e.preventDefault();
});

window.addEventListener("mouseup", (e) => {
  if (e.button === 0) mouseLeftHeld = false;
  if (e.button === 2) mouseRightHeld = false;
});

canvas.addEventListener("mouseleave", () => {
  mouseLeftHeld = false;
  mouseRightHeld = false;
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ── Touch события (мобильное управление) ────────────────────────────────────
if (isMobile) {
  const JOY_MAX = 70; // максимальный радиус отклонения стика

  function handleMobBtn(cx, cy) {
    for (const btn of mobBtns) {
      const dx = cx - btn.ax, dy = cy - btn.ay;
      if (dx * dx + dy * dy <= btn.r * btn.r) {
        if (btn.id === "menu")  { showMenu(); return true; }
        if (btn.id === "wpnL")  { cyclePlayerWeapon(-1); return true; }
        if (btn.id === "wpnR")  { cyclePlayerWeapon(1);  return true; }
      }
    }
    return false;
  }

  // Меню по тапу — клик по уровню
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (state === STATE.MENU) {
      const t = e.changedTouches[0];
      const { x, y } = scaledTouch(t);
      mouseX = x; mouseY = y;
      // ищем карточку уровня
      const cardW = 264, cardH = 170, cols = 3, gapX = 20, gapY = 18;
      const totalW = cols * cardW + (cols - 1) * gapX;
      const startX = (W - totalW) / 2;
      const startY = 110;
      for (let i = 0; i < LEVELS.length; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const cx = startX + col * (cardW + gapX);
        const cy = startY + row * (cardH + gapY);
        if (x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) {
          startFromLevel(i);
          return;
        }
      }
      return;
    }
    if (state !== STATE.PLAYING) return;
    for (const touch of e.changedTouches) {
      const { x, y } = scaledTouch(touch);
      // Кнопки HUD
      if (handleMobBtn(x, y)) continue;
      if (x < W / 2) {
        // Джойстик
        if (!mJoy.active) {
          mJoy.active = true;
          mJoy.id = touch.identifier;
          mJoy.baseX = x;
          mJoy.baseY = y;
          mJoy.dx = 0;
          mJoy.dy = 0;
        }
      } else {
        // Прицел + стрельба
        if (!mAim.active) {
          mAim.active = true;
          mAim.id = touch.identifier;
          mAim.x = x;
          mAim.y = y;
          mouseX = x;
          mouseY = y;
          mouseLeftHeld = true;
        }
      }
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (state !== STATE.PLAYING) return;
    for (const touch of e.changedTouches) {
      const { x, y } = scaledTouch(touch);
      if (mJoy.active && touch.identifier === mJoy.id) {
        let dx = x - mJoy.baseX;
        let dy = y - mJoy.baseY;
        const len = Math.hypot(dx, dy);
        if (len > JOY_MAX) { dx = dx / len * JOY_MAX; dy = dy / len * JOY_MAX; }
        mJoy.dx = dx / JOY_MAX;
        mJoy.dy = dy / JOY_MAX;
      }
      if (mAim.active && touch.identifier === mAim.id) {
        mAim.x = x;
        mAim.y = y;
        mouseX = x;
        mouseY = y;
      }
    }
  }, { passive: false });

  function touchEnd(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (mJoy.active && touch.identifier === mJoy.id) {
        mJoy.active = false;
        mJoy.dx = 0;
        mJoy.dy = 0;
      }
      if (mAim.active && touch.identifier === mAim.id) {
        mAim.active = false;
        mouseLeftHeld = false;
      }
    }
  }
  canvas.addEventListener("touchend",    touchEnd, { passive: false });
  canvas.addEventListener("touchcancel", touchEnd, { passive: false });

  // Запрет прокрутки страницы при игре
  document.body.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
}
// ─────────────────────────────────────────────────────────────────────────────

newGame();
canvas.focus();
requestAnimationFrame(frame);
