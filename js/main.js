// 上半部分：横屏游戏区；下半部分：套装展示、商店
const canvas = wx.createCanvas()
const ctx = canvas.getContext('2d')

// UI 主题：深色 + 琥珀强调，统一圆角与配色
const UI = {
  bg: '#0f0e14',
  bgPanel: '#1a1922',
  bgCard: '#252330',
  bgCardAlt: '#2d2a3a',
  primary: '#e8a84a',
  primaryDim: 'rgba(232,168,74,0.25)',
  success: '#5cb85c',
  danger: '#c94a4a',
  text: '#f2f0eb',
  textDim: 'rgba(242,240,235,0.7)',
  textMuted: 'rgba(242,240,235,0.5)',
  border: 'rgba(255,255,255,0.12)',
  radius: 10,
  radiusSm: 6
}
function roundRect(x, y, w, h, r) {
  r = Math.min(r || UI.radius, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

// 布局：顶部预留安全区（状态栏/刘海），上半部分为游戏区
const TOP_SAFE_MARGIN = 48
const GAME_HEIGHT_RATIO = 0.32
let gameTop = 0
let gameHeight = 0
let panelTop = 0

// 游戏常量
const PLAYER_X = 50
const PLAYER_MAX_HP = 800
const BASE_ATTACK = 8
const BASE_ATTACK_INTERVAL = 1

// 属性与英雄：大类型(力量/敏捷/智力)，职业(如狂暴战)属某一大类型，有各自初始属性与升级成长
const HERO_TYPES = { str: '力量英雄', agi: '敏捷英雄', int: '智力英雄' }
const CLASSES = {
  fury_warrior: {
    name: '狂暴战',
    heroType: 'str',
    hasRage: true, // 战士职业才有怒气，后续其他战士也加此标记
    baseStr: 15,
    baseAgi: 10,
    baseInt: 10,
    strPerLevel: 2,
    agiPerLevel: 1,
    intPerLevel: 0,
    startSkillIds: [12, 15, 16]
  }
}
const DEFAULT_CLASS = 'fury_warrior'
const MAIN_STAT_ATTACK_BASE = 5
const MAIN_STAT_ATTACK_PER_POINT = 0.2
const HP_BASE = 200
const HP_PER_STR = 40
const REACH_PLAYER_X = 50
const ENEMY_SPEED = 48
const ENEMY_MAX_HP = 100
const ENEMY_HP_PER_WAVE_MUL = 1.5
const ENEMY_ATTACK = 1
const ENEMY_ATTACK_INTERVAL = 1
const SPAWN_MARGIN = 30
const GAME_MARGIN_Y = 16
const MAX_ENEMIES = 64
const SPAWNS_PER_WAVE = 10
const MAX_WAVE = 20
const SPAWN_INTERVAL = 0.7
const WAVE_BREAK_DURATION = 10
const EXP_PER_KILL = 5
const EXP_BOSS = 20
const GOLD_PER_KILL = 1
const GOLD_BOSS = 5
const BOSS_HP_MUL = 6
const BOSS_SPEED_MUL = 0.7
const BASE_EXP_TO_NEXT = 10
const MAX_SKILL_SLOTS = 7
// 主动技能·嗜血：立即造成150%伤害，回复造成伤害的20%生命，随后3秒攻速×1.2，CD 4秒
const SKILL_XUE_DAMAGE_MUL = 1.5
const SKILL_XUE_HEAL_PCT = 0.2
const SKILL_XUE_BUFF_DURATION = 3
const SKILL_XUE_COOLDOWN = 4
// 旋风斩：对最多 5 个敌人造成 80% 伤害，CD 与顺劈 buff 时长一致
const SKILL_XUANFENG_DAMAGE_MUL = 0.8
const SKILL_XUANFENG_MAX_TARGETS = 5
const SKILL_XUANFENG_COOLDOWN = 5
const SHUNPI_BUFF_DURATION = SKILL_XUANFENG_COOLDOWN // 与旋风斩 CD 同步，同为 5s
const SHUNPI_DAMAGE_MUL = 0.6
const SHUNPI_EXTRA_TARGETS = 4
const MAX_EQUIP_SLOTS = 6
// 副属性：暴击（数值→暴击率）、极速（数值→攻速与 CD）
// 暴击率 = 暴击/(暴击+CRIT_RATE_DENOM)，如 100 暴击=50% 率；25 暴击≈20% 率
const CRIT_DAMAGE_MUL = 2
const CRIT_RATE_DENOM = 100
const HASTE_PCT_DENOM = 100
const MAX_LEARNED_SKILLS = 16
// 战士职业怒气（如狂暴战，CLASSES[x].hasRage）：上限 100，造成伤害获得、受到伤害获得，后续可消耗
const RAGE_MAX = 100
const RAGE_PER_DAMAGE = 5
const RAGE_ON_CRIT = 5
// RAGE_PER_HIT_TAKEN：部分战士可配置「受到攻击获得怒气」，当前未用
const RAGE_XUE_BONUS = 10 // 嗜血释放时额外获得
// 暴怒：消耗 100 怒气，造成 200% 伤害，无 CD，可触发顺劈
const SKILL_BAONU_ID = 16
const SKILL_BAONU_RAGE_COST = 100
const SKILL_BAONU_DAMAGE_MUL = 2

// 基础技能池（前 12 与 wasm-game 一致；13 嗜血；14、15 暴击/极速被动；16 旋风斩；17 暴怒）
const SKILL_XUE_ID = 12
const SKILL_XUANFENG_ID = 15
const BASE_SKILL_COUNT = 17
const SKILL_POOL = [
  { name: '强力一击', attackMul: 1.5, speedMul: 1.0 },
  { name: '攻速提升', attackMul: 1.0, speedMul: 1.4 },
  { name: '双倍打击', attackMul: 2.0, speedMul: 0.8 },
  { name: '锋芒', attackMul: 1.3, speedMul: 1.0 },
  { name: '连击', attackMul: 1.0, speedMul: 1.6 },
  { name: '重击', attackMul: 2.2, speedMul: 0.7 },
  { name: '轻刃', attackMul: 0.8, speedMul: 1.8 },
  { name: '破甲', attackMul: 1.6, speedMul: 1.0 },
  { name: '疾风', attackMul: 1.0, speedMul: 1.5 },
  { name: '致命', attackMul: 1.8, speedMul: 0.9 },
  { name: '均衡', attackMul: 1.2, speedMul: 1.2 },
  { name: '狂暴', attackMul: 1.4, speedMul: 1.3 },
  { name: '嗜血', attackMul: 1.0, speedMul: 1.0, isActive: true },
  { name: '暴击专精', attackMul: 1.0, speedMul: 1.0, critValueBonus: 25 },
  { name: '极速专精', attackMul: 1.0, speedMul: 1.0, hasteBonus: 20 },
  { name: '旋风斩', attackMul: 1.0, speedMul: 1.0, isActive: true },
  { name: '暴怒', attackMul: 1.0, speedMul: 1.0, isActive: true }
]

// 套装：名称、需求技能 id、需求描述、效果描述、攻击倍率、攻速倍率
const SYNERGIES = [
  { name: '刺客', req: [0, 3], requirement: '强力一击, 锋芒', effect: '攻击+15%, 攻速+10%', attackMul: 1.15, speedMul: 1.10 },
  { name: '战士', req: [0, 5], requirement: '强力一击, 重击', effect: '攻击+20%', attackMul: 1.20, speedMul: 1.00 },
  { name: '迅捷', req: [1, 4], requirement: '攻速提升, 连击', effect: '攻速+25%', attackMul: 1.00, speedMul: 1.25 },
  { name: '破势', req: [7, 9], requirement: '破甲, 致命', effect: '攻击+15%, 攻速+10%', attackMul: 1.15, speedMul: 1.10 },
  { name: '均衡之道', req: [6, 10], requirement: '轻刃, 均衡', effect: '攻击+10%, 攻速+20%', attackMul: 1.10, speedMul: 1.20 }
]

// 每个基础套装对应一个独立进阶卡池，激活该套装后才会在 3 选 1 中出现该池的卡
const ADVANCED_POOLS = [
  { name: '刺客', skills: [{ name: '影袭', attackMul: 1.7, speedMul: 1.25 }, { name: '割喉', attackMul: 2.0, speedMul: 1.0 }] },
  { name: '战士', skills: [{ name: '破军', attackMul: 2.2, speedMul: 0.85 }, { name: '碾压', attackMul: 2.5, speedMul: 0.75 }] },
  { name: '迅捷', skills: [{ name: '神速', attackMul: 1.0, speedMul: 1.9 }, { name: '残影', attackMul: 1.2, speedMul: 1.7 }] },
  { name: '破势', skills: [{ name: '裁决', attackMul: 2.3, speedMul: 0.9 }, { name: '崩解', attackMul: 2.0, speedMul: 1.1 }] },
  { name: '均衡之道', skills: [{ name: '圆融', attackMul: 1.4, speedMul: 1.4 }, { name: '无双', attackMul: 1.6, speedMul: 1.2 }] }
]
const ADVANCED_SKILLS_PER_POOL = 2
const TOTAL_SKILL_COUNT = BASE_SKILL_COUNT + SYNERGIES.length * ADVANCED_SKILLS_PER_POOL

function getAllSkills() {
  const list = SKILL_POOL.slice()
  for (let i = 0; i < ADVANCED_POOLS.length; i++)
    for (let j = 0; j < ADVANCED_POOLS[i].skills.length; j++)
      list.push(ADVANCED_POOLS[i].skills[j])
  return list
}

function getAdvancedPoolName(skillId) {
  if (skillId < BASE_SKILL_COUNT) return null
  const poolIndex = Math.floor((skillId - BASE_SKILL_COUNT) / ADVANCED_SKILLS_PER_POOL)
  return ADVANCED_POOLS[poolIndex].name
}

// 商店商品：名称、价格、描述（生命药水为百分比回复）
const SHOP_ITEMS = [
  { name: '生命药水', cost: 15, desc: '恢复 15% 最大生命', healPct: 0.15 },
  { name: '攻击药剂', cost: 25, desc: '攻击 +10%（永久）' },
  { name: '攻速药剂', cost: 25, desc: '攻速 +10%（永久）' },
  { name: '生命上限', cost: 40, desc: '最大生命 +20（永久）' },
  { name: '大生命药水', cost: 35, desc: '恢复 40% 最大生命', healPct: 0.40 }
]

// 装备定义（id 与 equipment_slots 中存的数字一致）：名称、攻击倍率、攻速倍率、生命上限加成；attackFlat 为 flat 攻击力，rageGainPct 为怒气获取+%；droppable 为是否可掉落
const EQUIPMENT_DEFS = [
  { id: 0, name: '利刃', attackMul: 1.10, speedMul: 1.0, maxHp: 0 },
  { id: 1, name: '轻靴', attackMul: 1.0, speedMul: 1.10, maxHp: 0 },
  { id: 2, name: '护甲', attackMul: 1.0, speedMul: 1.0, maxHp: 15 },
  { id: 3, name: '破军刃', attackMul: 1.15, speedMul: 1.0, maxHp: 0 },
  { id: 4, name: '灵巧护腕', attackMul: 1.0, speedMul: 1.12, maxHp: 0 },
  { id: 5, name: '铁壁', attackMul: 1.0, speedMul: 1.0, maxHp: 25 },
  { id: 6, name: '狂暴之握', attackMul: 1.08, speedMul: 1.08, maxHp: 0 },
  { id: 7, name: '疾风之靴', attackMul: 1.0, speedMul: 1.15, maxHp: 0 },
  { id: 8, name: '生命之种', attackMul: 1.05, speedMul: 1.0, maxHp: 20 },
  { id: 9, name: '狂暴战刃', attackMul: 1.0, speedMul: 1.0, maxHp: 0, attackFlat: 50, rageGainPct: 30, droppable: false }
]
const EQUIPMENT_DROP_RATE = 0.01 // 小怪击杀 1% 概率掉落装备
const FURY_WARRIOR_START_WEAPON_ID = 9

// 状态
let playerY = 100
let heroClass = DEFAULT_CLASS
let heroType = (CLASSES[DEFAULT_CLASS] && CLASSES[DEFAULT_CLASS].heroType) || 'str'
let playerStr = (CLASSES[DEFAULT_CLASS] && CLASSES[DEFAULT_CLASS].baseStr) || 15
let playerAgi = (CLASSES[DEFAULT_CLASS] && CLASSES[DEFAULT_CLASS].baseAgi) || 10
let playerInt = (CLASSES[DEFAULT_CLASS] && CLASSES[DEFAULT_CLASS].baseInt) || 10
let playerHp = PLAYER_MAX_HP
let playerMaxHp = PLAYER_MAX_HP
let playerAttackMul = 1.0
let playerSpeedMul = 1.0
let playerAttackFlat = 0
let playerCrit = 0
let playerHaste = 0
let playerRage = 0
let timeSinceAttack = 0
let gameOver = false
let lastTime = 0
let killCount = 0
let playerGold = 0
const DAMAGE_TYPE_NAMES = { normal: '普攻', xue: '嗜血', xuanfeng: '旋风斩', cleave: '顺劈', baonu: '暴怒' }
const DAMAGE_TYPE_COLORS = { '普攻': '#3b82f6', '嗜血': '#e8a84a', '旋风斩': '#a78bfa', '顺劈': '#22c55e', '暴怒': '#c2410c' }
let damageByType = { normal: 0, xue: 0, xuanfeng: 0, cleave: 0, baonu: 0 }
let hitCountByType = { normal: 0, xue: 0, xuanfeng: 0, cleave: 0, baonu: 0 }
let enemies = []
let timeSinceSpawn = 0
let wave = 1
let spawnsThisWave = 0
let waveBreakCountdown = 0
let skillXueCd = 0
let skillXueBuff = 0
let skillXuanFengCd = 0
let skillShunpiBuff = 0
let gameEnded = false
let gameState = 'playing' // 'title' | 'playing' | 'choosing_skill' | 'choosing_replace_target' | 'choosing_equip_replace' | 'shop'
let playerLevel = 1
let playerExp = 0
let playerExpToNext = BASE_EXP_TO_NEXT
let learned_skill_ids = []
let skill_choices = []
let skill_choice_count = 0
let skillChoiceRects = []
let skipRect = null
let refreshRect = null
let skillRefreshChances = 0
let pendingReplaceSkillId = null
let replaceSlotRects = []
let replaceCancelRect = null
let pendingDropEquipmentId = null
let equipReplaceSlotRects = []
let equipReplaceCancelRect = null
let shopButtonRect = null
let shopCloseRect = null
let shopBuyRects = []
let restartRect = null
let titleNewRect = null
let titleContinueRect = null
let firstFrame = true
let effects = []
let equipment_slots = (function () {
  const a = []
  for (let i = 0; i < MAX_EQUIP_SLOTS; i++) a.push(null)
  return a
})() // 装备栏：每格为 null 或装备 id（0~8）

function applyEquipmentEffect(equipId) {
  const def = EQUIPMENT_DEFS[equipId]
  if (!def) return
  if (def.attackMul > 1) playerAttackMul += (def.attackMul - 1)
  if (def.speedMul > 1) playerSpeedMul += (def.speedMul - 1)
  if (def.maxHp > 0) {
    playerMaxHp += def.maxHp
    playerHp += def.maxHp
  }
  if (def.attackFlat) playerAttackFlat += def.attackFlat
}

function removeEquipmentEffect(equipId) {
  const def = EQUIPMENT_DEFS[equipId]
  if (!def) return
  if (def.attackMul > 1) playerAttackMul -= (def.attackMul - 1)
  if (def.speedMul > 1) playerSpeedMul -= (def.speedMul - 1)
  if (def.maxHp > 0) {
    playerMaxHp -= def.maxHp
    playerHp = Math.min(playerHp, playerMaxHp)
  }
  if (def.attackFlat) playerAttackFlat -= def.attackFlat
}

function getRageGainMul() {
  let pct = 0
  for (let i = 0; i < equipment_slots.length; i++) {
    const def = equipment_slots[i] != null ? EQUIPMENT_DEFS[equipment_slots[i]] : null
    if (def && def.rageGainPct) pct += def.rageGainPct
  }
  return 1 + pct / 100
}

function tryDropEquipment() {
  if (Math.random() >= EQUIPMENT_DROP_RATE) return
  const droppableIds = EQUIPMENT_DEFS.filter(d => d.droppable !== false).map(d => d.id)
  if (droppableIds.length === 0) return
  const id = droppableIds[(Math.random() * droppableIds.length) | 0]
  for (let i = 0; i < MAX_EQUIP_SLOTS; i++) {
    if (equipment_slots[i] == null) {
      equipment_slots[i] = id
      applyEquipmentEffect(id)
      return
    }
  }
  pendingDropEquipmentId = id
  gameState = 'choosing_equip_replace'
}

function addDamage(type, amount) {
  if (damageByType[type] == null) damageByType[type] = 0
  damageByType[type] += amount
  if (hitCountByType[type] == null) hitCountByType[type] = 0
  hitCountByType[type] += 1
}

function getTotalDamage() {
  let sum = 0
  for (const k in damageByType) if (damageByType[k]) sum += damageByType[k]
  return sum
}

function getDamageStatsSorted() {
  return Object.entries(damageByType)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [DAMAGE_TYPE_NAMES[k] || k, v, hitCountByType[k] || 0])
}

function hasRageMechanic() {
  return !!(getHeroClass().hasRage)
}

function addRage(amount) {
  if (!hasRageMechanic()) return
  amount *= getRageGainMul()
  playerRage = Math.min(RAGE_MAX, playerRage + amount)
}

function playSound(name) {
  try {
    const audio = wx.createInnerAudioContext()
    audio.obeyMuteSwitch = false
    audio.src = '' // 可后续填入音效资源路径
    if (audio.src) audio.play()
  } catch (e) {}
}
const SAVE_KEY = 'td_roguelike_save'

function saveGame() {
  try {
    const data = {
      wave,
      spawnsThisWave,
      waveBreakCountdown,
      timeSinceSpawn,
      playerLevel,
      playerExp,
      playerExpToNext,
      playerStr,
      playerAgi,
      playerInt,
      heroType,
      heroClass,
      playerHp,
      playerMaxHp,
      playerGold,
      killCount,
      damageByType: { ...damageByType },
      hitCountByType: { ...hitCountByType },
      learned_skill_ids: learned_skill_ids.slice(),
      playerAttackMul,
      playerSpeedMul,
      playerAttackFlat,
      playerCrit,
      playerHaste,
      playerRage,
      gameEnded,
      gameOver,
      enemies: enemies.filter(e => e.alive).map(e => ({
        x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, speed: e.speed,
        attack: e.attack, attackCooldown: e.attackCooldown, isBoss: e.isBoss
      })),
      skillRefreshChances,
      equipment_slots: equipment_slots.slice(),
      pendingDropEquipmentId,
      skillXueCd,
      skillXueBuff,
      skillXuanFengCd,
      skillShunpiBuff
    }
    wx.setStorageSync(SAVE_KEY, JSON.stringify(data))
  } catch (err) {
    console.warn('saveGame failed', err)
  }
}

function loadGame() {
  try {
    const raw = wx.getStorageSync(SAVE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    wave = data.wave || 1
    spawnsThisWave = data.spawnsThisWave || 0
    waveBreakCountdown = data.waveBreakCountdown ?? 0
    timeSinceSpawn = data.timeSinceSpawn || 0
    playerLevel = data.playerLevel || 1
    playerExp = data.playerExp || 0
    playerExpToNext = data.playerExpToNext ?? BASE_EXP_TO_NEXT
    heroClass = data.heroClass || DEFAULT_CLASS
    const loadCls = CLASSES[heroClass] || CLASSES[DEFAULT_CLASS]
    heroType = data.heroType ?? loadCls.heroType
    playerStr = data.playerStr ?? loadCls.baseStr
    playerAgi = data.playerAgi ?? loadCls.baseAgi
    playerInt = data.playerInt ?? loadCls.baseInt
    playerHp = data.playerHp ?? playerMaxHp
    playerMaxHp = data.playerMaxHp ?? (HP_BASE + (data.playerStr ?? loadCls.baseStr) * HP_PER_STR)
    playerGold = data.playerGold || 0
    killCount = data.killCount || 0
    if (data.damageByType && typeof data.damageByType === 'object') {
      damageByType = { normal: 0, xue: 0, xuanfeng: 0, cleave: 0, baonu: 0, ...data.damageByType }
    }
    if (data.hitCountByType && typeof data.hitCountByType === 'object') {
      hitCountByType = { normal: 0, xue: 0, xuanfeng: 0, cleave: 0, baonu: 0, ...data.hitCountByType }
    }
    learned_skill_ids = Array.isArray(data.learned_skill_ids) ? data.learned_skill_ids : []
    playerAttackMul = data.playerAttackMul ?? 1
    playerSpeedMul = data.playerSpeedMul ?? 1
    playerAttackFlat = (data.playerAttackFlat ?? 0) | 0
    playerCrit = data.playerCrit ?? 0
    playerHaste = data.playerHaste ?? 0
    playerRage = Math.min(RAGE_MAX, (data.playerRage ?? 0) | 0)
    gameEnded = !!data.gameEnded
    gameOver = !!data.gameOver
    if (Array.isArray(data.enemies) && data.enemies.length > 0) {
      enemies = data.enemies.map(e => ({
        ...e,
        alive: true,
        attackCooldown: e.attackCooldown || 0
      }))
    } else {
      enemies = []
    }
    skillRefreshChances = Math.max(0, (data.skillRefreshChances || 0) | 0)
    if (Array.isArray(data.equipment_slots)) {
      equipment_slots = data.equipment_slots.slice(0, MAX_EQUIP_SLOTS)
      while (equipment_slots.length < MAX_EQUIP_SLOTS) equipment_slots.push(null)
    } else {
      equipment_slots = []
      for (let i = 0; i < MAX_EQUIP_SLOTS; i++) equipment_slots.push(null)
    }
    pendingDropEquipmentId = data.pendingDropEquipmentId != null ? data.pendingDropEquipmentId : null
    skillXueCd = data.skillXueCd ?? 0
    skillXueBuff = data.skillXueBuff ?? 0
    skillXuanFengCd = data.skillXuanFengCd ?? 0
    skillShunpiBuff = data.skillShunpiBuff ?? 0
    if (pendingDropEquipmentId != null) gameState = 'choosing_equip_replace'
    else if (gameOver || gameEnded) gameState = 'playing'
  } catch (err) {
    console.warn('loadGame failed', err)
  }
}

function updateLayout() {
  const w = canvas.width
  const h = canvas.height
  gameTop = TOP_SAFE_MARGIN
  const restH = h - TOP_SAFE_MARGIN
  gameHeight = Math.floor(restH * GAME_HEIGHT_RATIO)
  panelTop = gameTop + gameHeight
  playerY = gameTop + gameHeight / 2
}

// 攻击半径：保证半圆能覆盖游戏区上下边（玩家在垂直中心）
function getAttackRadius() {
  return Math.max(80, gameHeight / 2 * 1.05)
}

function isLearned(skillId) {
  return learned_skill_ids.indexOf(skillId) >= 0
}

function isSynergyActive(idx) {
  if (idx < 0 || idx >= SYNERGIES.length) return false
  const s = SYNERGIES[idx]
  for (let i = 0; i < s.req.length; i++)
    if (!isLearned(s.req[i])) return false
  return true
}

function isSkillConsumedBySynergy(skillId) {
  if (skillId >= BASE_SKILL_COUNT) return false
  for (let i = 0; i < SYNERGIES.length; i++) {
    if (!isSynergyActive(i)) continue
    const s = SYNERGIES[i]
    for (let j = 0; j < s.req.length; j++)
      if (s.req[j] === skillId) return true
  }
  return false
}

function advancedPoolUnlocked() {
  for (let i = 0; i < SYNERGIES.length; i++)
    if (isSynergyActive(i)) return true
  return false
}

function getUnlockedAdvancedPoolNames() {
  const names = []
  for (let i = 0; i < SYNERGIES.length; i++)
    if (isSynergyActive(i)) names.push(ADVANCED_POOLS[i].name)
  return names
}

function getEffectiveSlotsUsed() {
  let n = 0
  for (let i = 0; i < learned_skill_ids.length; i++)
    if (!isSkillConsumedBySynergy(learned_skill_ids[i])) n++
  return n
}

// 返回当前占用栏位的技能列表（顺序与 learned 一致，被套装吞噬的不占位故不在此列）
function getSkillsInSlots() {
  const list = []
  const allSkills = getAllSkills()
  for (let i = 0; i < learned_skill_ids.length; i++) {
    const id = learned_skill_ids[i]
    if (isSkillConsumedBySynergy(id)) continue
    const sk = allSkills[id]
    if (!sk) continue
    const isAdvanced = id >= BASE_SKILL_COUNT
    list.push({
      skillId: id,
      name: sk.name,
      isAdvanced,
      isActive: !!(sk.isActive),
      poolName: isAdvanced ? getAdvancedPoolName(id) : null
    })
  }
  return list
}

// 返回指定栏位索引（0 到 MAX_SKILL_SLOTS-1）对应的技能 id，用于替换
function getSkillIdAtSlot(slotIndex) {
  const list = getSkillsInSlots()
  if (slotIndex < 0 || slotIndex >= list.length) return null
  return list[slotIndex].skillId
}

// 若选择技能 id 后能激活的套装（仅基础技能参与套装）
function getSynergiesIfChoose(skillId) {
  if (skillId >= BASE_SKILL_COUNT) return []
  const list = []
  for (let i = 0; i < SYNERGIES.length; i++) {
    const s = SYNERGIES[i]
    if (!s.req.includes(skillId)) continue
    const other = s.req.find(r => r !== skillId)
    if (isLearned(other)) list.push(s.name)
  }
  return list
}

// 每个套装的收集情况：{ name, status: 'active'|'lack1'|'none', lackName? }
function getSynergyProgress() {
  const result = []
  for (let i = 0; i < SYNERGIES.length; i++) {
    const s = SYNERGIES[i]
    const learned = s.req.filter(id => isLearned(id)).length
    if (learned === s.req.length) {
      result.push({ name: s.name, status: 'active' })
    } else if (learned === 1) {
      const lackId = s.req.find(id => !isLearned(id))
      result.push({ name: s.name, status: 'lack1', lackName: SKILL_POOL[lackId].name })
    } else {
      result.push({ name: s.name, status: 'none' })
    }
  }
  return result
}

function fillSkillChoices() {
  const available = []
  for (let i = 0; i < SKILL_POOL.length; i++)
    if (!isLearned(i)) available.push(i)
  for (let i = 0; i < SYNERGIES.length; i++) {
    if (!isSynergyActive(i)) continue
    for (let j = 0; j < ADVANCED_SKILLS_PER_POOL; j++) {
      const id = BASE_SKILL_COUNT + i * ADVANCED_SKILLS_PER_POOL + j
      if (!isLearned(id)) available.push(id)
    }
  }
  skill_choices = []
  const n = Math.min(3, available.length)
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (available.length - i))
    ;[available[i], available[j]] = [available[j], available[i]]
    skill_choices.push(available[i])
  }
  skill_choice_count = n
}

function getHeroClass() {
  return CLASSES[heroClass] || CLASSES[DEFAULT_CLASS]
}

function getMainStat() {
  if (heroType === 'str') return playerStr
  if (heroType === 'agi') return playerAgi
  return playerInt
}

function getBaseMaxHpFromStr() {
  return HP_BASE + playerStr * HP_PER_STR
}

function getEffectiveCrit() {
  return playerCrit + getLearnedCritValue()
}

function getLearnedCritValue() {
  const all = getAllSkills()
  let sum = 0
  for (let i = 0; i < learned_skill_ids.length; i++) {
    const sk = all[learned_skill_ids[i]]
    if (sk && sk.critValueBonus) sum += sk.critValueBonus
  }
  return sum
}

function getLearnedHasteBonus() {
  const all = getAllSkills()
  let sum = 0
  for (let i = 0; i < learned_skill_ids.length; i++) {
    const sk = all[learned_skill_ids[i]]
    if (sk && sk.hasteBonus) sum += sk.hasteBonus
  }
  return sum
}

function getCritChance() {
  const crit = getEffectiveCrit()
  if (crit <= 0) return 0
  return Math.min(1, crit / (crit + CRIT_RATE_DENOM))
}

function applyCrit(damage) {
  const isCrit = Math.random() < getCritChance()
  return { damage: isCrit ? damage * CRIT_DAMAGE_MUL : damage, isCrit }
}

function computeAttack() {
  const mainStat = getMainStat()
  const baseAttack = MAIN_STAT_ATTACK_BASE + mainStat * MAIN_STAT_ATTACK_PER_POINT
  const all = getAllSkills()
  let mul = 1.0
  for (let i = 0; i < learned_skill_ids.length; i++) {
    const id = learned_skill_ids[i]
    if (id >= 0 && id < all.length && !all[id].isActive) mul *= all[id].attackMul
  }
  for (let i = 0; i < SYNERGIES.length; i++)
    if (isSynergyActive(i)) mul *= SYNERGIES[i].attackMul
  return baseAttack * mul * playerAttackMul + playerAttackFlat
}

function computeAttackInterval() {
  const baseInterval = BASE_ATTACK_INTERVAL
  const all = getAllSkills()
  let mul = 1.0
  for (let i = 0; i < learned_skill_ids.length; i++) {
    const id = learned_skill_ids[i]
    if (id >= 0 && id < all.length && !all[id].isActive) mul *= all[id].speedMul
  }
  for (let i = 0; i < SYNERGIES.length; i++)
    if (isSynergyActive(i)) mul *= SYNERGIES[i].speedMul
  let interval = baseInterval / mul / playerSpeedMul
  if (skillXueBuff > 0) interval /= 1.2
  const effectiveHaste = playerHaste + getLearnedHasteBonus()
  if (effectiveHaste > 0) interval /= (1 + effectiveHaste / HASTE_PCT_DENOM)
  return interval
}

function castSkillXue() {
  if (skillXueCd > 0 || gameOver || gameEnded) return
  const target = findTarget()
  if (!target) return
  const critResult = applyCrit(computeAttack() * SKILL_XUE_DAMAGE_MUL)
  addDamage('xue', critResult.damage)
  target.hp -= critResult.damage
  effects.push({ x: target.x, y: target.y, type: 'hit', life: 0.2 })
  if (critResult.isCrit) effects.push({ x: target.x, y: target.y, type: 'crit', life: 0.6 })
  if (target.hp <= 0) {
    target.alive = false
    killCount++
    playerGold += target.isBoss ? GOLD_BOSS : GOLD_PER_KILL
    giveExp(target.isBoss ? EXP_BOSS : EXP_PER_KILL)
    if (!target.isBoss) tryDropEquipment()
    playSound('kill')
  } else {
    playSound('hit')
  }
  playerHp = Math.min(playerMaxHp, playerHp + critResult.damage * SKILL_XUE_HEAL_PCT)
  addRage(RAGE_XUE_BONUS)
  applyCleaveDamage(target, critResult.damage)
  effects.push({ type: 'shout', text: '嗜血', x: PLAYER_X, y: playerY, life: 1.1, maxLife: 1.1, stackIndex: getShoutStackIndex() })
  skillXueBuff = SKILL_XUE_BUFF_DURATION
  skillXueCd = SKILL_XUE_COOLDOWN
}

function castSkillXuanFeng() {
  if (skillXuanFengCd > 0 || gameOver || gameEnded) return
  if (!isLearned(SKILL_XUANFENG_ID)) return
  const targets = getEnemiesInRange(SKILL_XUANFENG_MAX_TARGETS)
  if (targets.length === 0) return
  const baseDmg = computeAttack() * SKILL_XUANFENG_DAMAGE_MUL
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]
    const critResult = applyCrit(baseDmg)
    addDamage('xuanfeng', critResult.damage)
    target.hp -= critResult.damage
    effects.push({ x: target.x, y: target.y, type: 'hit', life: 0.2 })
    if (critResult.isCrit) effects.push({ x: target.x, y: target.y, type: 'crit', life: 0.6 })
    if (target.hp <= 0) {
      target.alive = false
      killCount++
      playerGold += target.isBoss ? GOLD_BOSS : GOLD_PER_KILL
      giveExp(target.isBoss ? EXP_BOSS : EXP_PER_KILL)
      if (!target.isBoss) tryDropEquipment()
      playSound('kill')
    } else {
      playSound('hit')
    }
  }
  effects.push({ type: 'shout', text: '旋风斩', x: PLAYER_X, y: playerY, life: 1.1, maxLife: 1.1, stackIndex: getShoutStackIndex() })
  skillXuanFengCd = SKILL_XUANFENG_COOLDOWN
  skillShunpiBuff = SHUNPI_BUFF_DURATION
}

function castSkillBaoNu() {
  if (gameOver || gameEnded) return
  if (!isLearned(SKILL_BAONU_ID) || !hasRageMechanic()) return
  if (playerRage < SKILL_BAONU_RAGE_COST) return
  const target = findTarget()
  if (!target) return
  playerRage = Math.max(0, playerRage - SKILL_BAONU_RAGE_COST)
  const critResult = applyCrit(computeAttack() * SKILL_BAONU_DAMAGE_MUL)
  addDamage('baonu', critResult.damage)
  target.hp -= critResult.damage
  effects.push({ x: target.x, y: target.y, type: 'hit', life: 0.2 })
  if (critResult.isCrit) effects.push({ x: target.x, y: target.y, type: 'crit', life: 0.6 })
  if (target.hp <= 0) {
    target.alive = false
    killCount++
    playerGold += target.isBoss ? GOLD_BOSS : GOLD_PER_KILL
    giveExp(target.isBoss ? EXP_BOSS : EXP_PER_KILL)
    if (!target.isBoss) tryDropEquipment()
    playSound('kill')
  } else {
    playSound('hit')
  }
  applyCleaveDamage(target, critResult.damage)
  effects.push({ type: 'shout', text: '暴怒', x: PLAYER_X, y: playerY, life: 1.1, maxLife: 1.1, stackIndex: getShoutStackIndex() })
}

function getShoutStackIndex() {
  let n = 0
  for (let i = 0; i < effects.length; i++) if (effects[i].type === 'shout' && effects[i].life > 0) n++
  return n
}

// 顺劈：对主目标外的最多 4 个范围内敌人造成 mainDamage * SHUNPI_DAMAGE_MUL 伤害（不重复暴击）
function applyCleaveDamage(mainTarget, mainDamage) {
  if (skillShunpiBuff <= 0) return
  const allInRange = getEnemiesInRange(SKILL_XUANFENG_MAX_TARGETS + SHUNPI_EXTRA_TARGETS)
  const others = allInRange.filter(e => e !== mainTarget && e.alive).slice(0, SHUNPI_EXTRA_TARGETS)
  const cleaveDmg = mainDamage * SHUNPI_DAMAGE_MUL
  for (let i = 0; i < others.length; i++) {
    const e = others[i]
    addDamage('cleave', cleaveDmg)
    e.hp -= cleaveDmg
    effects.push({ x: e.x, y: e.y, type: 'hit', life: 0.15 })
    if (e.hp <= 0) {
      e.alive = false
      killCount++
      playerGold += e.isBoss ? GOLD_BOSS : GOLD_PER_KILL
      giveExp(e.isBoss ? EXP_BOSS : EXP_PER_KILL)
      if (!e.isBoss) tryDropEquipment()
      playSound('kill')
    } else {
      playSound('hit')
    }
  }
}

function giveExp(amount) {
  playerExp += amount
  if (playerExp < playerExpToNext) return
  playerExp -= playerExpToNext
  const cls = getHeroClass()
  playerStr += cls.strPerLevel || 0
  playerAgi += cls.agiPerLevel || 0
  playerInt += cls.intPerLevel || 0
  const extraMaxHp = playerMaxHp - getBaseMaxHpFromStr()
  playerMaxHp = getBaseMaxHpFromStr() + Math.max(0, extraMaxHp)
  playerHp = Math.min(playerHp, playerMaxHp)
  playerLevel++
  playerExpToNext = BASE_EXP_TO_NEXT + playerLevel * 5
  gameState = 'choosing_skill'
  fillSkillChoices()
  playSound('levelup')
}

function chooseSkill(index) {
  if (gameState !== 'choosing_skill') return
  if (index < 0 || index >= skill_choice_count) return
  const id = skill_choices[index]
  if (getEffectiveSlotsUsed() >= MAX_SKILL_SLOTS) {
    pendingReplaceSkillId = id
    gameState = 'choosing_replace_target'
    return
  }
  learned_skill_ids.push(id)
  gameState = 'playing'
}

function replaceSkillAtSlot(slotIndex) {
  if (gameState !== 'choosing_replace_target' || pendingReplaceSkillId == null) return
  const toRemove = getSkillIdAtSlot(slotIndex)
  if (toRemove == null) return
  learned_skill_ids = learned_skill_ids.filter(sid => sid !== toRemove)
  learned_skill_ids.push(pendingReplaceSkillId)
  pendingReplaceSkillId = null
  gameState = 'playing'
}

function cancelReplaceSkill() {
  if (gameState !== 'choosing_replace_target') return
  pendingReplaceSkillId = null
  gameState = 'choosing_skill'
}

function replaceEquipAtSlot(slotIndex) {
  if (gameState !== 'choosing_equip_replace' || pendingDropEquipmentId == null || slotIndex < 0 || slotIndex >= MAX_EQUIP_SLOTS) return
  const oldId = equipment_slots[slotIndex]
  if (oldId != null) removeEquipmentEffect(oldId)
  equipment_slots[slotIndex] = pendingDropEquipmentId
  applyEquipmentEffect(pendingDropEquipmentId)
  pendingDropEquipmentId = null
  gameState = 'playing'
}

function cancelEquipReplace() {
  if (gameState !== 'choosing_equip_replace') return
  pendingDropEquipmentId = null
  gameState = 'playing'
}

function skipSkillChoice() {
  if (gameState !== 'choosing_skill') return
  skillRefreshChances += 1
  gameState = 'playing'
}

function refreshSkillChoices() {
  if (gameState !== 'choosing_skill' || skillRefreshChances <= 0) return
  skillRefreshChances -= 1
  fillSkillChoices()
  playSound('hit')
}

function resetGame() {
  heroClass = DEFAULT_CLASS
  const cls = getHeroClass()
  heroType = cls.heroType
  playerStr = cls.baseStr
  playerAgi = cls.baseAgi
  playerInt = cls.baseInt
  playerMaxHp = getBaseMaxHpFromStr()
  playerHp = playerMaxHp
  playerAttackMul = 1.0
  playerSpeedMul = 1.0
  playerCrit = 0
  playerHaste = 0
  playerRage = 0
  timeSinceAttack = 0
  gameOver = false
  killCount = 0
  playerGold = 0
  damageByType = { normal: 0, xue: 0, xuanfeng: 0, cleave: 0, baonu: 0 }
  hitCountByType = { normal: 0, xue: 0, xuanfeng: 0, cleave: 0, baonu: 0 }
  enemies = []
  timeSinceSpawn = 0
  wave = 1
  spawnsThisWave = 0
  waveBreakCountdown = 0
  skillXueCd = 0
  skillXueBuff = 0
  skillXuanFengCd = 0
  skillShunpiBuff = 0
  gameEnded = false
  gameState = 'playing'
  playerLevel = 1
  playerExp = 0
  playerExpToNext = BASE_EXP_TO_NEXT
  learned_skill_ids = (getHeroClass().startSkillIds || []).slice()
  skill_choices = []
  skill_choice_count = 0
  skillRefreshChances = 0
  pendingReplaceSkillId = null
  pendingDropEquipmentId = null
  playerAttackFlat = 0
  equipment_slots = []
  for (let i = 0; i < MAX_EQUIP_SLOTS; i++) equipment_slots.push(null)
  if (heroClass === 'fury_warrior') {
    equipment_slots[0] = FURY_WARRIOR_START_WEAPON_ID
    applyEquipmentEffect(FURY_WARRIOR_START_WEAPON_ID)
  }
  effects = []
  try { wx.removeStorageSync(SAVE_KEY) } catch (e) {}
}

function buyShopItem(i) {
  if (gameState !== 'shop' || i < 0 || i >= SHOP_ITEMS.length) return false
  const item = SHOP_ITEMS[i]
  if (playerGold < item.cost) return false
  playerGold -= item.cost
  playSound('buy')
  if (i === 0) {
    const heal = (item.healPct != null ? item.healPct : 0.15) * playerMaxHp
    playerHp = Math.min(playerHp + heal, playerMaxHp)
  } else if (i === 1) {
    playerAttackMul += 0.10
  } else if (i === 2) {
    playerSpeedMul += 0.10
  } else if (i === 3) {
    playerMaxHp += 20
    playerHp += 20
  } else if (i === 4) {
    const heal = (item.healPct != null ? item.healPct : 0.40) * playerMaxHp
    playerHp = Math.min(playerHp + heal, playerMaxHp)
  }
  return true
}

function spawnEnemy() {
  if (gameEnded) return
  let slot = -1
  for (let i = 0; i < enemies.length; i++) {
    if (!enemies[i].alive) {
      slot = i
      break
    }
  }
  if (slot < 0 && enemies.length >= MAX_ENEMIES) return
  const w = canvas.width
  const yMin = gameTop + GAME_MARGIN_Y
  const yMax = gameTop + gameHeight - GAME_MARGIN_Y
  const isBoss = (wave % 5 === 0) && (spawnsThisWave === 0)
  const waveHp = ENEMY_MAX_HP * Math.pow(ENEMY_HP_PER_WAVE_MUL, wave - 1)
  const maxHp = isBoss ? waveHp * BOSS_HP_MUL : waveHp
  const speed = isBoss ? ENEMY_SPEED * BOSS_SPEED_MUL : ENEMY_SPEED
  const e = {
    x: w - SPAWN_MARGIN,
    y: yMin + Math.random() * (yMax - yMin),
    hp: maxHp,
    maxHp: maxHp,
    speed: speed,
    attack: ENEMY_ATTACK,
    attackCooldown: 0,
    alive: true,
    isBoss: isBoss
  }
  if (slot >= 0) enemies[slot] = e
  else enemies.push(e)
  spawnsThisWave++
  if (spawnsThisWave >= SPAWNS_PER_WAVE) {
    spawnsThisWave = 0
    wave++
    if (wave > MAX_WAVE) gameEnded = true
    else waveBreakCountdown = WAVE_BREAK_DURATION
    saveGame()
  }
}

function isInAttackRange(ex) {
  const r = getAttackRadius()
  const dx = ex.x - PLAYER_X
  const dy = ex.y - playerY
  if (dx < 0) return false
  return dx * dx + dy * dy <= r * r
}

function findTarget() {
  let best = null
  let bestD2 = 1e9
  const r2 = getAttackRadius() * getAttackRadius()
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]
    if (!e.alive) continue
    const dx = e.x - PLAYER_X
    const dy = e.y - playerY
    if (dx < 0) continue
    const d2 = dx * dx + dy * dy
    if (d2 <= r2 && d2 < bestD2) {
      bestD2 = d2
      best = e
    }
  }
  return best
}

// 返回攻击范围内最多 maxN 个敌人，按距离从近到远
function getEnemiesInRange(maxN) {
  const r2 = getAttackRadius() * getAttackRadius()
  const list = []
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]
    if (!e.alive) continue
    const dx = e.x - PLAYER_X
    const dy = e.y - playerY
    if (dx < 0) continue
    const d2 = dx * dx + dy * dy
    if (d2 <= r2) list.push({ e, d2 })
  }
  list.sort((a, b) => a.d2 - b.d2)
  return list.slice(0, maxN).map(x => x.e)
}

function hitTest(x, y, rect) {
  if (!rect) return false
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
}

wx.onTouchEnd(function (e) {
  const t = e.changedTouches && e.changedTouches[0]
  if (!t) return
  const x = t.x !== undefined ? t.x : t.clientX
  const y = t.y !== undefined ? t.y : t.clientY
  if (gameState === 'playing') {
    if (hitTest(x, y, shopButtonRect)) {
      gameState = 'shop'
      return
    }
  } else if (gameState === 'choosing_skill') {
    for (let i = 0; i < skillChoiceRects.length; i++) {
      if (hitTest(x, y, skillChoiceRects[i])) {
        chooseSkill(i)
        return
      }
    }
    if (hitTest(x, y, skipRect)) {
      skipSkillChoice()
      return
    }
    if (hitTest(x, y, refreshRect)) refreshSkillChoices()
  } else if (gameState === 'choosing_replace_target') {
    for (let i = 0; i < replaceSlotRects.length; i++) {
      if (hitTest(x, y, replaceSlotRects[i])) {
        replaceSkillAtSlot(i)
        return
      }
    }
    if (hitTest(x, y, replaceCancelRect)) cancelReplaceSkill()
  } else if (gameState === 'choosing_equip_replace') {
    for (let i = 0; i < equipReplaceSlotRects.length; i++) {
      if (hitTest(x, y, equipReplaceSlotRects[i])) {
        replaceEquipAtSlot(i)
        return
      }
    }
    if (hitTest(x, y, equipReplaceCancelRect)) cancelEquipReplace()
  } else if (gameState === 'shop') {
    if (hitTest(x, y, shopCloseRect)) {
      gameState = 'playing'
      return
    }
    for (let i = 0; i < shopBuyRects.length; i++) {
      if (hitTest(x, y, shopBuyRects[i])) {
        buyShopItem(i)
        return
      }
    }
  }
  if (gameState === 'title') {
    if (hitTest(x, y, titleNewRect)) {
      try { wx.removeStorageSync(SAVE_KEY) } catch (e) {}
      resetGame()
      gameState = 'playing'
    } else if (hitTest(x, y, titleContinueRect)) {
      loadGame()
      gameState = 'playing'
    }
    return
  }
  if ((gameOver || gameEnded) && hitTest(x, y, restartRect)) {
    resetGame()
  }
})

function loop(timestamp) {
  const dt = lastTime ? (timestamp - lastTime) / 1000 : 0.016
  lastTime = timestamp

  const w = canvas.width
  const h = canvas.height
  if (firstFrame) {
    firstFrame = false
    try {
      if (wx.getStorageSync(SAVE_KEY)) gameState = 'title'
    } catch (e) {}
  }
  updateLayout()

  if (gameState === 'title') {
    drawTitleScreen(w, h)
    requestAnimationFrame(loop)
    return
  }

  if (gameOver) {
    drawGameOverScreen(w, h)
    requestAnimationFrame(loop)
    return
  }
  if (gameEnded) {
    drawVictoryScreen(w, h)
    requestAnimationFrame(loop)
    return
  }

  if (gameState === 'choosing_skill') {
    drawSkillChoiceOverlay(w, h)
    requestAnimationFrame(loop)
    return
  }
  if (gameState === 'choosing_replace_target') {
    drawReplaceTargetOverlay(w, h)
    requestAnimationFrame(loop)
    return
  }
  if (gameState === 'choosing_equip_replace') {
    drawGame(w, h)
    drawPanel(w, h)
    drawEquipReplaceOverlay(w, h)
    requestAnimationFrame(loop)
    return
  }
  if (gameState === 'shop') {
    drawGame(w, h)
    drawPanel(w, h)
    drawShopOverlay(w, h)
    requestAnimationFrame(loop)
    return
  }

  // 波次间隔倒计时或按波次生成怪
  if (!gameEnded) {
    if (waveBreakCountdown > 0) {
      waveBreakCountdown -= dt
      if (waveBreakCountdown <= 0) waveBreakCountdown = 0
    } else {
      timeSinceSpawn += dt
      if (timeSinceSpawn >= SPAWN_INTERVAL) {
        timeSinceSpawn = 0
        spawnEnemy()
      }
    }
  }

  const effectiveHaste = playerHaste + getLearnedHasteBonus()
  const hasteFactor = 1 + effectiveHaste / HASTE_PCT_DENOM
  skillXueCd = Math.max(0, skillXueCd - dt * hasteFactor)
  skillXueBuff = Math.max(0, skillXueBuff - dt)
  skillXuanFengCd = Math.max(0, skillXuanFengCd - dt * hasteFactor)
  skillShunpiBuff = Math.max(0, skillShunpiBuff - dt)
  if (skillXueCd <= 0 && findTarget()) castSkillXue()
  if (skillXuanFengCd <= 0 && getEnemiesInRange(1).length > 0) castSkillXuanFeng()
  if (isLearned(SKILL_BAONU_ID) && playerRage >= SKILL_BAONU_RAGE_COST && findTarget()) castSkillBaoNu()

  const critResult = applyCrit(computeAttack())
  const interval = computeAttackInterval()
  timeSinceAttack += dt
  if (timeSinceAttack >= interval) {
    const target = findTarget()
    if (target) {
      addDamage('normal', critResult.damage)
      target.hp -= critResult.damage
      addRage(RAGE_PER_DAMAGE)
      if (critResult.isCrit) addRage(RAGE_ON_CRIT)
      timeSinceAttack = 0
      if (target.hp <= 0) {
        effects.push({ x: target.x, y: target.y, type: 'hit', life: 0.2 })
        if (critResult.isCrit) effects.push({ x: target.x, y: target.y, type: 'crit', life: 0.6 })
        target.alive = false
        killCount++
        playerGold += target.isBoss ? GOLD_BOSS : GOLD_PER_KILL
        giveExp(target.isBoss ? EXP_BOSS : EXP_PER_KILL)
        if (!target.isBoss) tryDropEquipment()
        playSound('kill')
      } else {
        effects.push({ x: target.x, y: target.y, type: 'hit', life: 0.12 })
        if (critResult.isCrit) effects.push({ x: target.x, y: target.y, type: 'crit', life: 0.6 })
        playSound('hit')
      }
    }
  }

  let playerHitThisFrame = false
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]
    if (!e.alive) continue
    if (e.x > REACH_PLAYER_X) {
      e.x -= e.speed * dt
      if (e.x < REACH_PLAYER_X) e.x = REACH_PLAYER_X
    } else {
      e.attackCooldown -= dt
      if (e.attackCooldown <= 0) {
        e.attackCooldown = ENEMY_ATTACK_INTERVAL
        playerHp -= e.attack
        if (playerHp <= 0) {
          playerHp = 0
          gameOver = true
          saveGame()
        }
        playerHitThisFrame = true
      }
    }
  }
  if (playerHitThisFrame) {
    effects.push({ x: PLAYER_X, y: playerY, type: 'hurt', life: 0.25 })
    playSound('hurt')
  }

  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]
    const decay = Math.min(dt, 0.05)
    e.life -= decay
    if (e.life <= 0) effects.splice(i, 1)
  }

  drawGame(w, h)
  drawPanel(w, h)
  requestAnimationFrame(loop)
}

function drawTitleScreen(w, h) {
  ctx.fillStyle = UI.bg
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = UI.primary
  ctx.font = 'bold 26px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('塔防 Roguelike', w / 2, h * 0.30)
  ctx.fillStyle = UI.textDim
  ctx.font = '14px sans-serif'
  ctx.fillText('检测到上次进度，请选择', w / 2, h * 0.38)
  const btnW = 160
  const btnH = 48
  const gap = 24
  const totalW = btnW * 2 + gap
  const leftX = (w - totalW) / 2
  const btnY = h * 0.50
  roundRect(leftX, btnY, btnW, btnH, UI.radius)
  ctx.fillStyle = UI.primary
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.textBaseline = 'middle'
  ctx.fillStyle = UI.bg
  ctx.font = 'bold 16px sans-serif'
  ctx.fillText('新游戏', leftX + btnW / 2, btnY + btnH / 2)
  titleNewRect = { x: leftX, y: btnY, w: btnW, h: btnH }
  const contX = leftX + btnW + gap
  roundRect(contX, btnY, btnW, btnH, UI.radius)
  ctx.fillStyle = UI.bgCard
  ctx.fill()
  ctx.strokeStyle = UI.border
  ctx.stroke()
  ctx.fillStyle = UI.text
  ctx.fillText('继续游戏', contX + btnW / 2, btnY + btnH / 2)
  titleContinueRect = { x: contX, y: btnY, w: btnW, h: btnH }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

function drawGameOverScreen(w, h) {
  ctx.fillStyle = UI.bg
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = UI.danger
  ctx.font = 'bold 28px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('游戏结束', w / 2, h / 2 - 40)
  ctx.fillStyle = UI.textDim
  ctx.font = '16px sans-serif'
  ctx.fillText('击杀 ' + killCount + '  ·  波次 ' + wave + '  ·  总伤害 ' + Math.round(getTotalDamage()), w / 2, h / 2 - 8)
  const sorted = getDamageStatsSorted()
  if (sorted.length > 0) {
    ctx.font = '13px sans-serif'
    ctx.fillText(sorted.map(([name, val]) => name + ' ' + Math.round(val)).join('  ·  '), w / 2, h / 2 + 12)
  }
  drawRestartButton(w, h)
  ctx.textAlign = 'left'
}

function drawVictoryScreen(w, h) {
  ctx.fillStyle = UI.bg
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = UI.success
  ctx.font = 'bold 28px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('通关！', w / 2, h / 2 - 52)
  ctx.fillStyle = UI.textDim
  ctx.font = '15px sans-serif'
  ctx.fillText('击杀 ' + killCount + '  ·  等级 ' + playerLevel + '  ·  金币 ' + playerGold, w / 2, h / 2 - 22)
  ctx.fillText('总伤害 ' + Math.round(getTotalDamage()) + '  ·  技能 ' + learned_skill_ids.length + '  ·  技能栏 ' + getEffectiveSlotsUsed() + '/' + MAX_SKILL_SLOTS, w / 2, h / 2 + 4)
  const sorted = getDamageStatsSorted()
  if (sorted.length > 0) {
    ctx.font = '13px sans-serif'
    ctx.fillText(sorted.map(([name, val]) => name + ' ' + Math.round(val)).join('  ·  '), w / 2, h / 2 + 26)
  }
  drawRestartButton(w, h)
  ctx.textAlign = 'left'
}

function drawRestartButton(w, h) {
  const btnW = 140
  const btnH = 44
  const x = (w - btnW) / 2
  const y = h / 2 + 48
  roundRect(x, y, btnW, btnH, UI.radius)
  ctx.fillStyle = UI.primary
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.textBaseline = 'middle'
  ctx.fillStyle = UI.bg
  ctx.font = 'bold 17px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('再来一局', w / 2, y + btnH / 2)
  restartRect = { x, y, w: btnW, h: btnH }
  ctx.textBaseline = 'alphabetic'
}

function drawSkillChoiceOverlay(w, h) {
  ctx.fillStyle = 'rgba(15,14,20,0.92)'
  ctx.fillRect(0, 0, w, h)

  const cardW = (w - 16 * 4) / 3
  const cardH = 98
  const blockTop = 24
  const titleH = 48
  const cardsH = cardH + 8
  const skipH = 44
  const synTitleH = 22
  const synLineH = 18
  const synCount = 5
  const totalH = blockTop + titleH + cardsH + skipH + synTitleH + synCount * synLineH + 16
  const startY = (h - totalH) / 2

  let y = startY + blockTop
  ctx.fillStyle = UI.primary
  ctx.font = 'bold 18px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('升级！选择一项技能', w / 2, y + 20)
  y += titleH
  ctx.fillStyle = UI.textDim
  ctx.font = '12px sans-serif'
  ctx.fillText('技能栏 ' + getEffectiveSlotsUsed() + '/' + MAX_SKILL_SLOTS, w / 2, y + 12)
  const slotsFull = getEffectiveSlotsUsed() >= MAX_SKILL_SLOTS
  const unlockedNames = getUnlockedAdvancedPoolNames()
  if (slotsFull) {
    ctx.fillStyle = UI.primary
    ctx.fillText('技能栏已满，选择一张卡将替换已有技能', w / 2, y + 26)
  }
  if (unlockedNames.length > 0) {
    ctx.fillStyle = UI.textMuted
    ctx.fillText('已开启：' + unlockedNames.join('、') + ' 进阶卡池', w / 2, y + (slotsFull ? 40 : 26))
  }
  if (slotsFull && unlockedNames.length > 0) y += 54
  else if (slotsFull) y += 40
  else if (unlockedNames.length > 0) y += 36
  else y += 28

  const cardY = y
  skillChoiceRects = []
  const allSkills = getAllSkills()
  for (let i = 0; i < skill_choice_count; i++) {
    const x = 16 + i * (16 + cardW)
    const id = skill_choices[i]
    const isAdvanced = id >= BASE_SKILL_COUNT
    roundRect(x, cardY, cardW, cardH, UI.radiusSm)
    ctx.fillStyle = isAdvanced ? UI.bgCardAlt : UI.bgCard
    ctx.fill()
    ctx.strokeStyle = isAdvanced ? UI.primary : UI.border
    ctx.lineWidth = 1.5
    ctx.stroke()
    const sk = allSkills[id]
    if (isAdvanced) {
      const poolName = getAdvancedPoolName(id)
      ctx.fillStyle = UI.primary
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(poolName ? poolName + '·进阶' : '进阶', x + cardW / 2, cardY + 14)
    }
    ctx.fillStyle = isAdvanced ? UI.primary : UI.text
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText(sk.name, x + cardW / 2, cardY + (isAdvanced ? 28 : 26))
    ctx.fillStyle = UI.textDim
    ctx.font = '11px sans-serif'
    ctx.fillText('攻×' + sk.attackMul + ' 速×' + sk.speedMul, x + cardW / 2, cardY + 50)
    const canActivate = getSynergiesIfChoose(id)
    if (canActivate.length > 0) {
      ctx.fillStyle = UI.success
      ctx.font = '11px sans-serif'
      ctx.fillText('可组成：' + canActivate.join('、'), x + cardW / 2, cardY + 72)
    }
    skillChoiceRects.push({ x, y: cardY, w: cardW, h: cardH })
  }
  y += cardH + 12

  const skipY = y
  const btnGap = 12
  const skipW = 100
  const refreshW = 100
  const twoBtnW = skipW + btnGap + refreshW
  const skipX = (w - twoBtnW) / 2
  const refreshX = skipX + skipW + btnGap
  ctx.fillStyle = UI.textMuted
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('刷新机会 ' + skillRefreshChances + '（跳过可获得 1 次）', w / 2, skipY - 6)
  roundRect(skipX, skipY, skipW, 40, UI.radiusSm)
  ctx.fillStyle = UI.bgCard
  ctx.fill()
  ctx.strokeStyle = UI.border
  ctx.stroke()
  ctx.fillStyle = UI.text
  ctx.font = 'bold 15px sans-serif'
  ctx.fillText('跳过', skipX + skipW / 2, skipY + 20)
  skipRect = { x: skipX, y: skipY, w: skipW, h: 40 }
  const canRefresh = skillRefreshChances > 0
  roundRect(refreshX, skipY, refreshW, 40, UI.radiusSm)
  ctx.fillStyle = canRefresh ? UI.primary : UI.bgCardAlt
  ctx.fill()
  ctx.strokeStyle = canRefresh ? 'rgba(255,255,255,0.2)' : UI.border
  ctx.stroke()
  ctx.fillStyle = canRefresh ? UI.bg : UI.textMuted
  ctx.fillText('刷新', refreshX + refreshW / 2, skipY + 20)
  refreshRect = { x: refreshX, y: skipY, w: refreshW, h: 40 }
  y += skipH + 8

  ctx.fillStyle = UI.textDim
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('套装收集情况', 16, y + 14)
  y += synTitleH

  const progress = getSynergyProgress()
  for (let i = 0; i < progress.length; i++) {
    const p = progress[i]
    if (p.status === 'active') {
      ctx.fillStyle = UI.success
      ctx.fillText(p.name + ' ✓', 16, y + 14)
    } else if (p.status === 'lack1') {
      ctx.fillStyle = UI.primary
      ctx.fillText(p.name + ' 缺 ' + p.lackName, 16, y + 14)
    } else {
      ctx.fillStyle = UI.textMuted
      ctx.fillText(p.name + ' —', 16, y + 14)
    }
    y += synLineH
  }

  ctx.textAlign = 'left'
}

function drawReplaceTargetOverlay(w, h) {
  ctx.fillStyle = 'rgba(15,14,20,0.92)'
  ctx.fillRect(0, 0, w, h)

  const allSkills = getAllSkills()
  const newSkill = pendingReplaceSkillId != null && allSkills[pendingReplaceSkillId] ? allSkills[pendingReplaceSkillId].name : '?'
  const pad = 20
  const slotGap = 8
  const slotH = 40
  const slotsPerRow = Math.min(4, MAX_SKILL_SLOTS)
  const slotW = Math.floor((w - pad * 2 - slotGap * (slotsPerRow - 1)) / slotsPerRow)
  let startY = 80
  ctx.fillStyle = UI.primary
  ctx.font = 'bold 18px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('选择要替换的技能栏位', w / 2, startY - 20)
  ctx.fillStyle = UI.textDim
  ctx.font = '13px sans-serif'
  ctx.fillText('将「' + newSkill + '」替换掉下方某一格', w / 2, startY + 4)
  startY += 36

  replaceSlotRects = []
  const skillsInSlots = getSkillsInSlots()
  for (let i = 0; i < MAX_SKILL_SLOTS; i++) {
    const row = Math.floor(i / slotsPerRow)
    const col = i % slotsPerRow
    const sx = pad + col * (slotW + slotGap)
    const sy = startY + row * (slotH + slotGap)
    const filled = skillsInSlots[i]
    roundRect(sx, sy, slotW, slotH, UI.radiusSm)
    ctx.fillStyle = filled ? UI.bgCard : UI.bgCardAlt
    ctx.fill()
    ctx.strokeStyle = filled ? UI.border : UI.textMuted
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = filled ? UI.text : UI.textMuted
    ctx.font = filled && filled.name.length > 4 ? '11px sans-serif' : '13px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(filled ? filled.name : '空', sx + slotW / 2, sy + slotH / 2)
    replaceSlotRects.push({ x: sx, y: sy, w: slotW, h: slotH })
  }
  const lastRow = Math.floor((MAX_SKILL_SLOTS - 1) / slotsPerRow)
  let cancelY = startY + (lastRow + 1) * (slotH + slotGap) + 20
  const cancelW = 120
  const cancelH = 40
  const cancelX = (w - cancelW) / 2
  roundRect(cancelX, cancelY, cancelW, cancelH, UI.radius)
  ctx.fillStyle = UI.bgCard
  ctx.fill()
  ctx.strokeStyle = UI.border
  ctx.stroke()
  ctx.fillStyle = UI.text
  ctx.font = 'bold 16px sans-serif'
  ctx.fillText('取消', w / 2, cancelY + cancelH / 2)
  replaceCancelRect = { x: cancelX, y: cancelY, w: cancelW, h: cancelH }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

function drawEquipReplaceOverlay(w, h) {
  ctx.fillStyle = 'rgba(15,14,20,0.88)'
  ctx.fillRect(0, 0, w, h)

  const newEquip = pendingDropEquipmentId != null && EQUIPMENT_DEFS[pendingDropEquipmentId] ? EQUIPMENT_DEFS[pendingDropEquipmentId] : null
  const newName = newEquip ? newEquip.name : '?'
  const pad = 16
  const slotGap = 6
  const slotH = 32
  const slotsPerRow = 3
  const slotW = Math.floor((w - pad * 2 - slotGap * (slotsPerRow - 1)) / slotsPerRow)
  let startY = 72
  ctx.fillStyle = UI.primary
  ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('获得装备：' + newName, w / 2, startY - 18)
  ctx.fillStyle = UI.textDim
  ctx.font = '12px sans-serif'
  ctx.fillText('装备栏已满，选择一格替换（或放弃）', w / 2, startY + 2)
  startY += 28

  equipReplaceSlotRects = []
  for (let i = 0; i < MAX_EQUIP_SLOTS; i++) {
    const row = Math.floor(i / slotsPerRow)
    const col = i % slotsPerRow
    const sx = pad + col * (slotW + slotGap)
    const sy = startY + row * (slotH + slotGap)
    const equipId = equipment_slots[i]
    const item = equipId != null && EQUIPMENT_DEFS[equipId] ? EQUIPMENT_DEFS[equipId] : null
    roundRect(sx, sy, slotW, slotH, UI.radiusSm)
    ctx.fillStyle = item ? UI.bgCard : UI.bgCardAlt
    ctx.fill()
    ctx.strokeStyle = item ? UI.border : UI.textMuted
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = item ? UI.text : UI.textMuted
    ctx.font = item && item.name.length > 4 ? '10px sans-serif' : '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(item ? item.name : '空', sx + slotW / 2, sy + slotH / 2)
    equipReplaceSlotRects.push({ x: sx, y: sy, w: slotW, h: slotH })
  }
  const lastRow = Math.floor((MAX_EQUIP_SLOTS - 1) / slotsPerRow)
  let cancelY = startY + (lastRow + 1) * (slotH + slotGap) + 16
  const cancelW = 100
  const cancelH = 36
  const cancelX = (w - cancelW) / 2
  roundRect(cancelX, cancelY, cancelW, cancelH, UI.radius)
  ctx.fillStyle = UI.bgCard
  ctx.fill()
  ctx.strokeStyle = UI.border
  ctx.stroke()
  ctx.fillStyle = UI.text
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText('放弃', w / 2, cancelY + cancelH / 2)
  equipReplaceCancelRect = { x: cancelX, y: cancelY, w: cancelW, h: cancelH }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

function drawGame(w, h) {
  ctx.fillStyle = UI.bgPanel
  ctx.fillRect(0, 0, w, gameTop)
  ctx.fillRect(0, gameTop, w, gameHeight)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(0, gameTop, w, gameHeight)

  const attackRadius = getAttackRadius()
  ctx.save()
  ctx.translate(PLAYER_X, playerY)
  ctx.beginPath()
  ctx.arc(0, 0, attackRadius, -Math.PI / 2, Math.PI / 2)
  ctx.closePath()
  ctx.fillStyle = UI.primaryDim
  ctx.fill()
  ctx.strokeStyle = 'rgba(232,168,74,0.35)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()

  ctx.fillStyle = UI.primary
  ctx.beginPath()
  ctx.arc(PLAYER_X, playerY, 14, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = UI.border
  ctx.lineWidth = 1.5
  ctx.stroke()
  const barW = 60
  const barX = PLAYER_X - barW / 2
  const barY = playerY - 28
  roundRect(barX, barY, barW, 6, 3)
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fill()
  roundRect(barX, barY, barW * (playerHp / playerMaxHp), 6, 3)
  ctx.fillStyle = UI.success
  ctx.fill()
  if (hasRageMechanic()) {
    const rageBarY = playerY - 18
    const rageBarH = 5
    roundRect(barX, rageBarY, barW, rageBarH, 2)
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fill()
    roundRect(barX, rageBarY, barW * (playerRage / RAGE_MAX), rageBarH, 2)
    ctx.fillStyle = '#c2410c'
    ctx.fill()
  }

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]
    if (!e.alive) continue
    const radius = e.isBoss ? 14 : 10
    ctx.fillStyle = e.isBoss ? '#8b5cf6' : UI.danger
    ctx.beginPath()
    ctx.arc(e.x, e.y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = UI.border
    ctx.lineWidth = 1.5
    ctx.stroke()
    if (e.isBoss) {
      ctx.fillStyle = UI.text
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Boss', e.x, e.y - radius - 4)
      ctx.textAlign = 'left'
    }
    const eBarW = e.isBoss ? 56 : 40
    roundRect(e.x - eBarW / 2, e.y - radius - 14, eBarW, 5, 2)
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fill()
    roundRect(e.x - eBarW / 2, e.y - radius - 14, eBarW * (e.hp / e.maxHp), 5, 2)
    ctx.fillStyle = e.isBoss ? '#a78bfa' : '#f97316'
    ctx.fill()
    ctx.fillStyle = UI.text
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(Math.ceil(e.hp) + '/' + e.maxHp, e.x, e.y - radius - 20)
    ctx.textAlign = 'left'
  }

  for (let i = 0; i < effects.length; i++) {
    const ef = effects[i]
    if (ef.type === 'hit') {
      const alpha = Math.max(0, ef.life / 0.2)
      ctx.fillStyle = 'rgba(232,168,74,' + alpha * 0.8 + ')'
      ctx.beginPath()
      ctx.arc(ef.x, ef.y, 8 + (1 - alpha) * 6, 0, Math.PI * 2)
      ctx.fill()
    } else if (ef.type === 'hurt') {
      const alpha = Math.max(0, ef.life / 0.25)
      ctx.fillStyle = 'rgba(201,74,74,' + alpha * 0.5 + ')'
      ctx.beginPath()
      ctx.arc(ef.x, ef.y, 20, 0, Math.PI * 2)
      ctx.fill()
    } else if (ef.type === 'crit') {
      const alpha = Math.max(0, ef.life / 0.6)
      ctx.save()
      ctx.translate(ef.x, ef.y - 24 - (1 - alpha) * 8)
      ctx.fillStyle = 'rgba(232,168,74,' + alpha + ')'
      ctx.strokeStyle = 'rgba(180,100,0,' + alpha * 0.9 + ')'
      ctx.lineWidth = 2
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.strokeText('暴击!', 0, 0)
      ctx.fillText('暴击!', 0, 0)
      ctx.restore()
    }
  }

  for (let i = 0; i < effects.length; i++) {
    const ef = effects[i]
    if (ef.type !== 'shout') continue
    const maxLife = (ef.maxLife != null ? ef.maxLife : 0.9)
    const alpha = Math.max(0, ef.life / maxLife)
    if (alpha <= 0) continue
    const driftY = (1 - ef.life / maxLife) * 14
    const stackOff = (ef.stackIndex != null ? ef.stackIndex : 0) * 22
    const px = (ef.x != null ? ef.x : PLAYER_X)
    const py = (ef.y != null ? ef.y : playerY) - 26 - driftY - stackOff
    ctx.save()
    ctx.globalAlpha = 1
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const label = (ef.text || '') + '!'
    ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')'
    ctx.strokeStyle = 'rgba(232,168,74,' + (alpha * 0.95) + ')'
    ctx.lineWidth = 2.5
    ctx.strokeText(label, px, py)
    ctx.fillText(label, px, py)
    ctx.restore()
  }

  const waveText = gameEnded ? '20/20' : wave + '/20'
  ctx.fillStyle = UI.primary
  ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('波次 ' + waveText, w / 2, gameTop + 22)

  if (waveBreakCountdown > 0) {
    const sec = Math.ceil(waveBreakCountdown)
    ctx.fillStyle = UI.textDim
    ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('下一波 ' + sec + 's', w / 2, gameTop + gameHeight / 2 + 4)
    ctx.textAlign = 'left'
  }

  const levelBarPad = 16
  const levelBarH = 18
  const levelBarY = panelTop - levelBarH - 8
  const levelBarX = levelBarPad
  const levelBarW = w - levelBarPad * 2
  roundRect(levelBarX, levelBarY, levelBarW, levelBarH, 6)
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fill()
  roundRect(levelBarX, levelBarY, levelBarW * (playerExp / playerExpToNext), levelBarH, 6)
  ctx.fillStyle = UI.primary
  ctx.fill()
  ctx.fillStyle = UI.text
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('Lv.' + playerLevel, levelBarX + levelBarW / 2, levelBarY + levelBarH / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  ctx.strokeStyle = UI.border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, panelTop)
  ctx.lineTo(w, panelTop)
  ctx.stroke()
}

function drawPanel(w, h) {
  const panelH = h - panelTop
  ctx.fillStyle = UI.bgPanel
  ctx.fillRect(0, panelTop, w, panelH)

  const gap = 16
  const btnW = 100
  const btnH = 44
  const slotRowH = 38
  const slotRowY = panelTop + 28
  const equipRowH = 22
  const equipRowY = slotRowY + slotRowH + 16
  const btnY = equipRowY + equipRowH + 10
  const attrBoxH = 66
  const synY = btnY + attrBoxH + 6
  const damageModuleH = 82
  const synW = w - gap * 2
  const damageModuleY = panelTop + panelH - damageModuleH - 8
  const synH = Math.max(40, damageModuleY - synY - 8)

  const shopX = w - gap - btnW
  const resBlockTop = panelTop + 6
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillStyle = UI.textMuted
  ctx.fillText('资源', shopX + btnW, resBlockTop + 10)
  ctx.fillStyle = UI.primary
  ctx.font = '12px sans-serif'
  ctx.fillText('金币 ' + playerGold, shopX + btnW, resBlockTop + 24)
  ctx.fillStyle = UI.text
  ctx.fillText('击杀 ' + killCount, shopX + btnW, resBlockTop + 38)
  const shopBtnY = resBlockTop + 60
  roundRect(shopX, shopBtnY, btnW, 28, UI.radiusSm)
  ctx.fillStyle = UI.success
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = UI.bg
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('商店', shopX + btnW / 2, shopBtnY + 14)
  shopButtonRect = { x: shopX, y: shopBtnY, w: btnW, h: 28 }

  ctx.fillStyle = UI.textMuted
  ctx.font = '11px sans-serif'
  ctx.fillText('技能栏 ' + getEffectiveSlotsUsed() + '/' + MAX_SKILL_SLOTS, gap, panelTop + 14)
  const slotAreaW = Math.max(0, w - gap * 2 - btnW - gap - 8)
  const slotGap = 4
  const slotH = 38
  const slotW = slotAreaW > 0 ? Math.max(0, Math.floor((slotAreaW - slotGap * 6) / 7)) : 0
  const slotStartX = gap
  const skillsInSlots = getSkillsInSlots()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < MAX_SKILL_SLOTS; i++) {
    const sx = slotStartX + i * (slotW + slotGap)
    const filled = skillsInSlots[i]
    roundRect(sx, slotRowY, slotW, slotH, UI.radiusSm)
    if (filled) {
      let slotBg = filled.isAdvanced ? UI.bgCardAlt : UI.bgCard
      let slotStroke = filled.isAdvanced ? UI.primary : UI.border
      let activeCd = 0
      let activeCdMax = 1
      let activeBuff = false
      if (filled.isActive && filled.skillId === SKILL_XUE_ID) {
        activeBuff = skillXueBuff > 0
        activeCd = skillXueCd
        activeCdMax = SKILL_XUE_COOLDOWN
        if (skillXueBuff > 0) {
          slotBg = UI.primaryDim
          slotStroke = UI.primary
        } else if (skillXueCd > 0) {
          slotBg = 'rgba(60,58,70,0.9)'
          slotStroke = UI.textMuted
        } else {
          slotBg = UI.danger
          slotStroke = UI.primary
        }
      } else if (filled.isActive && filled.skillId === SKILL_XUANFENG_ID) {
        activeCd = skillXuanFengCd
        activeCdMax = SKILL_XUANFENG_COOLDOWN
        if (skillXuanFengCd > 0) {
          slotBg = 'rgba(60,58,70,0.9)'
          slotStroke = UI.textMuted
        } else if (skillShunpiBuff > 0) {
          slotBg = UI.primaryDim
          slotStroke = UI.primary
        } else {
          slotBg = UI.danger
          slotStroke = UI.primary
        }
      } else if (filled.isActive && filled.skillId === SKILL_BAONU_ID) {
        if (playerRage >= SKILL_BAONU_RAGE_COST) {
          slotBg = UI.danger
          slotStroke = UI.primary
        } else {
          slotBg = 'rgba(60,58,70,0.9)'
          slotStroke = UI.textMuted
        }
      }
      ctx.fillStyle = slotBg
      ctx.fill()
      ctx.strokeStyle = slotStroke
      ctx.lineWidth = 1.5
      ctx.stroke()
      if (filled.isActive && activeCd > 0) {
        const cdPct = 1 - activeCd / activeCdMax
        const barY = slotRowY + slotH - 5
        roundRect(sx + 2, barY, slotW - 4, 3, 1)
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.fill()
        roundRect(sx + 2, barY, Math.max(0, (slotW - 4) * cdPct), 3, 1)
        ctx.fillStyle = UI.primary
        ctx.fill()
      }
      ctx.font = (filled.name.length > 2 ? '10px' : '11px') + ' sans-serif'
      ctx.fillStyle = filled.isAdvanced ? UI.primary : (filled.isActive && activeCd > 0 ? UI.textMuted : UI.text)
      ctx.fillText(filled.name.length > 2 ? filled.name.slice(0, 2) : filled.name, sx + slotW / 2, slotRowY + (filled.isActive ? 10 : slotH / 2))
      if (filled.isActive) {
        ctx.font = '9px sans-serif'
        if (filled.skillId === SKILL_XUE_ID && activeBuff) {
          ctx.fillStyle = UI.primary
          ctx.fillText('攻速+', sx + slotW / 2, slotRowY + 24)
        } else if (filled.skillId === SKILL_XUANFENG_ID && skillShunpiBuff > 0 && activeCd <= 0) {
          ctx.fillStyle = UI.primary
          ctx.fillText('顺劈', sx + slotW / 2, slotRowY + 24)
        } else if (filled.skillId === SKILL_BAONU_ID) {
          ctx.fillStyle = playerRage >= SKILL_BAONU_RAGE_COST ? UI.primary : UI.textMuted
          ctx.fillText(playerRage >= SKILL_BAONU_RAGE_COST ? '就绪' : '怒气不足', sx + slotW / 2, slotRowY + 24)
        } else if (activeCd > 0) {
          ctx.fillStyle = UI.textMuted
          ctx.fillText('CD ' + Math.ceil(activeCd) + 's', sx + slotW / 2, slotRowY + 24)
        } else {
          ctx.fillStyle = UI.primary
          ctx.fillText('就绪', sx + slotW / 2, slotRowY + 24)
        }
      }
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fill()
      ctx.strokeStyle = UI.textMuted
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.font = '10px sans-serif'
      ctx.fillStyle = UI.textMuted
      ctx.fillText('空', sx + slotW / 2, slotRowY + slotH / 2)
    }
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = UI.textMuted
  ctx.font = '11px sans-serif'
  const equipUsed = equipment_slots.filter(e => e != null).length
  ctx.fillText('装备栏 ' + equipUsed + '/' + MAX_EQUIP_SLOTS, gap, equipRowY - 2)
  const equipAreaW = Math.max(0, w - gap * 2 - btnW - gap - 8)
  const equipSlotW = equipAreaW > 0 ? Math.max(0, Math.floor((equipAreaW - slotGap * (MAX_EQUIP_SLOTS - 1)) / MAX_EQUIP_SLOTS)) : 0
  for (let i = 0; i < MAX_EQUIP_SLOTS; i++) {
    const ex = slotStartX + i * (equipSlotW + slotGap)
    const equipId = equipment_slots[i]
    const item = equipId != null && equipId >= 0 && equipId < EQUIPMENT_DEFS.length ? EQUIPMENT_DEFS[equipId] : null
    roundRect(ex, equipRowY, equipSlotW, equipRowH, UI.radiusSm)
    ctx.fillStyle = item ? UI.bgCard : 'rgba(0,0,0,0.25)'
    ctx.fill()
    ctx.strokeStyle = item ? UI.border : UI.textMuted
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = item ? UI.text : UI.textMuted
    ctx.font = (item && item.name.length > 3 ? '9px' : '10px') + ' sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const dispName = item ? (item.name.length > 3 ? item.name.slice(0, 2) : item.name) : '空'
    ctx.fillText(dispName, ex + equipSlotW / 2, equipRowY + equipRowH / 2)
    ctx.textAlign = 'left'
  }
  ctx.textBaseline = 'alphabetic'

  const attrBoxW = Math.max(0, shopX - gap - 8)
  roundRect(gap, btnY, attrBoxW, attrBoxH, UI.radiusSm)
  ctx.fillStyle = UI.bgCard
  ctx.fill()
  ctx.strokeStyle = UI.border
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = UI.text
  ctx.font = '12px sans-serif'
  const attackVal = computeAttack()
  const intervalVal = computeAttackInterval()
  const attacksPerSec = intervalVal > 0 ? (1 / intervalVal).toFixed(2) : '0'
  const shopAttackPct = ((playerAttackMul - 1) * 100) | 0
  const shopSpeedPct = ((playerSpeedMul - 1) * 100) | 0
  ctx.fillText('生命 ' + Math.ceil(playerHp) + '/' + playerMaxHp, gap + 10, btnY + 14)
  ctx.fillText('攻击 ' + (attackVal >= 10 ? Math.round(attackVal) : attackVal.toFixed(1)), gap + 10, btnY + 30)
  ctx.fillText('攻速 ' + attacksPerSec + '次/秒', gap + 98, btnY + 14)
  ctx.fillText('间隔 ' + intervalVal.toFixed(2) + '秒', gap + 98, btnY + 30)
  ctx.font = '11px sans-serif'
  ctx.fillStyle = UI.textDim
  ctx.fillText('力' + playerStr + ' 敏' + playerAgi + ' 智' + playerInt + '  ·  ' + (HERO_TYPES[heroType] || heroType) + ' · ' + getHeroClass().name, gap + 10, btnY + 46)
  const effectiveCritVal = getEffectiveCrit()
  const effectiveHasteDisplay = playerHaste + getLearnedHasteBonus()
  const critPct = (getCritChance() * 100).toFixed(0)
  ctx.fillText('暴击 ' + effectiveCritVal + ' (' + critPct + '%)  极速 ' + effectiveHasteDisplay + ' (攻速/CD+' + effectiveHasteDisplay + '%)', gap + 10, btnY + 58)
  if (shopAttackPct > 0 || shopSpeedPct > 0) {
    ctx.fillStyle = UI.primary
    ctx.font = '11px sans-serif'
    const pctText = '永久 攻+' + shopAttackPct + '% 速+' + shopSpeedPct + '%'
    const permX = gap + Math.max(100, attrBoxW - 92)
    ctx.fillText(pctText, permX, btnY + 22)
  }

  roundRect(gap, synY, synW, synH, UI.radiusSm)
  ctx.fillStyle = UI.bgCard
  ctx.fill()
  ctx.strokeStyle = UI.border
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = UI.primary
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('套装效果', gap + 10, synY + 22)

  const activeSynergies = []
  for (let i = 0; i < SYNERGIES.length; i++)
    if (isSynergyActive(i)) activeSynergies.push(SYNERGIES[i])
  if (activeSynergies.length === 0) {
    ctx.fillStyle = UI.textMuted
    ctx.font = '12px sans-serif'
    ctx.fillText('获得技能并满足条件后在此显示', gap + 10, synY + 44)
  } else {
    ctx.fillStyle = UI.textDim
    ctx.font = '12px sans-serif'
    let lineY = synY + 42
    for (let i = 0; i < activeSynergies.length; i++) {
      const s = activeSynergies[i]
      ctx.fillText(s.name + '：' + s.effect, gap + 10, lineY)
      lineY += 18
    }
  }

  roundRect(gap, damageModuleY, synW, damageModuleH, UI.radiusSm)
  ctx.fillStyle = UI.bgCard
  ctx.fill()
  ctx.strokeStyle = UI.border
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = UI.primary
  ctx.font = 'bold 12px sans-serif'
  ctx.fillText('伤害统计  总伤害 ' + Math.round(getTotalDamage()), gap + 10, damageModuleY + 18)
  const sorted = getDamageStatsSorted()
  const barH = 12
  const barGap = 2
  const labelW = 40
  const rightW = 58
  const barW = Math.max(0, synW - 20 - labelW - rightW)
  const totalDmg = getTotalDamage()
  if (sorted.length > 0 && totalDmg > 0) {
    let rowY = damageModuleY + 28
    for (let i = 0; i < sorted.length; i++) {
      const [name, val, count] = sorted[i]
      const pct = val / totalDmg
      ctx.fillStyle = UI.text
      ctx.font = '10px sans-serif'
      ctx.fillText(name, gap + 10, rowY + 9)
      const barX = gap + labelW + 4
      const barY = rowY + 1
      roundRect(barX, barY, barW, barH - 2, 2)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fill()
      roundRect(barX, barY, barW * pct, barH - 2, 2)
      ctx.fillStyle = DAMAGE_TYPE_COLORS[name] || UI.primary
      ctx.fill()
      ctx.fillStyle = UI.textDim
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(Math.round(val) + '  ' + count + '次', gap + synW - 12, rowY + 9)
      ctx.textAlign = 'left'
      rowY += barH + barGap
    }
  } else {
    ctx.fillStyle = UI.textMuted
    ctx.font = '11px sans-serif'
    ctx.fillText('造成伤害后在此显示', gap + 10, damageModuleY + 44)
  }
}

function drawShopOverlay(w, h) {
  ctx.fillStyle = 'rgba(15,14,20,0.88)'
  ctx.fillRect(0, 0, w, h)
  const pad = 20
  const boxW = w - pad * 2
  const boxH = h - pad * 2
  const boxX = pad
  const boxY = pad
  roundRect(boxX, boxY, boxW, boxH, UI.radius)
  ctx.fillStyle = UI.bgPanel
  ctx.fill()
  ctx.strokeStyle = UI.border
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = UI.primary
  ctx.font = 'bold 17px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('商店  ·  金币 ' + playerGold, w / 2, boxY + 30)
  ctx.textAlign = 'left'

  const rowH = 44
  const buyW = 64
  const buyH = 32
  shopBuyRects = []
  for (let i = 0; i < SHOP_ITEMS.length; i++) {
    const ry = boxY + 48 + i * rowH
    const item = SHOP_ITEMS[i]
    const canBuy = playerGold >= item.cost
    ctx.fillStyle = UI.text
    ctx.font = '14px sans-serif'
    ctx.fillText(item.name + '  ' + item.cost + ' 金', boxX + 16, ry + 14)
    ctx.fillStyle = UI.textDim
    ctx.font = '12px sans-serif'
    ctx.fillText(item.desc, boxX + 16, ry + 30)
    const buyX = boxX + boxW - 16 - buyW
    roundRect(buyX, ry + 4, buyW, buyH, UI.radiusSm)
    ctx.fillStyle = canBuy ? UI.success : UI.bgCardAlt
    ctx.fill()
    ctx.strokeStyle = canBuy ? 'rgba(255,255,255,0.15)' : UI.border
    ctx.stroke()
    ctx.fillStyle = canBuy ? UI.bg : UI.textMuted
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('购买', buyX + buyW / 2, ry + 4 + buyH / 2)
    ctx.textAlign = 'left'
    shopBuyRects.push({ x: buyX, y: ry + 4, w: buyW, h: buyH })
  }

  const closeY = boxY + boxH - 52
  const closeW = 120
  const closeX = (w - closeW) / 2
  roundRect(closeX, closeY, closeW, 40, UI.radius)
  ctx.fillStyle = UI.bgCard
  ctx.fill()
  ctx.strokeStyle = UI.border
  ctx.stroke()
  ctx.fillStyle = UI.text
  ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('关闭', w / 2, closeY + 20)
  shopCloseRect = { x: closeX, y: closeY, w: closeW, h: 40 }
  ctx.textAlign = 'left'
}

requestAnimationFrame(loop)
