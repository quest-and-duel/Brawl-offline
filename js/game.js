/**
 * Arena Demo — top-down shooter vs bots (Brawl-like prototype).
 * Vanilla canvas, no build step.
 */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const elHp = document.getElementById("hp");
const elBots = document.getElementById("bots");
const elState = document.getElementById("state");

/** Фиксированный размер вьюпорта (пиксели canvas). Мир (W×H) может быть больше. */
const VW = 960, VH = 540;
let W = VW;
let H = VH;
let camX = 0, camY = 0;

const keys = new Set();
let mouseX = W / 2;
let mouseY = H / 2;
let mouseLeftHeld = false;
let mouseRightHeld = false;

// ── Мобильное управление ──────────────────────────────────────────────────────
const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

const mJoy    = { active: false, id: -1, baseX: 0, baseY: 0, dx: 0, dy: 0 };
const mAimJoy = { active: false, id: -1, baseX: 0, baseY: 0, dx: 0, dy: 0 };

const MOB_BTN_R = 36;
let mobBtns = [];

function buildMobBtns() {
  mobBtns = [
    { id: "menu", label: "M", ax: VW - 52, ay: 52, r: MOB_BTN_R },
  ];
}

// Кешируем медиа-запрос — проверяется при каждом тач-событии
const _portraitRotatedMQ = window.matchMedia('(orientation: portrait) and (pointer: coarse)');

function scaledTouch(touch) {
  const rect = canvas.getBoundingClientRect();
  if (_portraitRotatedMQ.matches) {
    const scaleX = canvas.width  / Math.max(1, rect.height);
    const scaleY = canvas.height / Math.max(1, rect.width);
    return {
      x: (touch.clientY - rect.top)   * scaleX,
      y: (rect.right - touch.clientX) * scaleY,
    };
  }
  const scaleX = canvas.width  / Math.max(1, rect.width);
  const scaleY = canvas.height / Math.max(1, rect.height);
  return {
    x: (touch.clientX - rect.left) * scaleX,
    y: (touch.clientY - rect.top)  * scaleY,
  };
}
// ─────────────────────────────────────────────────────────────────────────────

const STATE = {
  CHAR_SELECT: "char_select",
  MENU: "menu",
  PLAYING: "playing",
  WON: "won",
  LOST: "lost",
  CLEARED: "cleared",
};
let state = STATE.CHAR_SELECT;
let menuHoverIdx = -1;
let charHoverIdx = -1;

/** Выбранный персонаж (ключ в CHARACTERS), сохраняется на всю кампанию */
let selectedChar = "specops";

/** Мутируемый объект — обновляется при выборе персонажа в startFromLevel */
const PLAYER = {
  r: 18,
  speed: 265,
  maxHp: 135,
  bulletSpeed: 520,
  bulletDamage: 22,
  color: "#3b82f6",
  emoji: "🪖",
  regenDelay: 2.5,
  regenRate: 9,
};

const CHARACTERS = {
  lumberjack: {
    id: "lumberjack",
    name: "Дровосек",
    emoji: "🪓",
    color: "#84cc16",
    maxHp: 175,
    speed: 270,
    weapon: "axe_lumberjack",
    desc: "175 HP · Топор 50 урона · Быстрый",
    hint: "Топор бьёт сразу несколько врагов в дуге",
  },
  sniper: {
    id: "sniper",
    name: "Снайпер",
    emoji: "🎯",
    color: "#06b6d4",
    maxHp: 125,
    speed: 220,
    weapon: "sniper_rifle",
    desc: "125 HP · 75 урона · 1с кулдаун · Средний",
    hint: "Сверхбыстрая пуля, пробивает одного врага",
  },
  hunter: {
    id: "hunter",
    name: "Охотник",
    emoji: "🏹",
    color: "#f97316",
    maxHp: 150,
    speed: 220,
    weapon: "hunter_sg",
    desc: "150 HP · 3 пели ×20 урона · Средний",
    hint: "2 выстрела подряд, затем 1.5с перезарядка",
  },
  minigunner: {
    id: "minigunner",
    name: "Миниганщик",
    emoji: "🌀",
    color: "#a855f7",
    maxHp: 125,
    speed: 155,
    weapon: "minigun_char",
    desc: "125 HP · 5 урона · 50 пуль, 3с перезарядка",
    hint: "На перезарядке скорость +30%",
  },
  specops: {
    id: "specops",
    name: "Спецназовец",
    emoji: "🪖",
    color: "#3b82f6",
    maxHp: 135,
    speed: 265,
    weapon: "assault",
    desc: "135 HP · 10 урона · 30 пуль, 2с перезарядка",
    hint: "Универсал: высокая скорость и скорострельность",
  },
};

const WEAPONS = {
  // ── Оружия персонажей ────────────────────────────────────────────────────
  axe_lumberjack: {
    fireCd: 0.45, melee: true, meleeRange: 60, meleeArc: 1.3,
    baseDamage: 50, label: "Топор 🪓",
  },
  sniper_rifle: {
    fireCd: 1.0, bullets: 1, spread: 0, baseDamage: 75,
    bulletSpeed: 740, pierceBullet: true, label: "Снайперка 🎯",
  },
  hunter_sg: {
    fireCd: 0.5, bullets: 3, spread: 0.28, baseDamage: 20,
    maxAmmo: 2, reloadTime: 1.5, label: "Дробовик 🏹",
  },
  minigun_char: {
    fireCd: 0.1, bullets: 1, spread: 0.09, baseDamage: 5,
    maxAmmo: 50, reloadTime: 3.0, reloadSpeedBonus: 1.3, label: "Миниган 🌀",
  },
  assault: {
    fireCd: 0.2, bullets: 1, spread: 0.04, baseDamage: 10,
    maxAmmo: 30, reloadTime: 2.0, label: "Автомат 🔫",
  },
  // ── Старые оружия (для совместимости / HUD) ──────────────────────────────
  pistol:  { fireCd: 0.35, bullets: 1, spread: 0,    baseDamage: 22, label: "Пистолет 🔫" },
  shotgun: { fireCd: 0.6,  bullets: 3, spread: 0.3,  baseDamage: 11, label: "Дробовик 💥" },
  axe:     { fireCd: 0.45, melee: true, meleeRange: 58, meleeArc: 1.2, baseDamage: 45, label: "Топор 🪓" },
  minigun: { fireCd: 0.1,  bullets: 1, spread: 0.08, baseDamage: 5,  label: "Миниган 🌀" },
};

const BOT_TYPES = {
  ranger: {
    kind: "ranger", r: 16, speed: 95, maxHp: 60, fireCd: 0.9,
    bulletSpeed: 380, bulletDamage: 12, aggroRange: 440, keepDistance: 220,
    reactTime: 0.45, regenDelay: 3.5, regenRate: 4,
    color: "#ef4444", stroke: "#fca5a5", emoji: "🤖",
  },
  melee: {
    kind: "melee", r: 19, speed: 130, maxHp: 110, attackCd: 0.55,
    attackRange: 6, attackDamage: 22, aggroRange: 520,
    reactTime: 0.3, regenDelay: 3.5, regenRate: 6,
    color: "#a855f7", stroke: "#e9d5ff", emoji: "👹",
  },
  boss: {
    kind: "boss", r: 38, speed: 75, maxHp: 500, attackCd: 1.2,
    attackRange: 12, attackDamage: 60, aggroRange: 1400,
    reactTime: 0.5, regenDelay: 6, regenRate: 5,
    color: "#7c2d12", stroke: "#fbbf24", emoji: "👺", summonEvery: 15,
  },
  mage: {
    kind: "mage", r: 18, speed: 117, maxHp: 270, fireCd: 0.63,
    bulletSpeed: 360, blastRadius: 78, blastDamage: 22,
    aggroRange: 480, keepDistance: 210, reactTime: 0.3,
    regenDelay: 4.5, regenRate: 5.3, summonEvery: 15, summonCount: 3,
    color: "#7c3aed", stroke: "#c4b5fd", emoji: "🧙",
  },
  mage2: {
    kind: "mage", r: 18, speed: 117, maxHp: 270, fireCd: 0.63,
    bulletSpeed: 360, blastRadius: 78, blastDamage: 22,
    aggroRange: 480, keepDistance: 210, reactTime: 0.3,
    regenDelay: 4.5, regenRate: 5.3, summonEvery: 15, summonCount: 2,
    color: "#7c3aed", stroke: "#c4b5fd", emoji: "🧙",
  },
  skeleton: {
    kind: "skeleton", r: 12, speed: 105, maxHp: 25, attackCd: 0.6,
    attackRange: 4, attackDamage: 7, aggroRange: 400,
    reactTime: 0.3, regenDelay: 5, regenRate: 1.5,
    color: "#c8d6e5", stroke: "#64748b", emoji: "💀",
  },
  goblin: {
    kind: "goblin", r: 14, speed: 125, maxHp: 50, attackCd: 0.55,
    attackRange: 5, attackDamage: 15, aggroRange: 460,
    reactTime: 0.3, regenDelay: 4, regenRate: 2,
    color: "#65a30d", stroke: "#a3e635", emoji: "👺",
  },
  ice_mage: {
    kind: "ice_mage", r: 18, speed: 108, maxHp: 150, fireCd: 0.75,
    bulletSpeed: 340, bulletDamage: 25, aggroRange: 480, keepDistance: 200,
    reactTime: 0.35, regenDelay: 4, regenRate: 4,
    color: "#38bdf8", stroke: "#bae6fd", emoji: "❄️",
  },
  ice_golem: {
    kind: "ice_golem", r: 24, speed: 70, maxHp: 300, attackCd: 1.0,
    attackRange: 10, attackDamage: 30, aggroRange: 500,
    reactTime: 0.6, regenDelay: 5, regenRate: 3,
    color: "#7dd3fc", stroke: "#0ea5e9", emoji: "🗿",
  },
  ice_king: {
    kind: "ice_king", r: 42, speed: 80, maxHp: 2500, attackCd: 0.8,
    attackRange: 14, attackDamage: 100, fireCd: 1.5,
    bulletSpeed: 380, rangedDamage: 50, aggroRange: 1800,
    reactTime: 0.35, regenDelay: 7, regenRate: 5,
    color: "#0284c7", stroke: "#38bdf8", emoji: "👑",
  },
};

const DOG = {
  r: 13, speed: 180, maxHp: 75, damage: 10, attackCd: 0.8,
  attackRange: 4, aggroRange: 280, stunOnHit: 1.5, emoji: "🐶",
};

const UPGRADES = {
  bonus_hp:  { id: "bonus_hp",  title: "❤️ +10% HP",   desc: "+10% макс. HP и восстанавливает столько же" },
  bonus_dmg: { id: "bonus_dmg", title: "⚔️ +10% урон", desc: "Урон оружия постоянно увеличивается на 10%" },
};

const LEVELS = [
  {
    name: "1 — Разминка",
    desc: "2 стрелка · 1 ближник",
    emoji: "🎯",
    w: 960, h: 540,
    walls: [
      { x: 180, y: 120, w: 120, h: 24 }, { x: 660, y: 120, w: 120, h: 24 },
      { x: 420, y: 240, w: 120, h: 24 }, { x: 200, y: 380, w: 160, h: 24 },
      { x: 600, y: 380, w: 160, h: 24 },
    ],
    bots: [
      { rx: 0.2, ry: 0.18, kind: "ranger" },
      { rx: 0.8, ry: 0.18, kind: "ranger" },
      { rx: 0.5, ry: 0.1,  kind: "melee"  },
    ],
    spawn: { rx: 0.5, ry: 0.82 },
    drops: false,
  },
  {
    name: "2 — Коридоры",
    desc: "2 стрелка · 2 ближника",
    emoji: "🏛️",
    w: 960, h: 540,
    walls: [
      { x: 120, y: 80,  w: 24, h: 200 }, { x: 816, y: 80,  w: 24, h: 200 },
      { x: 120, y: 360, w: 24, h: 120 }, { x: 816, y: 360, w: 24, h: 120 },
      { x: 300, y: 200, w: 360, h: 24 }, { x: 300, y: 320, w: 360, h: 24 },
      { x: 460, y: 80,  w: 40, h: 90  }, { x: 460, y: 370, w: 40, h: 90  },
    ],
    bots: [
      { rx: 0.2, ry: 0.15, kind: "ranger" },
      { rx: 0.8, ry: 0.15, kind: "ranger" },
      { rx: 0.2, ry: 0.82, kind: "melee"  },
      { rx: 0.8, ry: 0.82, kind: "melee"  },
    ],
    spawn: { rx: 0.5, ry: 0.5 },
    drops: true,
  },
  {
    name: "3 — Пилоны",
    desc: "3 стрелка · 2 ближника",
    emoji: "🗿",
    w: 960, h: 540,
    walls: [
      { x: 240, y: 120, w: 48, h: 48 }, { x: 672, y: 120, w: 48, h: 48 },
      { x: 240, y: 372, w: 48, h: 48 }, { x: 672, y: 372, w: 48, h: 48 },
      { x: 456, y: 120, w: 48, h: 48 }, { x: 456, y: 372, w: 48, h: 48 },
      { x: 344, y: 244, w: 272, h: 52 },
    ],
    bots: [
      { rx: 0.15, ry: 0.25, kind: "ranger" },
      { rx: 0.85, ry: 0.25, kind: "ranger" },
      { rx: 0.15, ry: 0.75, kind: "ranger" },
      { rx: 0.5,  ry: 0.1,  kind: "melee"  },
      { rx: 0.5,  ry: 0.9,  kind: "melee"  },
    ],
    spawn: { rx: 0.5, ry: 0.5 },
    drops: true,
  },
  {
    name: "4 — Лабиринт",
    desc: "3 стрелка · 3 ближника",
    emoji: "🌀",
    w: 1200, h: 720,
    walls: [
      { x: 100, y: 100, w: 320, h: 24 }, { x: 780, y: 100, w: 320, h: 24 },
      { x: 100, y: 596, w: 320, h: 24 }, { x: 780, y: 596, w: 320, h: 24 },
      { x: 560, y: 200, w: 80,  h: 120 }, { x: 560, y: 400, w: 80,  h: 120 },
      { x: 360, y: 340, w: 160, h: 40  }, { x: 680, y: 340, w: 160, h: 40  },
      { x: 200, y: 260, w: 60,  h: 200 }, { x: 940, y: 260, w: 60,  h: 200 },
      { x: 400, y: 150, w: 24,  h: 120 }, { x: 776, y: 150, w: 24,  h: 120 },
      { x: 400, y: 450, w: 24,  h: 120 }, { x: 776, y: 450, w: 24,  h: 120 },
    ],
    bots: [
      { rx: 0.12, ry: 0.15, kind: "ranger" },
      { rx: 0.88, ry: 0.15, kind: "ranger" },
      { rx: 0.12, ry: 0.85, kind: "ranger" },
      { rx: 0.88, ry: 0.85, kind: "ranger" },
      { rx: 0.3,  ry: 0.5,  kind: "melee"  },
      { rx: 0.7,  ry: 0.5,  kind: "melee"  },
    ],
    spawn: { rx: 0.5, ry: 0.5 },
    drops: true,
  },
  {
    name: "5 — Босс",
    desc: "Могучий босс + призыватель",
    emoji: "💀",
    w: 1280, h: 720,
    walls: [
      { x: 260, y: 200, w: 110, h: 24 }, { x: 910, y: 200, w: 110, h: 24 },
      { x: 260, y: 496, w: 110, h: 24 }, { x: 910, y: 496, w: 110, h: 24 },
      { x: 580, y: 120, w: 120, h: 28 }, { x: 580, y: 572, w: 120, h: 28 },
      { x: 120, y: 340, w: 40,  h: 40  }, { x: 1120, y: 340, w: 40, h: 40  },
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
    w: 1100, h: 640,
    walls: [
      { x: 80,  y: 120, w: 200, h: 22 }, { x: 820, y: 120, w: 200, h: 22 },
      { x: 80,  y: 498, w: 200, h: 22 }, { x: 820, y: 498, w: 200, h: 22 },
      { x: 480, y: 60,  w: 140, h: 28 }, { x: 480, y: 552, w: 140, h: 28 },
      { x: 180, y: 300, w: 22,  h: 120 }, { x: 898, y: 300, w: 22, h: 120 },
    ],
    bots: [
      { rx: 0.5,  ry: 0.38, kind: "mage"   },
      { rx: 0.12, ry: 0.5,  kind: "ranger" },
      { rx: 0.88, ry: 0.5,  kind: "ranger" },
    ],
    spawn: { rx: 0.5, ry: 0.88 },
    drops: true,
  },
  // ── Новые уровни ─────────────────────────────────────────────────────────
  {
    name: "7 — Хижина гоблинов",
    desc: "5 ближников + волны гоблинов",
    emoji: "🏚️",
    w: 1100, h: 640,
    walls: [
      { x: 160, y: 160, w: 200, h: 22 }, { x: 160, y: 160, w: 22, h: 180 },
      { x: 338, y: 160, w: 22,  h: 120 }, { x: 160, y: 340, w: 200, h: 22 },
      { x: 700, y: 200, w: 180, h: 22 }, { x: 858, y: 200, w: 22,  h: 200 },
      { x: 700, y: 400, w: 180, h: 22 }, { x: 400, y: 80,  w: 100, h: 18 },
      { x: 580, y: 540, w: 100, h: 18 }, { x: 510, y: 280, w: 80,  h: 18 },
    ],
    bots: [
      { rx: 0.1,  ry: 0.2,  kind: "melee" },
      { rx: 0.9,  ry: 0.2,  kind: "melee" },
      { rx: 0.1,  ry: 0.8,  kind: "melee" },
      { rx: 0.9,  ry: 0.8,  kind: "melee" },
      { rx: 0.5,  ry: 0.45, kind: "melee" },
    ],
    waves: [
      { kind: "goblin", every: 3, count: 1, totalCount: 15,
        spawnZones: [
          { x: 60,  y: 60,  w: 280, h: 280 },
          { x: 660, y: 60,  w: 280, h: 280 },
          { x: 60,  y: 560, w: 280, h: 280 },
          { x: 660, y: 560, w: 280, h: 280 },
        ]
      },
    ],
    spawn: { rx: 0.5, ry: 0.88 },
    drops: true,
  },
  {
    name: "8 — Маги и гоблины",
    desc: "3 мага (2 скелета) + 8 гоблинов",
    emoji: "🧙",
    w: 1100, h: 640,
    walls: [
      { x: 100, y: 100, w: 200, h: 24 }, { x: 800, y: 100, w: 200, h: 24 },
      { x: 100, y: 516, w: 200, h: 24 }, { x: 800, y: 516, w: 200, h: 24 },
      { x: 470, y: 160, w: 160, h: 24 }, { x: 470, y: 456, w: 160, h: 24 },
      { x: 290, y: 290, w: 24,  h: 120 }, { x: 786, y: 290, w: 24, h: 120 },
      { x: 525, y: 295, w: 50,  h: 50  },
    ],
    bots: [
      { rx: 0.2,  ry: 0.25, kind: "mage2"  },
      { rx: 0.8,  ry: 0.25, kind: "mage2"  },
      { rx: 0.5,  ry: 0.15, kind: "mage2"  },
      { rx: 0.15, ry: 0.6,  kind: "goblin" },
      { rx: 0.3,  ry: 0.75, kind: "goblin" },
      { rx: 0.5,  ry: 0.65, kind: "goblin" },
      { rx: 0.7,  ry: 0.75, kind: "goblin" },
      { rx: 0.85, ry: 0.6,  kind: "goblin" },
      { rx: 0.25, ry: 0.45, kind: "goblin" },
      { rx: 0.75, ry: 0.45, kind: "goblin" },
      { rx: 0.5,  ry: 0.85, kind: "goblin" },
    ],
    spawn: { rx: 0.5, ry: 0.95 },
    drops: true,
  },
  {
    name: "9 — Вход в крепость",
    desc: "2 мага + 1 ледяной маг + 3 ближника + волны гоблинов",
    emoji: "🏰",
    w: 1400, h: 800,
    walls: [
      { x: 80,   y: 120, w: 320, h: 28 }, { x: 80,   y: 120, w: 28, h: 280 },
      { x: 80,   y: 400, w: 200, h: 28 }, { x: 1000, y: 120, w: 320, h: 28 },
      { x: 1292, y: 120, w: 28,  h: 280 }, { x: 1120, y: 400, w: 200, h: 28 },
      { x: 580,  y: 60,  w: 80,  h: 160 }, { x: 740,  y: 60,  w: 80, h: 160 },
      { x: 340,  y: 360, w: 60,  h: 60  }, { x: 1000, y: 360, w: 60, h: 60  },
      { x: 640,  y: 420, w: 120, h: 24  }, { x: 280,  y: 560, w: 160, h: 24 },
      { x: 960,  y: 560, w: 160, h: 24  },
    ],
    bots: [
      { rx: 0.25, ry: 0.25, kind: "mage"     },
      { rx: 0.75, ry: 0.25, kind: "mage"     },
      { rx: 0.5,  ry: 0.15, kind: "ice_mage" },
      { rx: 0.2,  ry: 0.7,  kind: "melee"    },
      { rx: 0.5,  ry: 0.65, kind: "melee"    },
      { rx: 0.8,  ry: 0.7,  kind: "melee"    },
    ],
    waves: [
      { kind: "goblin", every: 10, count: 4, totalCount: 24,
        spawnZones: [
          { x: 50,   y: 50,  w: 200, h: 600 },
          { x: 1150, y: 50,  w: 200, h: 600 },
          { x: 400,  y: 50,  w: 600, h: 120 },
        ]
      },
    ],
    spawn: { rx: 0.5, ry: 0.9 },
    drops: true,
  },
  {
    name: "10 — Безумие Ice King",
    desc: "Босс Ice King + ледяные призывы",
    emoji: "👑",
    w: 1400, h: 800,
    walls: [
      { x: 180,  y: 180, w: 90, h: 90 }, { x: 1130, y: 180, w: 90, h: 90 },
      { x: 180,  y: 530, w: 90, h: 90 }, { x: 1130, y: 530, w: 90, h: 90 },
      { x: 590,  y: 100, w: 220, h: 28 }, { x: 590,  y: 672, w: 220, h: 28 },
      { x: 100,  y: 355, w: 28,  h: 90 }, { x: 1272, y: 355, w: 28, h: 90 },
      { x: 430,  y: 330, w: 60,  h: 60 }, { x: 910,  y: 330, w: 60, h: 60 },
      { x: 650,  y: 350, w: 100, h: 100 },
    ],
    bots: [
      { rx: 0.5,  ry: 0.22, kind: "ice_king"  },
      { rx: 0.35, ry: 0.35, kind: "ice_golem" },
      { rx: 0.65, ry: 0.35, kind: "ice_golem" },
    ],
    waves: [
      { kind: "ice_golem", every: 20, count: 2, stopWhenNoKind: "ice_king" },
      { kind: "ice_mage",  every: 15, count: 1, stopWhenNoKind: "ice_king" },
      { kind: "melee",     every: 45, count: 3, stopWhenNoKind: "ice_king" },
      { kind: "ranger",    every: 45, count: 3, stopWhenNoKind: "ice_king" },
    ],
    spawn: { rx: 0.5, ry: 0.88 },
    drops: true,
    boss: true,
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
let wonCountdown = 0;
let levelWaveTimers = [];

let hudOverlayBossT = 0;
let hudOverlayMageT = 0;
let hudHasBoss = false;
let hudHasMage = false;
let hudHasIceKing = false;
let hudIceKingHp = 0;

// ── Физические хелперы ────────────────────────────────────────────────────────
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
  canvas.width = VW; canvas.height = VH;
  W = VW; H = VH; camX = 0; camY = 0;
  if (isMobile) buildMobBtns();
}

function showCharSelect() {
  state = STATE.CHAR_SELECT;
  canvas.width = VW; canvas.height = VH;
  W = VW; H = VH; camX = 0; camY = 0;
  menuHoverIdx = -1; charHoverIdx = -1;
}

function newGame() {
  showCharSelect();
}

function startFromLevel(idx) {
  currentLevel = idx;
  const ch = CHARACTERS[selectedChar] || CHARACTERS.specops;
  PLAYER.speed    = ch.speed;
  PLAYER.maxHp    = ch.maxHp;
  PLAYER.emoji    = ch.emoji;
  PLAYER.color    = ch.color;

  player = {
    x: 0, y: 0,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    damageBonus: 0,
    damageMul: 1.0,
    cd: 0,
    sinceHit: 999,
    hitFlash: 0,
    weapon: ch.weapon,
    ammo: null,
    maxAmmo: null,
    reloading: false,
    reloadTimer: 0,
    slowLeft: 0,
  };
  dog = null;
  loadLevel(idx);
}

function buildBackground(w, h, levelWalls) {
  const oc = document.createElement("canvas");
  oc.width = w; oc.height = h;
  const oc2 = oc.getContext("2d");
  const TILE = 40;
  for (let ty = 0; ty < h; ty += TILE) {
    for (let tx = 0; tx < w; tx += TILE) {
      const even = ((tx / TILE + ty / TILE) & 1) === 0;
      oc2.fillStyle = even ? "#1a2536" : "#1e2b3e";
      oc2.fillRect(tx, ty, TILE, TILE);
      oc2.strokeStyle = "rgba(0,0,0,0.25)";
      oc2.lineWidth = 1;
      oc2.strokeRect(tx + 0.5, ty + 0.5, TILE - 1, TILE - 1);
    }
  }
  for (const wall of levelWalls) {
    const { x, y, w: ww, h: wh } = wall;
    oc2.fillStyle = "#3d3224"; oc2.fillRect(x, y, ww, wh);
    const BRICK_W = 24, BRICK_H = 12;
    for (let row = 0; row * BRICK_H < wh; row++) {
      const offset = (row & 1) === 0 ? 0 : BRICK_W / 2;
      for (let col = -1; col * BRICK_W < ww + BRICK_W; col++) {
        const bx = x + col * BRICK_W + offset;
        const by = y + row * BRICK_H;
        const bw = Math.min(BRICK_W - 2, x + ww - bx - 1);
        const bh = Math.min(BRICK_H - 2, y + wh - by - 1);
        if (bw <= 0 || bh <= 0) continue;
        oc2.fillStyle = "#5c4733"; oc2.fillRect(bx + 1, by + 1, bw, bh);
        oc2.fillStyle = "rgba(255,220,160,0.12)";
        oc2.fillRect(bx + 1, by + 1, bw, 2);
        oc2.fillRect(bx + 1, by + 1, 2, bh);
      }
    }
    oc2.strokeStyle = "#7c5c3a"; oc2.lineWidth = 2;
    oc2.strokeRect(x + 1, y + 1, ww - 2, wh - 2);
  }
  return oc;
}

function loadLevel(idx) {
  currentLevel = idx;
  state = STATE.PLAYING;
  time = 0;
  bullets = []; pickups = []; slashes = []; particles = []; floaters = [];
  hurtFlash = 0; bossSummonTimer = 0; wonCountdown = 0;

  const L = LEVELS[idx];
  canvas.width = VW; canvas.height = VH;
  W = L.w; H = L.h; camX = 0; camY = 0;

  walls = L.walls.map((w) => ({ ...w }));
  bgCanvas = buildBackground(W, H, walls);
  if (isMobile) buildMobBtns();

  // Init wave timers
  levelWaveTimers = (L.waves || []).map(w => ({
    ...w, timer: w.every, spawned: 0,
  }));

  player.x = L.spawn.rx * W;
  player.y = L.spawn.ry * H;
  player.cd = 0;
  player.sinceHit = 999;
  player.hitFlash = 0;
  player.slowLeft = 0;
  player.hp = Math.min(player.maxHp, player.hp + 40);

  // Reset ammo for the weapon
  const wp = WEAPONS[player.weapon];
  player.ammo = wp?.maxAmmo ?? null;
  player.reloading = false;
  player.reloadTimer = 0;

  bots = L.bots.map((b) => makeBot(b.rx * W, b.ry * H, b.kind));

  // Dog is always present
  if (!dog || dog.hp <= 0) dog = makeDog();
  dog.maxHp = DOG.maxHp;
  dog.x = player.x - 30;
  dog.y = player.y + 30;
  dog.hp = Math.min(dog.maxHp, (dog.hp || 0) + 25);
  dog.cd = 0; dog.sinceHit = 999; dog.hitFlash = 0;
  resolveWalls(dog, DOG.r);

  resolveWalls(player, PLAYER.r);
  for (const b of bots) resolveWalls(b, b.type.r);

  elState.textContent = "";
  updateHud();
}

function makeBot(x, y, kind) {
  const t = BOT_TYPES[kind];
  const b = {
    x, y,
    hp: t.maxHp,
    cd: 0.6 + Math.random() * 0.4,
    reactLeft: t.reactTime,
    sinceHit: 999,
    hitFlash: 0,
    stunLeft: 0,
    type: t,
    losCd: Math.random() * 0.12,
    seesPlayerC: false,
    seesDogC: false,
    distToDogC: Infinity,
    steerCd: Math.random() * 0.07,
    steerAngle: 0,
    resurrected: false,
  };
  if (t.kind === "mage") b.summonTimer = 0;
  if (t.kind === "ice_king") { b.golemTimer = 0; b.mageTimer = 0; b.rangedCd = 1.5; }
  return b;
}

function makeDog() {
  return {
    x: 0, y: 0,
    hp: DOG.maxHp, maxHp: DOG.maxHp,
    cd: 0, sinceHit: 999, hitFlash: 0,
    steerCd: 0, steerAngle: 0,
  };
}

function updateHud() {
  const lvlLabel = LEVELS[currentLevel]?.name ?? "?";
  const wp = WEAPONS[player.weapon];
  let ammoStr = "";
  if (wp?.maxAmmo !== undefined) {
    ammoStr = player.reloading
      ? " · ⟳"
      : ` · [${player.ammo}/${wp.maxAmmo}]`;
  }
  const dogTxt = dog && dog.hp > 0 ? ` · 🐶 ${Math.ceil(dog.hp)}` : "";
  const hpLine = `HP: ${Math.max(0, Math.ceil(player.hp))}/${player.maxHp} · ${wp?.label ?? "?"} ${ammoStr} · Ур. ${lvlLabel}${dogTxt}`;
  if (elHp.textContent !== hpLine) elHp.textContent = hpLine;
  const alive = bots.filter((b) => b.hp > 0).length;
  const botLine = `Боты: ${alive}`;
  if (elBots.textContent !== botLine) elBots.textContent = botLine;
  let st = "";
  if (state === STATE.WON) st = "Уровень пройден — 1 или 2 для улучшения";
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
      if (r) { ent.x += r.px; ent.y += r.py; any = true; }
    }
    if (!any) break;
  }
}

function moveEntity(ent, dx, dy, radius) {
  ent.x += dx; resolveWalls(ent, radius);
  ent.y += dy; resolveWalls(ent, radius);
  ent.x = Math.max(radius, Math.min(W - radius, ent.x));
  ent.y = Math.max(radius, Math.min(H - radius, ent.y));
}

function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function dist2(ax, ay, bx, by) { const dx = bx-ax, dy = by-ay; return dx*dx+dy*dy; }

function lineHitsWall(x0, y0, x1, y1, pad = 0) {
  for (const w of walls) {
    if (segmentRectIntersect(x0, y0, x1, y1, w.x - pad, w.y - pad, w.w + pad*2, w.h + pad*2))
      return true;
  }
  return false;
}

function segmentRectIntersect(x0, y0, x1, y1, rx, ry, rw, rh) {
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - rx, rx + rw - x0, y0 - ry, ry + rh - y0];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}

const STEER_OFFSETS = [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 1.9, -1.9, Math.PI * 0.65, -Math.PI * 0.65];

function steerAround(ent, radius, targetAngle) {
  const look = radius * 2.4;
  for (let i = 0; i < STEER_OFFSETS.length; i++) {
    const a = targetAngle + STEER_OFFSETS[i];
    const nx = ent.x + Math.cos(a) * look;
    const ny = ent.y + Math.sin(a) * look;
    if (nx < radius || nx > W - radius || ny < radius || ny > H - radius) continue;
    if (!lineHitsWall(ent.x, ent.y, nx, ny, radius * 0.6)) return a;
  }
  return targetAngle + Math.PI + (Math.random() - 0.5) * 1.2;
}

const MELEE_DOG_MISS = 0.3;

function botThink(b, dt) {
  const t = b.type;
  if (b.stunLeft > 0) { b.stunLeft -= dt; return; }

  const d = dist(b.x, b.y, player.x, player.y);
  const angToPlayer = Math.atan2(player.y - b.y, player.x - b.x);

  b.losCd -= dt;
  if (b.losCd <= 0) {
    b.losCd = 0.10 + Math.random() * 0.04;
    b.seesPlayerC = d < t.aggroRange && !lineHitsWall(b.x, b.y, player.x, player.y);
    if (dog && dog.hp > 0) {
      const dDog = dist(b.x, b.y, dog.x, dog.y);
      b.distToDogC = dDog;
      b.seesDogC = dDog < t.aggroRange && !lineHitsWall(b.x, b.y, dog.x, dog.y);
    } else { b.distToDogC = Infinity; b.seesDogC = false; }
  }

  const seesP = b.seesPlayerC;
  b.cd -= dt;

  // ── Ice King ─────────────────────────────────────────────────────────────
  if (t.kind === "ice_king") {
    b.golemTimer += dt;
    b.mageTimer  += dt;
    b.rangedCd   -= dt;
    if (b.golemTimer >= 20) { b.golemTimer = 0; iceKingSummonGolems(b); }
    if (b.mageTimer  >= 15) { b.mageTimer  = 0; iceKingSummonMage(b);   }

    if (seesP) b.reactLeft -= dt; else b.reactLeft = t.reactTime;

    b.steerCd -= dt;
    if (b.steerCd <= 0) {
      b.steerAngle = steerAround(b, t.r, angToPlayer);
      b.steerCd = 0.07 + Math.random() * 0.04;
    }
    const meleeRange = t.r + PLAYER.r + t.attackRange;
    if (d > meleeRange - 5 && seesP) {
      moveEntity(b, Math.cos(b.steerAngle) * t.speed * dt, Math.sin(b.steerAngle) * t.speed * dt, t.r);
    }
    if (b.reactLeft <= 0 && seesP) {
      if (d <= meleeRange && b.cd <= 0) {
        damagePlayer(t.attackDamage);
        b.cd = t.attackCd;
        spawnSlash(b.x, b.y, angToPlayer, 64);
      }
      if (d > meleeRange && b.rangedCd <= 0) {
        b.rangedCd = t.fireCd;
        const muzzle = t.r + 8;
        bullets.push({
          x: b.x + Math.cos(angToPlayer) * muzzle,
          y: b.y + Math.sin(angToPlayer) * muzzle,
          vx: Math.cos(angToPlayer) * t.bulletSpeed,
          vy: Math.sin(angToPlayer) * t.bulletSpeed,
          owner: "bot", damage: t.rangedDamage, r: 9, life: 1.8, iceBullet: true,
        });
      }
    }
    return;
  }

  // ── Ranged: ranger / mage / ice_mage ─────────────────────────────────────
  if (t.kind === "ranger" || t.kind === "mage" || t.kind === "ice_mage") {
    const hasTarget = seesP || b.seesDogC;
    if (hasTarget) b.reactLeft -= dt; else b.reactLeft = t.reactTime;

    if (t.kind === "mage") {
      b.summonTimer += dt;
      if (b.summonTimer >= t.summonEvery) { b.summonTimer = 0; mageSummonSkeletons(b); }
    }

    let moveAngle = angToPlayer, moveScale = 1;
    const rangerRetreating = t.kind !== "skeleton" && b.hp < t.maxHp * 0.5;
    if (rangerRetreating && seesP && d < t.keepDistance + 120) {
      moveAngle = angToPlayer + Math.PI; moveScale = 0.7;
    } else if (seesP && d < t.keepDistance) {
      moveAngle = angToPlayer + Math.PI; moveScale = t.kind === "mage" ? 0.88 : 0.9;
    } else if (seesP && d < t.keepDistance + 40) {
      moveScale = 0;
    }

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
      else if (t.kind === "ice_mage") tryFire(b, ang, t, "bot", 0, { slow: true, slowDuration: 2, iceBullet: true });
      else tryFire(b, ang, t, "bot");
    }
    return;
  }

  // ── Melee: melee / boss / skeleton / goblin / ice_golem ──────────────────
  const seesDog = b.seesDogC;
  const dD = b.distToDogC;
  if (seesP || seesDog) b.reactLeft -= dt; else b.reactLeft = t.reactTime;

  const retreating = t.kind !== "skeleton" && t.kind !== "goblin" && b.hp < t.maxHp * 0.5;
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
    const slashR = t.kind === "boss" ? 48 : 28;
    if (inP && inD) {
      if (d <= dD) {
        damagePlayer(t.attackDamage); b.cd = t.attackCd;
        spawnSlash(b.x, b.y, angToPlayer, slashR);
      } else {
        const angToDog = Math.atan2(dog.y - b.y, dog.x - b.x);
        b.cd = t.attackCd;
        if (Math.random() >= MELEE_DOG_MISS) damageDog(t.attackDamage);
        else spawnFloater(b.x, b.y - t.r, "Промах", "#9ca3af");
        spawnSlash(b.x, b.y, angToDog, slashR);
      }
    } else if (inP) {
      damagePlayer(t.attackDamage); b.cd = t.attackCd;
      spawnSlash(b.x, b.y, angToPlayer, slashR);
    } else if (inD) {
      const angToDog = Math.atan2(dog.y - b.y, dog.x - b.x);
      b.cd = t.attackCd;
      if (Math.random() >= MELEE_DOG_MISS) damageDog(t.attackDamage);
      else spawnFloater(b.x, b.y - t.r, "Промах", "#9ca3af");
      spawnSlash(b.x, b.y, angToDog, slashR);
    }
  }
}

function dogThink(dt) {
  if (!dog || dog.hp <= 0) return;
  dog.cd -= dt;
  let target = null, bestD = DOG.aggroRange;
  for (const b of bots) {
    if (b.hp <= 0) continue;
    const d = dist(dog.x, dog.y, b.x, b.y);
    if (d < bestD && !lineHitsWall(dog.x, dog.y, b.x, b.y)) { bestD = d; target = b; }
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
      if (Math.random() < 0.1) { dog.hp = dog.maxHp; spawnFloater(dog.x, dog.y - DOG.r * 2, "Полное HP!", "#4ade80"); }
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

function tryFire(from, angle, cfg, owner, extraDamage = 0, bulletExtra = null) {
  if (from.cd > 0) return;
  from.cd = cfg.fireCd;
  const muzzle = cfg.r + 6;
  const b = {
    x: from.x + Math.cos(angle) * muzzle,
    y: from.y + Math.sin(angle) * muzzle,
    vx: Math.cos(angle) * cfg.bulletSpeed,
    vy: Math.sin(angle) * cfg.bulletSpeed,
    owner,
    damage: (cfg.bulletDamage ?? 14) + extraDamage,
    r: cfg.kind === "boss" ? 8 : 5,
    life: 1.4,
  };
  if (bulletExtra) Object.assign(b, bulletExtra);
  bullets.push(b);
}

function tryMageBlast(from, angle, cfg) {
  if (from.cd > 0) return;
  from.cd = cfg.fireCd;
  const muzzle = cfg.r + 8;
  bullets.push({
    x: from.x + Math.cos(angle) * muzzle,
    y: from.y + Math.sin(angle) * muzzle,
    vx: Math.cos(angle) * cfg.bulletSpeed,
    vy: Math.sin(angle) * cfg.bulletSpeed,
    owner: "bot", r: 7, life: 2.2,
    magicBlast: true, blastRadius: cfg.blastRadius, blastDamage: cfg.blastDamage,
  });
}

function detonateMageBlast(bx, by, R, damage) {
  const pr = R + PLAYER.r;
  if (dist2(bx, by, player.x, player.y) < pr * pr) damagePlayer(damage);
  if (dog && dog.hp > 0) {
    const dr = R + DOG.r;
    if (dist2(bx, by, dog.x, dog.y) < dr * dr) damageDog(damage);
  }
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI * 2 * i) / 4;
    particles.push({
      x: bx + Math.cos(a) * R * 0.5, y: by + Math.sin(a) * R * 0.5,
      vx: Math.cos(a) * 90, vy: Math.sin(a) * 90,
      life: 0.35, total: 0.35, color: "#a78bfa", r: 2.5,
    });
  }
  spawnImpact(bx, by, "#8b5cf6");
}

function mageSummonSkeletons(mage) {
  const count = mage.type.summonCount ?? 3;
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
    const distOff = 44 + Math.random() * 18;
    let nx = Math.max(mage.type.r + 8, Math.min(W - mage.type.r - 8, mage.x + Math.cos(a) * distOff));
    let ny = Math.max(mage.type.r + 8, Math.min(H - mage.type.r - 8, mage.y + Math.sin(a) * distOff));
    const sk = makeBot(nx, ny, "skeleton");
    resolveWalls(sk, sk.type.r);
    bots.push(sk);
  }
  spawnFloater(mage.x, mage.y - mage.type.r - 18, "Скелеты!", "#c4b5fd");
}

function iceKingSummonGolems(ik) {
  const spots = [
    { x: ik.x - 120, y: ik.y - 80  },
    { x: ik.x + 120, y: ik.y - 80  },
    { x: ik.x,       y: ik.y + 120 },
  ];
  for (const sp of spots) {
    const gx = Math.max(40, Math.min(W - 40, sp.x));
    const gy = Math.max(40, Math.min(H - 40, sp.y));
    const g = makeBot(gx, gy, "ice_golem");
    resolveWalls(g, g.type.r);
    bots.push(g);
  }
  spawnFloater(ik.x, ik.y - ik.type.r - 20, "Ледяные Големы!", "#7dd3fc");
}

function iceKingSummonMage(ik) {
  const a = Math.random() * Math.PI * 2;
  const off = 100 + Math.random() * 60;
  const mx = Math.max(30, Math.min(W - 30, ik.x + Math.cos(a) * off));
  const my = Math.max(30, Math.min(H - 30, ik.y + Math.sin(a) * off));
  const im = makeBot(mx, my, "ice_mage");
  resolveWalls(im, im.type.r);
  bots.push(im);
  spawnFloater(ik.x, ik.y - ik.type.r - 20, "Ледяной Маг!", "#38bdf8");
}

function spawnWaveBots(kind, count, spawnZones) {
  for (let i = 0; i < count; i++) {
    let sx = 0, sy = 0;
    if (spawnZones && spawnZones.length > 0) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const zone = spawnZones[Math.floor(Math.random() * spawnZones.length)];
        sx = zone.x + Math.random() * zone.w;
        sy = zone.y + Math.random() * zone.h;
        sx = Math.max(20, Math.min(W - 20, sx));
        sy = Math.max(20, Math.min(H - 20, sy));
        if (Math.hypot(sx - player.x, sy - player.y) > 150) break;
      }
    } else {
      for (let attempt = 0; attempt < 25; attempt++) {
        sx = Math.random() * (W - 100) + 50;
        sy = Math.random() * (H - 100) + 50;
        const cx = W / 2, cy = H / 2;
        if (Math.hypot(sx - cx, sy - cy) > Math.min(W, H) * 0.28 &&
            Math.hypot(sx - player.x, sy - player.y) > 220) break;
      }
    }
    const b = makeBot(sx, sy, kind);
    resolveWalls(b, b.type.r);
    bots.push(b);
  }
  const t = BOT_TYPES[kind];
  spawnFloater(W / 2, H * 0.12, `${t.emoji} Враги появляются!`, "#fbbf24");
}

function allWavesDone() {
  for (const w of levelWaveTimers) {
    const hasLimit = w.totalCount !== undefined;
    const notSpawnedAll = hasLimit && w.spawned < w.totalCount;
    const targetAlive = w.stopWhenNoKind && bots.some(b => b.type.kind === w.stopWhenNoKind && b.hp > 0);
    if (notSpawnedAll && !targetAlive) return false;
    if (!hasLimit && targetAlive) return false;
  }
  return true;
}

function playerAttack(angle) {
  const wp = WEAPONS[player.weapon];
  if (!wp || player.reloading || player.cd > 0) return;
  player.cd = wp.fireCd;

  const mul = player.damageMul || 1;
  const baseDmg = wp.melee
    ? ((wp.baseDamage || 50) + player.damageBonus) * mul
    : ((wp.baseDamage || 22) + player.damageBonus * 0.5) * mul;

  if (wp.melee) {
    slashes.push({ x: player.x, y: player.y, ang: angle, life: 0.2, r: wp.meleeRange });
    for (const b of bots) {
      if (b.hp <= 0) continue;
      const d = dist(player.x, player.y, b.x, b.y);
      if (d > wp.meleeRange + b.type.r) continue;
      const a = Math.atan2(b.y - player.y, b.x - player.x);
      let da = Math.abs(a - angle);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da <= wp.meleeArc / 2 && !lineHitsWall(player.x, player.y, b.x, b.y)) damageBot(b, baseDmg);
    }
    return;
  }

  const bSpeed = wp.bulletSpeed ?? PLAYER.bulletSpeed;
  const muzzle = PLAYER.r + 6;
  const numBullets = wp.bullets || 1;
  for (let i = 0; i < numBullets; i++) {
    const spread = numBullets > 1 ? (i / (numBullets - 1) - 0.5) * (wp.spread || 0) : 0;
    const rnd = wp.spread ? (Math.random() - 0.5) * (wp.spread || 0) * 0.25 : 0;
    const a = angle + spread + rnd;
    bullets.push({
      x: player.x + Math.cos(a) * muzzle,
      y: player.y + Math.sin(a) * muzzle,
      vx: Math.cos(a) * bSpeed,
      vy: Math.sin(a) * bSpeed,
      owner: "player", damage: baseDmg, r: 5, life: 1.2,
      pierce: wp.pierceBullet || false,
    });
  }

  if (wp.maxAmmo !== undefined) {
    player.ammo = Math.max(0, player.ammo - 1);
    if (player.ammo <= 0) {
      player.reloading = true;
      player.reloadTimer = wp.reloadTime || 2.0;
    }
  }
}

function damagePlayer(amount) {
  player.hp -= amount;
  player.sinceHit = 0; player.hitFlash = 0.18;
  hurtFlash = Math.max(hurtFlash, 0.4);
  spawnImpact(player.x, player.y, "#f87171");
  spawnFloater(player.x, player.y - PLAYER.r, `-${Math.ceil(amount)}`, "#f87171");
}

function damageDog(amount) {
  if (!dog || dog.hp <= 0) return;
  dog.hp -= amount; dog.sinceHit = 0; dog.hitFlash = 0.18;
  spawnImpact(dog.x, dog.y, "#fbbf24");
  spawnFloater(dog.x, dog.y - DOG.r, `-${Math.ceil(amount)}`, "#fbbf24");
}

function damageBot(b, amount) {
  b.hp -= amount; b.sinceHit = 0; b.hitFlash = 0.15;
  spawnImpact(b.x, b.y, "#fde047");
  spawnFloater(b.x, b.y - b.type.r, `-${Math.ceil(amount)}`, "#fde047");
  // Ice golem и skeleton дропают пикап позже (в цикле очистки)
  if (b.hp <= 0 && b.type.kind !== "skeleton" && b.type.kind !== "ice_golem") {
    maybeDropPickup(b.x, b.y);
  }
}

function spawnSlash(x, y, ang, r = 28) { slashes.push({ x, y, ang, life: 0.18, r }); }

const MAX_PARTICLES = 80, MAX_FLOATERS = 40, MAX_BULLETS = 80;

function spawnImpact(x, y, color) {
  for (let i = 0; i < 3; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 120;
    particles.push({ x, y, vx: Math.cos(ang)*sp, vy: Math.sin(ang)*sp, life: 0.35, total: 0.35, color, r: 2 + Math.random() * 2 });
  }
}

function spawnFloater(x, y, text, color) {
  floaters.push({ x, y, text, color, life: 0.7, total: 0.7 });
}

const PICKUP_TYPES = {
  damage: { color: "#fb923c", label: "+урон", dmg: 2,  hp: 0,  mhp: 0  },
  health: { color: "#22c55e", label: "+HP",   dmg: 0,  hp: 10, mhp: 0  },
};

function maybeDropPickup(x, y) {
  if (!LEVELS[currentLevel].drops) return;
  const kind = Math.random() < 0.5 ? "damage" : "health";
  pickups.push({ x, y, kind, bob: Math.random() * Math.PI * 2 });
}

function collectPickup(p) {
  const t = PICKUP_TYPES[p.kind];
  if (!t) return;
  const dmgGain = t.dmg > 0 && player.weapon === "minigun_char" ? 0.5 : t.dmg;
  player.damageBonus += dmgGain;
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
        const a = list[i], b = list[j];
        const dx = b.ref.x - a.ref.x, dy = b.ref.y - a.ref.y;
        const minD = a.r + b.r, minD2 = minD * minD, d2 = dx*dx+dy*dy;
        if (d2 >= minD2) continue;
        const d = Math.sqrt(d2) || 0.0001;
        const push = (minD - d) / 2 + 0.01;
        const nx = dx/d, ny = dy/d;
        a.ref.x -= nx*push; a.ref.y -= ny*push;
        b.ref.x += nx*push; b.ref.y += ny*push;
        a.ref.x = Math.max(a.r, Math.min(W-a.r, a.ref.x));
        a.ref.y = Math.max(a.r, Math.min(H-a.r, a.ref.y));
        b.ref.x = Math.max(b.r, Math.min(W-b.r, b.ref.x));
        b.ref.y = Math.max(b.r, Math.min(H-b.r, b.ref.y));
      }
      const ent = list[i];
      const dx = player.x - ent.ref.x, dy = player.y - ent.ref.y;
      const minD = ent.r + PLAYER.r, minD2 = minD*minD, d2 = dx*dx+dy*dy;
      if (d2 >= minD2) continue;
      const d = Math.sqrt(d2) || 0.0001;
      const push = (minD - d) / 2 + 0.01;
      const nx = dx/d, ny = dy/d;
      ent.ref.x -= nx*push; ent.ref.y -= ny*push;
      player.x  += nx*push; player.y  += ny*push;
      ent.ref.x = Math.max(ent.r, Math.min(W-ent.r, ent.ref.x));
      ent.ref.y = Math.max(ent.r, Math.min(H-ent.r, ent.ref.y));
      player.x  = Math.max(PLAYER.r, Math.min(W-PLAYER.r, player.x));
      player.y  = Math.max(PLAYER.r, Math.min(H-PLAYER.r, player.y));
    }
  }
}

function bossSummon() {
  const spots = [
    { x: 80, y: 80 }, { x: W-80, y: 80 },
    { x: 80, y: H-80 }, { x: W-80, y: H-80 },
  ];
  const r = spots[Math.floor(Math.random() * spots.length)];
  const m = spots[Math.floor(Math.random() * spots.length)];
  const ranger = makeBot(r.x, r.y, "ranger");
  const melee  = makeBot(m.x, m.y, "melee");
  resolveWalls(ranger, ranger.type.r);
  resolveWalls(melee, melee.type.r);
  bots.push(ranger); bots.push(melee);
  spawnFloater(W / 2, 40, "Босс призывает подмогу!", "#fbbf24");
}

function updateCamera() {
  camX = Math.round(Math.max(0, Math.min(W - VW, player.x - VW / 2)));
  camY = Math.round(Math.max(0, Math.min(H - VH, player.y - VH / 2)));
}

function update(dt) {
  if (state === STATE.MENU || state === STATE.CHAR_SELECT) return;
  time += dt;
  if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  if (floaters.length > MAX_FLOATERS)   floaters.splice(0, floaters.length - MAX_FLOATERS);
  if (bullets.length > MAX_BULLETS)     bullets.splice(0, bullets.length - MAX_BULLETS);
  if (state !== STATE.PLAYING) return;

  // ── Перезарядка ────────────────────────────────────────────────────────────
  if (player.reloading) {
    player.reloadTimer -= dt;
    if (player.reloadTimer <= 0) {
      player.reloading = false;
      player.reloadTimer = 0;
      const wp = WEAPONS[player.weapon];
      player.ammo = wp?.maxAmmo ?? null;
    }
  }

  // ── Замедление игрока ──────────────────────────────────────────────────────
  if (player.slowLeft > 0) player.slowLeft = Math.max(0, player.slowLeft - dt);

  // ── Движение игрока ───────────────────────────────────────────────────────
  let mx = 0, my = 0;
  if (keys.has("KeyW")) my -= 1;
  if (keys.has("KeyS")) my += 1;
  if (keys.has("KeyA")) mx -= 1;
  if (keys.has("KeyD")) mx += 1;
  if (isMobile && mJoy.active) { mx += mJoy.dx; my += mJoy.dy; }
  const len = Math.hypot(mx, my);
  if (len > 0) { mx /= len; my /= len; }

  const wp = WEAPONS[player.weapon];
  const reloadBonus = player.reloading && wp?.reloadSpeedBonus ? wp.reloadSpeedBonus : 1;
  const slowMul = player.slowLeft > 0 ? 0.6 : 1;
  moveEntity(player, mx * PLAYER.speed * slowMul * reloadBonus * dt, my * PLAYER.speed * slowMul * reloadBonus * dt, PLAYER.r);

  // ── Прицел и огонь ────────────────────────────────────────────────────────
  if (isMobile && mAimJoy.active) {
    const jl = Math.hypot(mAimJoy.dx, mAimJoy.dy);
    if (jl > 0.2) {
      const ang = Math.atan2(mAimJoy.dy, mAimJoy.dx);
      mouseX = player.x + Math.cos(ang) * 800;
      mouseY = player.y + Math.sin(ang) * 800;
      mouseLeftHeld = true;
    } else { mouseLeftHeld = false; }
  }

  const aim = Math.atan2(mouseY - player.y, mouseX - player.x);
  player.cd -= dt;
  if (mouseLeftHeld || mouseRightHeld) playerAttack(aim);

  for (const b of bots) botThink(b, dt);
  dogThink(dt);

  // ── Призыв обычного босса ─────────────────────────────────────────────────
  const boss = bots.find((b) => b.type.kind === "boss" && b.hp > 0);
  if (boss) {
    bossSummonTimer += dt;
    if (bossSummonTimer >= boss.type.summonEvery) { bossSummonTimer = 0; bossSummon(); }
  }

  // ── Волновой спаун ────────────────────────────────────────────────────────
  if (wonCountdown <= 0) {
    for (const w of levelWaveTimers) {
      if (w.totalCount !== undefined && w.spawned >= w.totalCount) continue;
      if (w.stopWhenNoKind && !bots.some(b => b.type.kind === w.stopWhenNoKind && b.hp > 0)) continue;
      w.timer -= dt;
      if (w.timer <= 0) {
        w.timer = w.every;
        spawnWaveBots(w.kind, w.count || 1, w.spawnZones);
        w.spawned += (w.count || 1);
      }
    }
  }

  // ── Пули ──────────────────────────────────────────────────────────────────
  for (const bullet of bullets) {
    bullet.life -= dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
  }

  for (const bullet of bullets) {
    const br = bullet.r;
    if (bullet.magicBlast) {
      let hitWall = false;
      for (const w of walls) { if (circleHitsWall(bullet.x, bullet.y, br, w)) { hitWall = true; break; } }
      if (hitWall) { detonateMageBlast(bullet.x, bullet.y, bullet.blastRadius, bullet.blastDamage); bullet.life = 0; continue; }
      if (dist2(bullet.x, bullet.y, player.x, player.y) < (PLAYER.r + br) * (PLAYER.r + br)) {
        detonateMageBlast(bullet.x, bullet.y, bullet.blastRadius, bullet.blastDamage); bullet.life = 0; continue;
      }
      if (dog && dog.hp > 0 && dist2(bullet.x, bullet.y, dog.x, dog.y) < (DOG.r + br) * (DOG.r + br)) {
        detonateMageBlast(bullet.x, bullet.y, bullet.blastRadius, bullet.blastDamage); bullet.life = 0; continue;
      }
      continue;
    }
    let hitWall = false;
    for (const w of walls) { if (circleHitsWall(bullet.x, bullet.y, br, w)) { hitWall = true; break; } }
    if (hitWall) { bullet.life = 0; spawnImpact(bullet.x, bullet.y, "#94a3b8"); continue; }
    if (bullet.owner === "bot") {
      const pR2 = (PLAYER.r + br) * (PLAYER.r + br);
      if (dist2(bullet.x, bullet.y, player.x, player.y) < pR2) {
        damagePlayer(bullet.damage);
        if (bullet.slow) player.slowLeft = Math.max(player.slowLeft, bullet.slowDuration || 2);
        bullet.life = 0;
        continue;
      }
      if (dog && dog.hp > 0) {
        const dR2 = (DOG.r + br) * (DOG.r + br);
        if (dist2(bullet.x, bullet.y, dog.x, dog.y) < dR2) { damageDog(bullet.damage); bullet.life = 0; continue; }
      }
    } else {
      // Пуля игрока
      let hitBot = false;
      for (const b of bots) {
        if (b.hp <= 0) continue;
        if (dist2(bullet.x, bullet.y, b.x, b.y) < (b.type.r + br) * (b.type.r + br)) {
          damageBot(b, bullet.damage);
          if (!bullet.pierce) { bullet.life = 0; hitBot = true; break; }
        }
      }
      if (hitBot) continue;
    }
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) bullets.splice(i, 1);
  }

  for (const p of pickups) p.bob += dt * 3;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (dist(p.x, p.y, player.x, player.y) < PLAYER.r + 12) { collectPickup(p); pickups.splice(i, 1); }
  }

  player.sinceHit += dt;
  if (player.hp > 0 && player.sinceHit >= PLAYER.regenDelay && player.hp < player.maxHp)
    player.hp = Math.min(player.maxHp, player.hp + PLAYER.regenRate * dt);

  if (dog && dog.hp > 0) {
    dog.sinceHit += dt;
    if (dog.sinceHit >= 3 && dog.hp < dog.maxHp) dog.hp = Math.min(dog.maxHp, dog.hp + 5 * dt);
  }
  for (const b of bots) {
    if (b.hp <= 0) continue;
    b.sinceHit += dt;
    if (b.sinceHit >= b.type.regenDelay && b.hp < b.type.maxHp)
      b.hp = Math.min(b.type.maxHp, b.hp + b.type.regenRate * dt);
  }

  for (const s of slashes) s.life -= dt;
  for (let i = slashes.length - 1; i >= 0; i--) if (slashes[i].life <= 0) slashes.splice(i, 1);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.88; p.vy *= 0.88;
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

  // ── Очистка мёртвых ботов (ice_golem — шанс воскрешения) ─────────────────
  for (let i = bots.length - 1; i >= 0; i--) {
    if (bots[i].hp <= 0) {
      const b = bots[i];
      if (b.type.kind === "ice_golem" && !b.resurrected && Math.random() < 0.3) {
        b.hp = 150;
        b.resurrected = true;
        spawnFloater(b.x, b.y - b.type.r - 10, "Воскрес! ❄️", "#7dd3fc");
      } else {
        if (b.type.kind === "ice_golem") maybeDropPickup(b.x, b.y);
        bots.splice(i, 1);
      }
    }
  }

  // ── Условие победы / поражения ────────────────────────────────────────────
  if (player.hp <= 0) {
    player.hp = 0;
    state = STATE.LOST;
  } else if (bots.length === 0 && allWavesDone() && time > 0.3 && wonCountdown <= 0) {
    wonCountdown = 3.0;
    spawnFloater(W / 2, H * 0.5, "Собирай бонусы!", "#4ade80");
  }

  if (wonCountdown > 0) {
    wonCountdown -= dt;
    if (wonCountdown <= 0) {
      wonCountdown = 0;
      if (currentLevel + 1 >= LEVELS.length) state = STATE.CLEARED;
      else state = STATE.WON;
    }
  }

  // ── HUD-данные ────────────────────────────────────────────────────────────
  if (state === STATE.PLAYING) {
    const bossE = bots.find((b) => b.type.kind === "boss" && b.hp > 0);
    hudHasBoss = !!bossE;
    hudOverlayBossT = bossE ? Math.max(0, bossE.type.summonEvery - bossSummonTimer) : 0;
    const mageE = bots.find((b) => b.type.kind === "mage" && b.hp > 0);
    hudHasMage = !!mageE;
    hudOverlayMageT = mageE ? Math.max(0, mageE.type.summonEvery - (mageE.summonTimer || 0)) : 0;
    const ikE = bots.find((b) => b.type.kind === "ice_king" && b.hp > 0);
    hudHasIceKing = !!ikE;
    hudIceKingHp = ikE ? ikE.hp : 0;
  }

  updateHud();
  if (state === STATE.PLAYING) updateCamera();
}

// ── Отрисовка ─────────────────────────────────────────────────────────────────
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",system-ui,sans-serif';
let _drawEmojiFontPx = -1;

function drawEmoji(x, y, r, emoji, flash) {
  const fp = 0 | (r * 2.1);
  if (fp !== _drawEmojiFontPx) { _drawEmojiFontPx = fp; ctx.font = `${fp}px ${EMOJI_FONT}`; }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (flash > 0) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.55, flash * 3)})`; ctx.fill();
    ctx.restore();
  }
  ctx.fillText(emoji, x, y);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

function drawHealthBar(x, y, w, h, ratio) {
  const u = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  ctx.fillStyle = "#334155"; ctx.fillRect(x - w/2, y, w, h);
  ctx.fillStyle = u > 0.35 ? "#22c55e" : "#f97316";
  ctx.fillRect(x - w/2, y, w * u, h);
}

function drawPickup(p) {
  const t = PICKUP_TYPES[p.kind];
  if (!t) return;
  const yoff = Math.sin(p.bob) * 3;
  ctx.save(); ctx.translate(p.x, p.y + yoff);
  ctx.fillStyle = t.color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (p.kind === "health") {
    ctx.moveTo(-5, 0); ctx.lineTo(5, 0);
    ctx.moveTo(0, -5); ctx.lineTo(0, 5);
  } else {
    ctx.moveTo(-5, 3); ctx.lineTo(0, -5); ctx.lineTo(5, 3);
  }
  ctx.stroke(); ctx.restore();
}

function drawChoiceOverlay() {
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = "#f8fafc";
  ctx.font = `bold 28px ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`Уровень ${currentLevel + 1} пройден! 🎉`, VW / 2, 60);
  ctx.font = `15px ${EMOJI_FONT}`;
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(isMobile ? "Тапни для выбора улучшения" : "1 / 2 — выбрать улучшение", VW / 2, 90);

  const opts = Object.values(UPGRADES);
  const cardW = 260, cardH = 140, gapX = 24;
  const totalW = opts.length * cardW + (opts.length - 1) * gapX;
  const startX = (VW - totalW) / 2;
  const cardY  = VH / 2 - cardH / 2 + 20;

  opts.forEach((u, i) => {
    const x = startX + i * (cardW + gapX);
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = "#7dd3fc"; ctx.lineWidth = 2.5;
    roundRect(x, cardY, cardW, cardH, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fde68a";
    ctx.font = `bold 36px ${EMOJI_FONT}`; ctx.textAlign = "center";
    ctx.fillText(`${i + 1}`, x + 28, cardY + 50);
    ctx.fillStyle = "#f8fafc";
    ctx.font = `bold 18px ${EMOJI_FONT}`;
    ctx.fillText(u.title, x + cardW / 2, cardY + 36);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `13px ${EMOJI_FONT}`; ctx.textAlign = "left";
    wrapText(u.desc, x + 16, cardY + 66, cardW - 24, 18);
    ctx.textAlign = "center";
  });
  ctx.textAlign = "left";
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

function wrapText(text, x, y, maxW, lh) {
  const words = text.split(" ");
  let line = "", yy = y;
  for (const w of words) {
    const test = line + w + " ";
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line.trim(), x, yy); line = w + " "; yy += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line.trim(), x, yy);
}

function drawMenu() {
  _drawEmojiFontPx = -1;
  ctx.fillStyle = "#0f1a2e";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f1f5f9";
  ctx.font = `bold 34px ${EMOJI_FONT}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("⚔️  Выбор уровня", W / 2, 44);

  // Кнопка «← Герой» (верхний левый угол)
  const _hBtnX = 14, _hBtnY = 10, _hBtnW = 130, _hBtnH = 34;
  ctx.fillStyle = "#1e3a5f";
  ctx.beginPath(); ctx.roundRect(_hBtnX, _hBtnY, _hBtnW, _hBtnH, 7); ctx.fill();
  ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(_hBtnX, _hBtnY, _hBtnW, _hBtnH, 7); ctx.stroke();
  ctx.fillStyle = "#e0f2fe"; ctx.font = `bold 16px ${EMOJI_FONT}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("← Герой", _hBtnX + _hBtnW / 2, _hBtnY + _hBtnH / 2);
  ctx.font = `14px ${EMOJI_FONT}`;
  ctx.fillStyle = "#64748b";
  const ch = CHARACTERS[selectedChar];
  ctx.fillText(`Персонаж: ${ch?.emoji ?? ""} ${ch?.name ?? ""} · Кликни карточку или нажми 1–0`, W / 2, 76);

  const cols = isMobile ? 3 : 5;
  const cardW = Math.floor((VW * 0.94 - (cols - 1) * 12) / cols);
  const cardH = Math.floor(VH * 0.27);
  const gapX = 12, gapY = Math.floor(VH * 0.025);
  const totalW = cols * cardW + (cols - 1) * gapX;
  const startX = (VW - totalW) / 2;
  const rows = Math.ceil(LEVELS.length / cols);
  const totalGridH = rows * cardH + (rows - 1) * gapY;
  const startY = Math.floor((VH - totalGridH) / 2 + 14);

  for (let i = 0; i < LEVELS.length; i++) {
    const L = LEVELS[i];
    const col = i % cols, row = Math.floor(i / cols);
    const cx = startX + col * (cardW + gapX);
    const cy = startY + row * (cardH + gapY);
    const hov = menuHoverIdx === i;

    ctx.fillStyle = hov ? "#1e3a5f" : "#16253a";
    ctx.strokeStyle = hov ? "#7dd3fc" : "#334155";
    ctx.lineWidth = hov ? 2.5 : 1.5;
    roundRect(cx, cy, cardW, cardH, 12); ctx.fill(); ctx.stroke();

    ctx.fillStyle = hov ? "#38bdf8" : "#475569";
    ctx.font = `bold 12px ${EMOJI_FONT}`;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(`${(i + 1) % 10 === 0 ? 0 : (i + 1) % 10}`, cx + 10, cy + 8);

    ctx.font = `bold 28px ${EMOJI_FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(L.emoji || "🎮", cx + cardW / 2, cy + cardH * 0.42);

    ctx.fillStyle = "#f1f5f9";
    ctx.font = `bold 12px ${EMOJI_FONT}`;
    ctx.fillText(L.name, cx + cardW / 2, cy + cardH * 0.72);

    ctx.fillStyle = "#64748b";
    ctx.font = `10px ${EMOJI_FONT}`;
    ctx.fillText(L.desc || "", cx + cardW / 2, cy + cardH * 0.88);

    if (hov) {
      ctx.fillStyle = "#0ea5e9";
      roundRect(cx + cardW * 0.2, cy + cardH - 26, cardW * 0.6, 20, 6);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `bold 11px ${EMOJI_FONT}`;
      ctx.fillText("Играть", cx + cardW / 2, cy + cardH - 16);
    }
  }
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

function drawCharSelect() {
  _drawEmojiFontPx = -1;
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, VW, VH);

  ctx.fillStyle = "#f1f5f9";
  ctx.font = `bold 34px ${EMOJI_FONT}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("🎮  Выбор персонажа", VW / 2, 44);
  ctx.font = `13px ${EMOJI_FONT}`;
  ctx.fillStyle = "#475569";
  ctx.fillText("Собака 🐶 всегда с тобой · Нажми 1–5 или кликни карточку", VW / 2, 74);

  const charIds = Object.keys(CHARACTERS);
  const cols = Math.min(3, charIds.length);
  const cardW = Math.floor((VW * 0.92 - (cols - 1) * 16) / cols);
  const cardH = Math.floor(VH * 0.38);
  const gapX = 16, gapY = Math.floor(VH * 0.04);
  const totalW = cols * cardW + (cols - 1) * gapX;
  const startX = (VW - totalW) / 2;
  const rows = Math.ceil(charIds.length / cols);
  const totalGridH = rows * cardH + (rows - 1) * gapY;
  const startY = Math.floor((VH - totalGridH) / 2 + 10);

  charIds.forEach((id, i) => {
    const ch = CHARACTERS[id];
    const col = i % cols, row = Math.floor(i / cols);
    // Center last row if shorter than cols
    const rowCount = Math.min(cols, charIds.length - row * cols);
    const rowW = rowCount * cardW + (rowCount - 1) * gapX;
    const rowStartX = (VW - rowW) / 2;
    const cx = rowStartX + col * (cardW + gapX);
    const cy = startY + row * (cardH + gapY);
    const selected = selectedChar === id;
    const hov = charHoverIdx === i;

    ctx.fillStyle = selected ? "#0c2744" : (hov ? "#152338" : "#111e2e");
    ctx.strokeStyle = selected ? ch.color : (hov ? "#7dd3fc" : "#1e3a5f");
    ctx.lineWidth = selected ? 3 : (hov ? 2 : 1.5);
    roundRect(cx, cy, cardW, cardH, 14); ctx.fill(); ctx.stroke();

    ctx.font = `bold 13px ${EMOJI_FONT}`;
    ctx.fillStyle = "#475569";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(`${i + 1}`, cx + 10, cy + 8);

    ctx.font = `bold 40px ${EMOJI_FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(ch.emoji, cx + cardW / 2, cy + cardH * 0.30);

    ctx.fillStyle = selected ? ch.color : "#f1f5f9";
    ctx.font = `bold 16px ${EMOJI_FONT}`;
    ctx.fillText(ch.name, cx + cardW / 2, cy + cardH * 0.54);

    ctx.fillStyle = "#94a3b8";
    ctx.font = `11px ${EMOJI_FONT}`;
    ctx.fillText(ch.desc, cx + cardW / 2, cy + cardH * 0.68);

    ctx.fillStyle = "#64748b";
    ctx.font = `10px ${EMOJI_FONT}`;
    wrapText(ch.hint, cx + 12, cy + cardH * 0.77, cardW - 24, 14);

    if (selected) {
      ctx.fillStyle = ch.color;
      roundRect(cx + cardW * 0.2, cy + cardH - 28, cardW * 0.6, 22, 8);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.font = `bold 12px ${EMOJI_FONT}`; ctx.textAlign = "center";
      ctx.fillText("Выбран ✓", cx + cardW / 2, cy + cardH - 17);
    } else if (hov) {
      ctx.fillStyle = "#0ea5e9";
      roundRect(cx + cardW * 0.2, cy + cardH - 28, cardW * 0.6, 22, 8);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `bold 12px ${EMOJI_FONT}`; ctx.textAlign = "center";
      ctx.fillText("Выбрать", cx + cardW / 2, cy + cardH - 17);
    }

    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  });

  // Кнопка → в меню уровней
  const btnW = 200, btnH = 44, btnX = (VW - btnW) / 2, btnY = VH - 58;
  ctx.fillStyle = "#0ea5e9";
  roundRect(btnX, btnY, btnW, btnH, 12); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `bold 17px ${EMOJI_FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("Играть →", VW / 2, btnY + btnH / 2);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

function drawJoystick(baseX, baseY, dx, dy, active, color) {
  const JR = 64;
  ctx.beginPath(); ctx.arc(baseX, baseY, JR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(baseX + dx*JR, baseY + dy*JR, 28, 0, Math.PI * 2);
  ctx.fillStyle = active ? color : "rgba(255,255,255,0.14)"; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2; ctx.stroke();
}

function drawMobileControls() {
  if (!isMobile || state !== STATE.PLAYING) return;
  ctx.save();
  drawJoystick(
    mJoy.active    ? mJoy.baseX    : VW * 0.15, mJoy.active    ? mJoy.baseY    : VH * 0.78,
    mJoy.dx, mJoy.dy, mJoy.active, "rgba(125,211,252,0.55)"
  );
  drawJoystick(
    mAimJoy.active ? mAimJoy.baseX : VW * 0.85, mAimJoy.active ? mAimJoy.baseY : VH * 0.78,
    mAimJoy.dx, mAimJoy.dy, mAimJoy.active, "rgba(251,191,36,0.6)"
  );
  for (const btn of mobBtns) {
    ctx.beginPath(); ctx.arc(btn.ax, btn.ay, btn.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(30,50,80,0.72)"; ctx.fill();
    ctx.strokeStyle = "rgba(125,211,252,0.4)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#e2e8f0";
    ctx.font = `bold 18px ${EMOJI_FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(btn.label, btn.ax, btn.ay);
  }
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function draw() {
  if (state === STATE.CHAR_SELECT) { drawCharSelect(); return; }
  if (state === STATE.MENU)        { drawMenu();       return; }
  _drawEmojiFontPx = -1;

  ctx.fillStyle = "#1a2332";
  ctx.fillRect(0, 0, VW, VH);

  ctx.save();
  ctx.translate(-camX, -camY);

  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0);

  for (const p of pickups) drawPickup(p);

  // ── Замедление: синяя пульсирующая рамка ──────────────────────────────────
  if (player.slowLeft > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 8);
    ctx.beginPath(); ctx.arc(player.x, player.y, PLAYER.r + 5, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(56,189,248,${0.45 + 0.45 * pulse})`;
    ctx.lineWidth = 3; ctx.stroke();
  }

  drawHealthBar(player.x, player.y - PLAYER.r - 14, 44, 4, player.hp / player.maxHp);
  drawEmoji(player.x, player.y, PLAYER.r, PLAYER.emoji, player.hitFlash);

  // ── Индикатор патронов (дуга вокруг игрока) ───────────────────────────────
  const wpDraw = WEAPONS[player.weapon];
  if (wpDraw && wpDraw.maxAmmo !== undefined) {
    const startAng = -Math.PI / 2;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    if (player.reloading) {
      const prog = 1 - player.reloadTimer / (wpDraw.reloadTime || 2.0);
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER.r + 9, startAng, startAng + prog * Math.PI * 2);
      ctx.strokeStyle = "#fbbf24"; ctx.stroke();
    } else if (player.ammo !== null) {
      const frac = player.ammo / wpDraw.maxAmmo;
      if (frac < 1) {
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER.r + 9, startAng, startAng + frac * Math.PI * 2);
        ctx.strokeStyle = frac > 0.3 ? "#4ade80" : "#f97316"; ctx.stroke();
      }
    }
    ctx.lineCap = "butt";
  }

  const aim = Math.atan2(mouseY - player.y, mouseX - player.x);
  ctx.strokeStyle = "rgba(147,197,253,0.35)"; ctx.lineWidth = 2;
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
    const barW = b.type.kind === "boss" || b.type.kind === "ice_king" ? 80 : 36;
    const barH = b.type.kind === "boss" || b.type.kind === "ice_king" ? 6  : 3;
    drawHealthBar(b.x, b.y - b.type.r - 12, barW, barH, b.hp / b.type.maxHp);
    drawEmoji(b.x, b.y, b.type.r, b.type.emoji, b.hitFlash);
    if (b.stunLeft > 0) {
      ctx.font = `18px ${EMOJI_FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("💫", b.x, b.y - b.type.r - 22);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    }
  }

  // ── Пули игрока (жёлтые) ──────────────────────────────────────────────────
  ctx.beginPath();
  for (const bullet of bullets) {
    if (!bullet.magicBlast && bullet.owner === "player" && !bullet.iceBullet) {
      ctx.moveTo(bullet.x + bullet.r, bullet.y);
      ctx.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
    }
  }
  if (bullets.some(b => !b.magicBlast && b.owner === "player")) { ctx.fillStyle = "#fde047"; ctx.fill(); }

  // ── Пули ботов (оранжевые) ────────────────────────────────────────────────
  ctx.beginPath();
  for (const bullet of bullets) {
    if (!bullet.magicBlast && bullet.owner !== "player" && !bullet.iceBullet) {
      ctx.moveTo(bullet.x + bullet.r, bullet.y);
      ctx.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
    }
  }
  if (bullets.some(b => !b.magicBlast && b.owner !== "player" && !b.iceBullet)) { ctx.fillStyle = "#fb923c"; ctx.fill(); }

  // ── Ледяные пули (голубые) ────────────────────────────────────────────────
  ctx.beginPath();
  for (const bullet of bullets) {
    if (bullet.iceBullet) {
      ctx.moveTo(bullet.x + bullet.r, bullet.y);
      ctx.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
    }
  }
  if (bullets.some(b => b.iceBullet)) { ctx.fillStyle = "#7dd3fc"; ctx.fill(); }

  // ── Магические снаряды (фиолетовые) ──────────────────────────────────────
  ctx.beginPath();
  for (const bullet of bullets) {
    if (bullet.magicBlast) {
      const rr = bullet.r + 1;
      ctx.moveTo(bullet.x + rr, bullet.y);
      ctx.arc(bullet.x, bullet.y, rr, 0, Math.PI * 2);
    }
  }
  if (bullets.some(b => b.magicBlast)) { ctx.fillStyle = "#a78bfa"; ctx.fill(); }

  // ── Удары ─────────────────────────────────────────────────────────────────
  for (const s of slashes) {
    const a = s.life / 0.18;
    ctx.strokeStyle = `rgba(253,224,71,${a})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, s.ang - 0.7, s.ang + 0.7); ctx.stroke();
  }

  // ── Частицы ───────────────────────────────────────────────────────────────
  if (particles.length) {
    ctx.globalAlpha = 0.82;
    let curColor = null; ctx.beginPath();
    for (let pi = 0; pi < particles.length; pi++) {
      const p = particles[pi];
      if (p.color !== curColor) {
        if (curColor !== null) ctx.fill();
        ctx.fillStyle = p.color; ctx.beginPath(); curColor = p.color;
      }
      ctx.moveTo(p.x + p.r, p.y); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    }
    if (curColor !== null) ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.font = `bold 14px ${EMOJI_FONT}`; ctx.textAlign = "center";
  for (const f of floaters) {
    const a = f.total > 0 ? f.life / f.total : 0;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1; ctx.textAlign = "left";

  ctx.restore();
  // ── Экранное пространство (UI) ────────────────────────────────────────────

  // Таймер босса
  if (hudHasBoss) {
    ctx.fillStyle = "#fbbf24"; ctx.font = `bold 14px ${EMOJI_FONT}`; ctx.textAlign = "center";
    ctx.fillText(`Призыв босса через ${hudOverlayBossT.toFixed(1)}с`, VW / 2, 22);
    ctx.textAlign = "left";
  }
  if (hudHasMage) {
    ctx.fillStyle = "#c4b5fd"; ctx.font = `bold 14px ${EMOJI_FONT}`; ctx.textAlign = "center";
    ctx.fillText(`Скелеты мага через ${hudOverlayMageT.toFixed(1)}с`, VW / 2, hudHasBoss ? 42 : 22);
    ctx.textAlign = "left";
  }

  // Ice King HP-бар
  if (hudHasIceKing) {
    const barW = VW * 0.46, barH = 13;
    const barX = (VW - barW) / 2, barY = VH - 32;
    ctx.fillStyle = "#0c2235"; ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    ctx.fillStyle = "#0f172a"; ctx.fillRect(barX, barY, barW, barH);
    const frac = Math.max(0, hudIceKingHp / BOT_TYPES.ice_king.maxHp);
    const grad = ctx.createLinearGradient(barX, barY, barX + barW * frac, barY);
    grad.addColorStop(0, "#0284c7"); grad.addColorStop(1, "#38bdf8");
    ctx.fillStyle = grad; ctx.fillRect(barX, barY, barW * frac, barH);
    ctx.strokeStyle = "#7dd3fc"; ctx.lineWidth = 1.5; ctx.strokeRect(barX, barY, barW, barH);
    ctx.fillStyle = "#e0f2fe"; ctx.font = `bold 12px ${EMOJI_FONT}`; ctx.textAlign = "center";
    ctx.fillText(`👑 Ice King  ${Math.ceil(hudIceKingHp)} / ${BOT_TYPES.ice_king.maxHp}`, VW / 2, barY - 4);
    ctx.textAlign = "left";
  }

  // Счётчик сбора бонусов (3 секунды)
  if (state === STATE.PLAYING && wonCountdown > 0) {
    const t = Math.ceil(wonCountdown);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, VW, 46);
    ctx.fillStyle = "#4ade80";
    ctx.font = `bold 20px ${EMOJI_FONT}`; ctx.textAlign = "center";
    ctx.fillText(`✅ Уровень пройден! Собирай бонусы — ${t}с`, VW / 2, 28);
    ctx.textAlign = "left";
  }

  if (hurtFlash > 0) {
    ctx.fillStyle = `rgba(239,68,68,${Math.min(0.45, hurtFlash) * 0.55})`;
    ctx.fillRect(0, 0, VW, VH);
  }

  if (state === STATE.WON) {
    drawChoiceOverlay();
  } else if (state !== STATE.PLAYING) {
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = "#f8fafc"; ctx.font = `bold 32px ${EMOJI_FONT}`; ctx.textAlign = "center";
    let title = "", hint = "";
    if (state === STATE.LOST) {
      title = "Поражение";
      hint = isMobile ? "" : "R — повтор уровня  ·  M — меню";
    } else if (state === STATE.CLEARED) {
      title = "Все уровни пройдены! 🏆";
      hint = isMobile ? "Нажми M для меню" : "M — меню  ·  R — заново";
    }
    ctx.fillText(title, VW / 2, VH / 2 - 8);
    ctx.font = `18px ${EMOJI_FONT}`; ctx.fillStyle = "#cbd5e1";
    ctx.fillText(hint, VW / 2, VH / 2 + 28);
    ctx.textAlign = "left";
    // Мобильные кнопки поражения
    if (state === STATE.LOST && isMobile) {
      const bW = 200, bH = 46, gap = 16;
      const totalBW = bW * 2 + gap;
      const bY = VH / 2 + 52;
      const b1X = (VW - totalBW) / 2;
      const b2X = b1X + bW + gap;
      // Повтор
      ctx.fillStyle = "#1e3a5f";
      ctx.beginPath(); ctx.roundRect(b1X, bY, bW, bH, 8); ctx.fill();
      ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(b1X, bY, bW, bH, 8); ctx.stroke();
      ctx.fillStyle = "#e0f2fe"; ctx.font = `bold 17px ${EMOJI_FONT}`; ctx.textAlign = "center";
      ctx.fillText("🔄 Повтор уровня", b1X + bW / 2, bY + bH / 2);
      // Меню
      ctx.fillStyle = "#1c1917";
      ctx.beginPath(); ctx.roundRect(b2X, bY, bW, bH, 8); ctx.fill();
      ctx.strokeStyle = "#64748b"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(b2X, bY, bW, bH, 8); ctx.stroke();
      ctx.fillStyle = "#cbd5e1"; ctx.font = `bold 17px ${EMOJI_FONT}`; ctx.textAlign = "center";
      ctx.fillText("🏠 В меню", b2X + bW / 2, bY + bH / 2);
      ctx.textAlign = "left";
    }
  }

  drawMobileControls();
}

function getAvailableUpgrades() {
  return Object.values(UPGRADES);
}

function applyUpgrade(id) {
  if (id === "bonus_hp") {
    const gain = Math.max(5, Math.ceil(player.maxHp * 0.1));
    player.maxHp += gain;
    player.hp = Math.min(player.maxHp, player.hp + gain);
    spawnFloater(player.x, player.y - 40, `+${gain} HP!`, "#4ade80");
  }
  if (id === "bonus_dmg") {
    player.damageMul = Math.round(((player.damageMul || 1) + 0.1) * 100) / 100;
    spawnFloater(player.x, player.y - 40, "+10% урон!", "#fb923c");
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
  try { update(dt); draw(); } catch (err) { console.error("[game]", err); }
  requestAnimationFrame(frame);
}

// ── Клавиатура ────────────────────────────────────────────────────────────────
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyR") {
    if (state === STATE.LOST) { player.hp = player.maxHp; loadLevel(currentLevel); }
    else newGame();
    return;
  }
  if (e.code === "KeyM") { showMenu(); return; }

  if (state === STATE.CHAR_SELECT) {
    const charIds = Object.keys(CHARACTERS);
    const keyMap = { Digit1:0,Digit2:1,Digit3:2,Digit4:3,Digit5:4, Numpad1:0,Numpad2:1,Numpad3:2,Numpad4:3,Numpad5:4 }[e.code];
    if (keyMap !== undefined && keyMap < charIds.length) {
      selectedChar = charIds[keyMap]; showMenu();
    }
    if (e.code === "Enter" || e.code === "Space") showMenu();
    return;
  }

  if (state === STATE.MENU) {
    const menuKey = {
      Digit1:0,Digit2:1,Digit3:2,Digit4:3,Digit5:4,
      Digit6:5,Digit7:6,Digit8:7,Digit9:8,Digit0:9,
      Numpad1:0,Numpad2:1,Numpad3:2,Numpad4:3,Numpad5:4,
      Numpad6:5,Numpad7:6,Numpad8:7,Numpad9:8,Numpad0:9,
    }[e.code];
    if (menuKey !== undefined && menuKey < LEVELS.length) startFromLevel(menuKey);
    return;
  }

  if (state === STATE.WON) {
    const opts = getAvailableUpgrades();
    const idx = { Digit1:0,Digit2:1,Numpad1:0,Numpad2:1 }[e.code];
    if (idx !== undefined && opts[idx]) { applyUpgrade(opts[idx].id); advanceLevel(); }
    return;
  }

  keys.add(e.code);
  if (e.code === "Space") e.preventDefault();
});

window.addEventListener("keyup", (e) => { keys.delete(e.code); });

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const rw = Math.max(1, rect.width), rh = Math.max(1, rect.height);

  if (state === STATE.CHAR_SELECT) {
    const x = (e.clientX - rect.left) * (VW / rw);
    const y = (e.clientY - rect.top)  * (VH / rh);
    const charIds = Object.keys(CHARACTERS);
    const cols = Math.min(3, charIds.length);
    const cardW = Math.floor((VW * 0.92 - (cols - 1) * 16) / cols);
    const cardH = Math.floor(VH * 0.38);
    const gapX = 16, gapY = Math.floor(VH * 0.04);
    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = (VW - totalW) / 2;
    const rows = Math.ceil(charIds.length / cols);
    const totalGridH = rows * cardH + (rows - 1) * gapY;
    const startY = Math.floor((VH - totalGridH) / 2 + 10);
    let found = -1;
    charIds.forEach((id, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const rowCount = Math.min(cols, charIds.length - row * cols);
      const rowW = rowCount * cardW + (rowCount - 1) * gapX;
      const rowStartX = (VW - rowW) / 2;
      const cx = rowStartX + col * (cardW + gapX);
      const cy = startY + row * (cardH + gapY);
      if (x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) found = i;
    });
    charHoverIdx = found;
    return;
  }

  if (state !== STATE.MENU) {
    const scaleX = VW / rw, scaleY = VH / rh;
    mouseX = (e.clientX - rect.left) * scaleX + camX;
    mouseY = (e.clientY - rect.top)  * scaleY + camY;
    return;
  }
  // Menu hover
  const x = (e.clientX - rect.left) * (VW / rw);
  const y = (e.clientY - rect.top)  * (VH / rh);
  const cols = isMobile ? 3 : 5;
  const cardW = Math.floor((VW * 0.94 - (cols - 1) * 12) / cols);
  const cardH = Math.floor(VH * 0.27);
  const gapX = 12, gapY = Math.floor(VH * 0.025);
  const totalW = cols * cardW + (cols - 1) * gapX;
  const startX = (VW - totalW) / 2;
  const rows = Math.ceil(LEVELS.length / cols);
  const totalGridH = rows * cardH + (rows - 1) * gapY;
  const startY = Math.floor((VH - totalGridH) / 2 + 14);
  let found = -1;
  for (let i = 0; i < LEVELS.length; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const cx = startX + col * (cardW + gapX);
    const cy = startY + row * (cardH + gapY);
    if (x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) { found = i; break; }
  }
  menuHoverIdx = found;
  canvas.style.cursor = found >= 0 ? "pointer" : "default";
});

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const rw = Math.max(1, rect.width), rh = Math.max(1, rect.height);
  const x = (e.clientX - rect.left) * (VW / rw);
  const y = (e.clientY - rect.top)  * (VH / rh);

  if (state === STATE.CHAR_SELECT) {
    // "Играть →" button
    const btnW = 200, btnH = 44, btnX = (VW - btnW) / 2, btnY = VH - 58;
    if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) { showMenu(); return; }
    // Character cards
    const charIds = Object.keys(CHARACTERS);
    const cols = Math.min(3, charIds.length);
    const cardW = Math.floor((VW * 0.92 - (cols - 1) * 16) / cols);
    const cardH = Math.floor(VH * 0.38);
    const gapX = 16, gapY = Math.floor(VH * 0.04);
    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = (VW - totalW) / 2;
    const rows = Math.ceil(charIds.length / cols);
    const totalGridH = rows * cardH + (rows - 1) * gapY;
    const startY = Math.floor((VH - totalGridH) / 2 + 10);
    charIds.forEach((id, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const rowCount = Math.min(cols, charIds.length - row * cols);
      const rowW = rowCount * cardW + (rowCount - 1) * gapX;
      const rowStartX = (VW - rowW) / 2;
      const cx = rowStartX + col * (cardW + gapX);
      const cy = startY + row * (cardH + gapY);
      if (x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) {
        selectedChar = id; showMenu();
      }
    });
    return;
  }

  if (state !== STATE.MENU) return;
  // «← Герой» кнопка
  if (x >= 14 && x <= 14 + 130 && y >= 10 && y <= 10 + 34) { showCharSelect(); return; }
  const cols = isMobile ? 3 : 5;
  const cardW = Math.floor((VW * 0.94 - (cols - 1) * 12) / cols);
  const cardH = Math.floor(VH * 0.27);
  const gapX = 12, gapY = Math.floor(VH * 0.025);
  const totalW = cols * cardW + (cols - 1) * gapX;
  const startX = (VW - totalW) / 2;
  const rows = Math.ceil(LEVELS.length / cols);
  const totalGridH = rows * cardH + (rows - 1) * gapY;
  const startY = Math.floor((VH - totalGridH) / 2 + 14);
  for (let i = 0; i < LEVELS.length; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const cx = startX + col * (cardW + gapX);
    const cy = startY + row * (cardH + gapY);
    if (x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) { startFromLevel(i); return; }
  }
});

canvas.addEventListener("mousedown", (e) => {
  if (state !== STATE.PLAYING) return;
  if (e.button === 0) mouseLeftHeld  = true;
  if (e.button === 2) mouseRightHeld = true;
});
canvas.addEventListener("mouseup", (e) => {
  if (e.button === 0) mouseLeftHeld  = false;
  if (e.button === 2) mouseRightHeld = false;
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ── Touch события ─────────────────────────────────────────────────────────────
if (isMobile) {
  const JOY_MAX = 70;

  function handleMobBtn(cx, cy) {
    for (const btn of mobBtns) {
      const dx = cx - btn.ax, dy = cy - btn.ay;
      if (dx*dx + dy*dy <= btn.r * btn.r) {
        if (btn.id === "menu") { showMenu(); return true; }
      }
    }
    return false;
  }

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();

    if (state === STATE.CHAR_SELECT) {
      const { x, y } = scaledTouch(e.changedTouches[0]);
      // "Играть →" button
      const btnW = 200, btnH = 44, btnX = (VW - btnW) / 2, btnY = VH - 58;
      if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) { showMenu(); return; }
      // Character cards
      const charIds = Object.keys(CHARACTERS);
      const cols = Math.min(3, charIds.length);
      const cardW = Math.floor((VW * 0.92 - (cols - 1) * 16) / cols);
      const cardH = Math.floor(VH * 0.38);
      const gapX = 16, gapY = Math.floor(VH * 0.04);
      const rows = Math.ceil(charIds.length / cols);
      const totalW = cols * cardW + (cols - 1) * gapX;
      const startX = (VW - totalW) / 2;
      const totalGridH = rows * cardH + (rows - 1) * gapY;
      const startY = Math.floor((VH - totalGridH) / 2 + 10);
      charIds.forEach((id, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const rowCount = Math.min(cols, charIds.length - row * cols);
        const rowW = rowCount * cardW + (rowCount - 1) * gapX;
        const rowStartX = (VW - rowW) / 2;
        const cx2 = rowStartX + col * (cardW + gapX);
        const cy2 = startY + row * (cardH + gapY);
        if (x >= cx2 && x <= cx2 + cardW && y >= cy2 && y <= cy2 + cardH) {
          selectedChar = id; showMenu();
        }
      });
      return;
    }

    if (state === STATE.LOST) {
      const { x, y } = scaledTouch(e.changedTouches[0]);
      const bW = 200, bH = 46, gap = 16;
      const totalBW = bW * 2 + gap;
      const bY = VH / 2 + 52;
      const b1X = (VW - totalBW) / 2;
      const b2X = b1X + bW + gap;
      if (x >= b1X && x <= b1X + bW && y >= bY && y <= bY + bH) {
        player.hp = player.maxHp; loadLevel(currentLevel); return;
      }
      if (x >= b2X && x <= b2X + bW && y >= bY && y <= bY + bH) { showMenu(); return; }
      return;
    }

    if (state === STATE.MENU) {
      const { x, y } = scaledTouch(e.changedTouches[0]);
      // «← Герой» кнопка
      if (x >= 14 && x <= 14 + 130 && y >= 10 && y <= 10 + 34) { showCharSelect(); return; }
      const cols = isMobile ? 3 : 5;
      const cardW = Math.floor((VW * 0.94 - (cols - 1) * 12) / cols);
      const cardH = Math.floor(VH * 0.27);
      const gapX = 12, gapY = Math.floor(VH * 0.025);
      const totalW = cols * cardW + (cols - 1) * gapX;
      const startX = (VW - totalW) / 2;
      const rows = Math.ceil(LEVELS.length / cols);
      const totalGridH = rows * cardH + (rows - 1) * gapY;
      const startY = Math.floor((VH - totalGridH) / 2 + 14);
      for (let i = 0; i < LEVELS.length; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const cx = startX + col * (cardW + gapX);
        const cy = startY + row * (cardH + gapY);
        if (x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) { startFromLevel(i); return; }
      }
      return;
    }

    if (state === STATE.WON) {
      const { x, y } = scaledTouch(e.changedTouches[0]);
      const opts = getAvailableUpgrades();
      const cardW = 260, cardH = 140, gapX = 24;
      const totalW = opts.length * cardW + (opts.length - 1) * gapX;
      const startX = (VW - totalW) / 2;
      const cardY  = VH / 2 - cardH / 2 + 20;
      for (let i = 0; i < opts.length; i++) {
        const cx = startX + i * (cardW + gapX);
        if (x >= cx && x <= cx + cardW && y >= cardY && y <= cardY + cardH) {
          applyUpgrade(opts[i].id); advanceLevel(); return;
        }
      }
      return;
    }

    if (state !== STATE.PLAYING) return;

    for (const touch of e.changedTouches) {
      const { x, y } = scaledTouch(touch);
      if (handleMobBtn(x, y)) continue;
      if (x < VW / 2) {
        if (!mJoy.active) { mJoy.active = true; mJoy.id = touch.identifier; mJoy.baseX = x; mJoy.baseY = y; mJoy.dx = 0; mJoy.dy = 0; }
      } else {
        if (!mAimJoy.active) { mAimJoy.active = true; mAimJoy.id = touch.identifier; mAimJoy.baseX = x; mAimJoy.baseY = y; mAimJoy.dx = 0; mAimJoy.dy = 0; }
      }
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (state !== STATE.PLAYING) return;
    for (const touch of e.changedTouches) {
      const { x, y } = scaledTouch(touch);
      if (mJoy.active && touch.identifier === mJoy.id) {
        let dx = x - mJoy.baseX, dy = y - mJoy.baseY;
        const l = Math.hypot(dx, dy);
        if (l > JOY_MAX) { dx = dx/l*JOY_MAX; dy = dy/l*JOY_MAX; }
        mJoy.dx = dx/JOY_MAX; mJoy.dy = dy/JOY_MAX;
      }
      if (mAimJoy.active && touch.identifier === mAimJoy.id) {
        let dx = x - mAimJoy.baseX, dy = y - mAimJoy.baseY;
        const l = Math.hypot(dx, dy);
        if (l > JOY_MAX) { dx = dx/l*JOY_MAX; dy = dy/l*JOY_MAX; }
        mAimJoy.dx = dx/JOY_MAX; mAimJoy.dy = dy/JOY_MAX;
      }
    }
  }, { passive: false });

  function touchEnd(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (mJoy.active    && touch.identifier === mJoy.id)    { mJoy.active    = false; mJoy.dx    = 0; mJoy.dy = 0; }
      if (mAimJoy.active && touch.identifier === mAimJoy.id) { mAimJoy.active = false; mAimJoy.dx = 0; mAimJoy.dy = 0; mouseLeftHeld = false; }
    }
  }
  canvas.addEventListener("touchend",    touchEnd, { passive: false });
  canvas.addEventListener("touchcancel", touchEnd, { passive: false });
  document.body.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
}
// ─────────────────────────────────────────────────────────────────────────────

newGame();
canvas.focus();
requestAnimationFrame(frame);
