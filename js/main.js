// 上半部分：横屏游戏区；下半部分：吞噬展示、商店
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

// 史莱姆：受击时短暂压扁（用于 drawSlimeBody）
function setEnemySquash(e) {
  if (!e) return
  e.squashUntil = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000 + 0.14
}

// 史莱姆造型：椭圆果冻体 + 描边 + 高光；受击压扁、平时轻微抖动
function drawSlimeBody(cx, cy, radius, isBoss, nowSec, e) {
  const phase = e.wobblePhase != null ? e.wobblePhase : 0
  let rx = radius
  let ry = radius
  const squashing = e.squashUntil != null && nowSec < e.squashUntil
  if (squashing) {
    rx = radius * 1.2
    ry = radius * 0.65
  } else {
    ry = radius * (0.88 + 0.1 * Math.sin(nowSec * 5 + phase))
  }
  const bodyColor = isBoss ? 'rgba(139,92,246,0.92)' : 'rgba(34,197,94,0.9)'
  const outlineColor = isBoss ? 'rgba(109,40,217,0.9)' : 'rgba(22,163,74,0.95)'
  ctx.save()
  ctx.translate(cx, cy)
  ctx.beginPath()
  if (ctx.ellipse) {
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
  } else {
    ctx.arc(0, 0, Math.max(rx, ry), 0, Math.PI * 2)
  }
  ctx.fillStyle = bodyColor
  ctx.fill()
  ctx.strokeStyle = outlineColor
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.beginPath()
  if (ctx.ellipse) {
    ctx.ellipse(-rx * 0.35, -ry * 0.35, rx * 0.28, ry * 0.28, 0, 0, Math.PI * 2)
  } else {
    ctx.arc(-rx * 0.35, -ry * 0.35, radius * 0.25, 0, Math.PI * 2)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fill()
  ctx.restore()
}

// 避头尾：不能出现在行首 / 行末的字符（中文排版）
const KINSOKU_HEAD = '，。、．！？；：」）】』％）'
const KINSOKU_TAIL = '「（【『'
function isKinsokuHead(c) { return c && KINSOKU_HEAD.indexOf(c) >= 0 }
function isKinsokuTail(c) { return c && KINSOKU_TAIL.indexOf(c) >= 0 }

// 在指定宽度内自动换行绘制文本，多行居中，遵守避头尾；font 需已设置。maxLines 可选
function fillTextWrapped(text, centerX, startY, maxWidth, lineHeight, maxLines) {
  if (!text) return
  const lines = []
  let rest = text
  while (rest.length > 0) {
    if (ctx.measureText(rest).width <= maxWidth) {
      lines.push(rest)
      break
    }
    let n = 1
    while (n < rest.length && ctx.measureText(rest.slice(0, n)).width <= maxWidth) n++
    if (n === 1) n = 1
    // 避头尾：行末不能是「（【『，行首不能是，。、等
    while (n > 1 && isKinsokuTail(rest[n - 1])) n--
    while (n < rest.length && isKinsokuHead(rest[n]) && ctx.measureText(rest.slice(0, n + 1)).width <= maxWidth) n++
    lines.push(rest.slice(0, n))
    rest = rest.slice(n)
  }
  if (maxLines != null && lines.length > maxLines) {
    lines.length = maxLines
    const last = lines[maxLines - 1]
    if (last.length > 0 && ctx.measureText(last + '…').width > maxWidth) {
      let trim = last.length
      while (trim > 0 && ctx.measureText(last.slice(0, trim) + '…').width > maxWidth) trim--
          lines[maxLines - 1] = (trim > 0 ? last.slice(0, trim) : last.slice(0, 1)) + '…'
    } else {
      lines[maxLines - 1] = last + '…'
    }
  }
  const saveAlign = ctx.textAlign
  const saveBaseline = ctx.textBaseline
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < lines.length; i++)
    ctx.fillText(lines[i], centerX, startY + lineHeight / 2 + i * lineHeight)
  ctx.textAlign = saveAlign
  ctx.textBaseline = saveBaseline
}

// 布局：顶部预留安全区（状态栏/刘海），上半部分为游戏区
const TOP_SAFE_MARGIN = 48
const GAME_HEIGHT_RATIO = 0.32
let gameTop = 0
let gameHeight = 0
let panelTop = 0
let gameWidth = 320 // 游戏区像素宽度，在 updateLayout 中设为 canvas.width；用于世界坐标转屏幕 x

// 世界宽度（逻辑单位）：怪物从右侧生成走到玩家的「路程」固定，保证不同屏幕宽度下走到玩家时间一致
const WORLD_WIDTH = 400
function worldToScreenX(worldX) {
  return (worldX / WORLD_WIDTH) * gameWidth
}

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
    baseSta: 15,
    strPerLevel: 2,
    agiPerLevel: 1,
    intPerLevel: 0,
    staPerLevel: 1,
    startSkillIds: [0, 1, 2]
  }
}
const DEFAULT_CLASS = 'fury_warrior'
const MAIN_STAT_ATTACK_BASE = 5
const MAIN_STAT_ATTACK_PER_POINT = 0.2
const HP_BASE = 200
const HP_PER_STA = 40   // 生命由耐力决定，与力量脱钩；力量仅作力量系主属性（攻击）
const REACH_PLAYER_X = 50
const ENEMY_SPEED = 48
const ENEMY_MAX_HP = 15   // 第 1 波小怪基础血量
const ENEMY_HP_EXP_BASE = 1.37   // 前 15 波指数增长：15 * 此值^(wave-1)
const ENEMY_HP_EXP_CAP_WAVE = 15 // 15 波后改为线性过渡，不再按指数起飞
const ENEMY_HP_TARGET_20 = 5000  // 第 20 波小怪目标血量（15 波后线性接到此值）

function getWaveEnemyHp(wave) {
  if (wave <= ENEMY_HP_EXP_CAP_WAVE) {
    return ENEMY_MAX_HP * Math.pow(ENEMY_HP_EXP_BASE, wave - 1)
  }
  const hpAt15 = ENEMY_MAX_HP * Math.pow(ENEMY_HP_EXP_BASE, ENEMY_HP_EXP_CAP_WAVE - 1)
  const step = (ENEMY_HP_TARGET_20 - hpAt15) / (20 - ENEMY_HP_EXP_CAP_WAVE)
  return hpAt15 + step * (wave - ENEMY_HP_EXP_CAP_WAVE)
}
const ENEMY_ATTACK = 1
const ENEMY_ATTACK_INTERVAL = 1
const SPAWN_MARGIN = 30
const GAME_MARGIN_Y = 16
const MAX_ENEMIES = 64
const SPAWNS_PER_WAVE = 20
const MAX_WAVE = 20
const SPAWN_INTERVAL = 1     // 同波内每只小怪出生间隔（秒）
const WAVE_BREAK_DURATION = 3   // 本波怪出完后到下一波的间隔（秒）
const EXP_PER_KILL = 5
const EXP_BOSS = 20
const GOLD_PER_KILL = 1
const GOLD_BOSS = 5
const BOSS_HP_MUL = 6
const BOSS_SPEED_MUL = 0.7
const CHALLENGE_DURATION = 30       // 挑战 Boss 存在时间（秒），超时未击杀算失败
const CHALLENGE_FIRST_BOSS_HP_PCT = 0.5  // 第一次挑战 Boss 血量 = 第一个游戏 Boss(第5波) 的 50%
const CHALLENGE_GOLD_BASE = 20     // 第一次挑战成功奖励金币
const CHALLENGE_GOLD_MUL = 1.5     // 后续每次奖励 +50%
const CHALLENGE_REWARD_CAP = 341  // 挑战奖励（金币+灵感）上限，达到后不再增长
const INSPIRATION_PER_SECOND = 1   // 灵感：每秒获得
const INSPIRATION_PER_KILL = 1     // 灵感：每击杀一只怪获得
const LEARN_SKILL_COST_BASE = 5    // 第一次学习技能消耗灵感
const LEARN_SKILL_COST_CAP = 100   // 学习技能消耗上限（幂增长到此封顶）
const FIRST_BOSS_WAVE = 5           // 第一个游戏 Boss 所在波次
const BASE_EXP_TO_NEXT = 10
const MAX_SKILL_SLOTS = 6
const SKILL_SLOTS_PER_ROW = 3
// 技能栏统一尺寸（主界面、选技能界面、替换技能界面一致）
const SKILL_BAR_SLOT_H = 58
const SKILL_BAR_SLOT_GAP = 4
const DEVOUR_FLOAT_DURATION = 1.0   // 吞噬飞卡动画时长（秒）
// 主动技能数值（嗜血/旋风斩/暴怒）仍用于战斗计算
const SKILL_XUE_DAMAGE_MUL = 1.5
const SKILL_XUE_HEAL_PCT = 0.2
const SKILL_XUE_BUFF_DURATION = 3
const SKILL_XUE_COOLDOWN = 4
const SKILL_XUANFENG_DAMAGE_MUL = 0.8
const SKILL_XUANFENG_MAX_TARGETS = 5
const SKILL_XUANFENG_COOLDOWN = 5
const SHUNPI_BUFF_DURATION = SKILL_XUANFENG_COOLDOWN
const MONSTER_KILL_FOR_XUANFENG_DEVOUR = 50
const RAGE_CONSUMED_FOR_BAONU_DEVOUR = 500
const COMBAT_SECONDS_FOR_60S_DEVOUR = 60
const RAGE_GAINED_FOR_LUMANG_DEVOUR = 500   // 鲁莽 id=24
const RAGE_GAINED_FOR_SIYI_DEVOUR = 1000    // 肆意放纵 id=25
const ENRAGE_SECONDS_FOR_DEVOUR = 20        // 激怒时间累计 20 秒吞噬（id 28~32）
const BLEED_DAMAGE_FOR_YUXUE_DEVOUR = 10000 // 浴血之躯 id=27
const WOUND_DURATION = 6           // 重伤持续 6 秒
const WOUND_TICK_INTERVAL = 0.2   // 每 0.2 秒跳一次伤害（不按帧均匀摊）
const WOUND_DAMAGE_PCT = 0.5      // 重伤流血总量 = 触发该次伤害的 50%
const SKILL_LUMANG_ID = 24
const LUMANG_BUFF_DURATION = 12
const LUMANG_COOLDOWN = 90
const SHUNPI_DAMAGE_MUL = 0.6
const SHUNPI_EXTRA_TARGETS = 4
const MAX_EQUIP_SLOTS = 1
const CRIT_DAMAGE_MUL = 2
const CRIT_RATE_DENOM = 100
const HASTE_PCT_DENOM = 100
const RAGE_MAX = 100
const RAGE_PER_DAMAGE = 5
const RAGE_ON_CRIT = 5
const RAGE_XUE_BONUS = 8
const SKILL_BAONU_RAGE_COST = 100
const SKILL_BAONU_STR_FACTOR = 10
const SKILL_BAONU_PCT = 2.8

// 新技能表 id：0~2 初始，3~7 基础，8+ 进阶（与 技能整理 表对应）
const SKILL_XUE_ID = 3
const SKILL_NUJI_ID = 4
const SKILL_BAONU_ID = 5
const SKILL_XUANFENG_ID = 6
const SKILL_ZHANSHA_ID = 7
const SKILL_NUJI_DAMAGE_MUL = 1.3
const SKILL_NUJI_RAGE = 12
const SKILL_NUJI_COOLDOWN = 7
const SKILL_ZHANSHA_DAMAGE_MUL = 2.0
const SKILL_ZHANSHA_COOLDOWN = 5
const SKILL_ZHANSHA_CD_REDUCE = 1.5
const NUJI_RESET_BUFF_DURATION = 3
const INITIAL_SKILL_IDS = [0, 1, 2]
const BASE_SKILL_IDS = [3, 4, 5, 6, 7]
// 吞噬类型对应的技能 id（用于统一判断）
const DEVOUR_OBTAIN_NOW_IDS = [33, 34, 35]           // 获得即吞噬：狂怒回复、狂怒提振、生死决战
const DEVOUR_60S_COMBAT_IDS = [6, 7, 26, 40]        // 60 秒战斗时间：旋风斩、斩杀、重伤、奥丁之怒
const DEVOUR_RAGE_GAINED_IDS = [24, 25]              // 累计获得怒气：鲁莽 500、肆意放纵 1000
const DEVOUR_ENRAGE_20S_IDS = [28, 29, 30, 31, 32]  // 激怒时间 20 秒：狂乱之怒等
const DEVOUR_BLEED_10000_ID = 27                     // 浴血之躯：累计流血伤害 10000
// 前期低概率、随波次增高出现：鲁莽、奥丁之怒、狂怒回复(33)；34/35 由前置技能控制出现
const LATE_GAME_SKILL_IDS = [24, 33, 40]
const LATE_GAME_CHANCE_MIN = 0.2                    // 第 1 波时进入候选的概率 20%
const LATE_GAME_PROGRESS_WAVES = 10                 // 多少波后达到 100%

// 经典狂暴战 · 钥匙卡（id 100+ 为虚拟卡，仅用于打开技能链，无战斗效果）
const KEY_CARD_ID_MIN = 100
const KEY_CARD_ID_MAX = 106
const KEY_BAONU = 100      // 强化暴怒
const KEY_XUE = 103        // 强化嗜血
const KEY_NUJI = 105       // 怒击进阶
const KEY_BAONU2 = 101     // 精通暴怒
const KEY_BAONU3 = 102     // 强化激怒
const KEY_XUE2 = 104       // 血流成河
const KEY_NUJI2 = 106      // 精通怒击
const TOP_LEVEL_KEY_IDS = [KEY_BAONU, KEY_XUE, KEY_NUJI]
// 经典狂暴战三条线：每层 { keyCardId, keyName, skillIds, synergyName }，synergyName 为 null 时该层无集齐吞噬（如血流成河层 26/27 各自条件）
const CLASSIC_FURY_LINES = {
  baonu: {
    name: '暴怒',
    tiers: [
      { keyCardId: 100, keyName: '强化暴怒', skillIds: [36, 37], synergyName: '暴怒' },
      { keyCardId: 101, keyName: '精通暴怒', skillIds: [38, 39], synergyName: '暴怒2' },
      { keyCardId: 102, keyName: '强化激怒', skillIds: [28, 29, 30, 31, 32], synergyName: '激怒' }
    ]
  },
  xue: {
    name: '嗜血',
    tiers: [
      { keyCardId: 103, keyName: '强化嗜血', skillIds: [13, 14, 15, 16], synergyName: '嗜血' },
      { keyCardId: 104, keyName: '血流成河', skillIds: [26, 27], synergyName: null }
    ]
  },
  nuji: {
    name: '怒击',
    tiers: [
      { keyCardId: 105, keyName: '怒击进阶', skillIds: [17, 18, 19], synergyName: '怒击' },
      { keyCardId: 106, keyName: '精通怒击', skillIds: [20, 21, 22, 23], synergyName: '怒击2' }
    ]
  }
}

// 全技能表（id 即下标）：name, category, type, desc, synergyName, devourCondition, attackMul, speedMul, isActive
const ALL_SKILLS = [
  { id: 0, name: '狂暴姿态', category: '初始', type: '被动', desc: '使你的自动攻击伤害提高15%，受到伤害提高10%', synergyName: '双持狂战士', devourCondition: '集齐狂暴姿态、激怒状态（精通）、泰坦之握', attackMul: 1.15, speedMul: 1.0 },
  { id: 1, name: '激怒状态', category: '初始', type: '被动', desc: '你在激怒状态下造成的伤害提高15%，精通提高15%，吸血提高3%，持续4秒', synergyName: '双持狂战士', devourCondition: '集齐狂暴姿态、激怒状态（精通）、泰坦之握', attackMul: 1.0, speedMul: 1.0 },
  { id: 2, name: '双武器', category: '初始', type: '被动', desc: '伤害提高10%，普攻同时攻击2个目标，攻击速度降低20%', synergyName: '双持狂战士', devourCondition: '集齐狂暴姿态、激怒状态（精通）、泰坦之握', attackMul: 1.1, speedMul: 0.8 },
  { id: 3, name: '嗜血', category: '基础', type: '主动', desc: '主动：对当前目标造成150%攻击力伤害，并回复造成伤害的20%生命；随后3秒内攻速提升至1.2倍。战士释放时额外获得8怒气。冷却4秒，有目标时自动释放。有30%几率进入激怒状态', synergyName: '愤怒化身', devourCondition: '集齐嗜血、怒击、暴怒、旋风斩', attackMul: 1.0, speedMul: 1.0, isActive: true },
  { id: 4, name: '怒击', category: '基础', type: '主动', desc: '一次强力的打击，一共造成130%攻击力伤害，产生12点怒气，7s冷却时间', synergyName: '愤怒化身', devourCondition: '集齐嗜血、怒击、暴怒、旋风斩', attackMul: 1.0, speedMul: 1.0, isActive: true },
  { id: 5, name: '暴怒', category: '基础', type: '主动', desc: '主动：消耗100怒气，造成（力量×10+攻击力）×280%伤害（可暴击），无冷却。怒气≥100且有目标时自动释放。可触发顺劈。集齐嗜血、怒击、暴怒、旋风斩后吞噬；或累计消耗怒气达500后吞噬（不占栏位）。进入激怒状态', synergyName: '愤怒化身', devourCondition: '集齐嗜血、怒击、暴怒、旋风斩（或累计消耗怒气达500后吞噬）', attackMul: 1.0, speedMul: 1.0, isActive: true },
  { id: 6, name: '旋风斩', category: '基础', type: '主动', desc: '主动：对攻击范围内最多5个敌人各造成80%攻击力伤害（可暴击）。冷却5秒。使用后5秒内进入顺劈：嗜血或暴怒对主目标造成伤害时，主目标外最多4个敌人额外受到60%顺劈伤害。集齐嗜血、怒击、暴怒、旋风斩后吞噬（不占栏位）。', synergyName: '愤怒化身', devourCondition: '集齐嗜血、怒击、暴怒、旋风斩', attackMul: 1.0, speedMul: 1.0, isActive: true },
  { id: 7, name: '斩杀', category: '基础', type: '被动', desc: '攻击时有20%的概率触发，造成200%攻击力伤害，5s冷却时间', synergyName: '斩杀', devourCondition: '60秒后自动吞噬', attackMul: 1.0, speedMul: 1.0 },
  { id: 8, name: '猝死', category: '进阶', type: '被动', desc: '斩杀的触发概率增加10%，伤害提高50%', synergyName: '斩杀', devourCondition: '集齐猝死、强化斩杀、毁灭', attackMul: 1.0, speedMul: 1.0, prerequisite: 7 },
  { id: 9, name: '强化斩杀', category: '进阶', type: '被动', desc: '斩杀会产生20点怒气值', synergyName: '斩杀', devourCondition: '集齐猝死、强化斩杀、毁灭', attackMul: 1.0, speedMul: 1.0, prerequisite: 7 },
  { id: 10, name: '毁灭', category: '进阶', type: '被动', desc: '斩杀现在伤害提高100%，冷却时间缩短1.5秒', synergyName: '斩杀', devourCondition: '集齐猝死、强化斩杀、毁灭', attackMul: 1.0, speedMul: 1.0, prerequisite: 7 },
  { id: 11, name: '强化旋风斩', category: '进阶', type: '被动', desc: '旋风斩会产生3点怒气，每击中一个目标会额外产生1点怒气值，最大8点', synergyName: '旋风斩', devourCondition: '集齐强化旋风斩、血肉顺劈', attackMul: 1.0, speedMul: 1.0, prerequisite: 6 },
  { id: 12, name: '血肉顺劈', category: '进阶', type: '被动', desc: '旋风斩和雷霆一击伤害提高50%', synergyName: '旋风斩', devourCondition: '集齐强化旋风斩、血肉顺劈', attackMul: 1.0, speedMul: 1.0, prerequisite: 6 },
  { id: 13, name: '新鲜血肉', category: '进阶', type: '被动', desc: '嗜血触发激怒的几率翻倍', synergyName: '嗜血', devourCondition: '集齐新鲜血肉、寒光热血、血腥疯狂、恶毒瞥视', attackMul: 1.0, speedMul: 1.0, prerequisite: 3 },
  { id: 14, name: '寒光热血', category: '进阶', type: '被动', desc: '嗜血额外产生4点怒气，额外回复10%的生命值', synergyName: '嗜血', devourCondition: '集齐新鲜血肉、寒光热血、血腥疯狂、恶毒瞥视', attackMul: 1.0, speedMul: 1.0, prerequisite: 3 },
  { id: 15, name: '血腥疯狂', category: '进阶', type: '被动', desc: '怒击和嗜血的伤害提高5%', synergyName: '嗜血', devourCondition: '集齐新鲜血肉、寒光热血、血腥疯狂、恶毒瞥视', attackMul: 1.0, speedMul: 1.0, prerequisite: 3 },
  { id: 16, name: '恶毒瞥视', category: '进阶', type: '被动', desc: '嗜血对低于50%血的敌人伤害提高25%', synergyName: '嗜血', devourCondition: '集齐新鲜血肉、寒光热血、血腥疯狂、恶毒瞥视', attackMul: 1.0, speedMul: 1.0, prerequisite: 3 },
  { id: 17, name: '强化怒击', category: '进阶', type: '被动', desc: '怒击有25%的几率立即重置自身的冷却时间', synergyName: '怒击', devourCondition: '集齐强化怒击、敌意、酌饮怒火', attackMul: 1.0, speedMul: 1.0, prerequisite: 4 },
  { id: 18, name: '敌意', category: '进阶', type: '被动', desc: '嗜血和怒击的伤害提高8%，暴击伤害提高8%', synergyName: '怒击', devourCondition: '集齐强化怒击、敌意、酌饮怒火', attackMul: 1.0, speedMul: 1.0, prerequisite: 4 },
  { id: 19, name: '酌饮怒火', category: '进阶', type: '被动', desc: '怒击伤害提高10%', synergyName: '怒击', devourCondition: '集齐强化怒击、敌意、酌饮怒火', attackMul: 1.0, speedMul: 1.0, prerequisite: 4 },
  { id: 20, name: '劈斩', category: '进阶2', type: '被动', desc: '嗜血和暴怒有25%的几率重置怒击的冷却时间', synergyName: '怒击2', devourCondition: '集齐劈斩、愤与怒、暴虐成性、蛮力爆发', attackMul: 1.0, speedMul: 1.0, prerequisiteSynergy: '怒击' },
  { id: 21, name: '愤与怒', category: '进阶2', type: '被动', desc: '怒击的伤害提高15%，怒击重置自身冷却时间的概率增加10%', synergyName: '怒击2', devourCondition: '集齐劈斩、愤与怒、暴虐成性、蛮力爆发', attackMul: 1.0, speedMul: 1.0, prerequisiteSynergy: '怒击' },
  { id: 22, name: '暴虐成性', category: '进阶2', type: '被动', desc: '怒击的暴击几率提高10%，暴击伤害提高10%', synergyName: '怒击2', devourCondition: '集齐劈斩、愤与怒、暴虐成性、蛮力爆发', attackMul: 1.0, speedMul: 1.0, prerequisiteSynergy: '怒击' },
  { id: 23, name: '蛮力爆发', category: '进阶2', type: '被动', desc: '当怒击重置冷却时间时，自动攻击伤害和攻击速度提高30%，持续3秒', synergyName: '怒击2', devourCondition: '集齐劈斩、愤与怒、暴虐成性、蛮力爆发', attackMul: 1.0, speedMul: 1.0, prerequisiteSynergy: '怒击' },
  { id: 24, name: '鲁莽', category: '进阶', type: '主动', desc: '所有产生的怒气提高50%，暴击几率提高20%，持续12秒，冷却时间90秒', synergyName: '鲁莽', devourCondition: '获得500点怒气吞噬', attackMul: 1.0, speedMul: 1.0, isActive: true },
  { id: 25, name: '肆意放纵', category: '进阶2', type: '被动', desc: '使用鲁莽时，产生50点怒气，鲁莽持续时间内，怒击伤害提高20%，嗜血伤害提高20%', synergyName: '鲁莽', devourCondition: '获得1000点怒气吞噬', attackMul: 1.0, speedMul: 1.0, prerequisite: 24 },
  { id: 26, name: '重伤', category: '进阶', type: '被动', desc: '受到重伤的目标在6秒内受到造成该次伤害50%的流血（每0.2秒跳一次），若刷新则剩余伤害并入新效果。所有主动技能命中都会施加重伤', synergyName: '流血', devourCondition: '60s后吞噬', attackMul: 1.0, speedMul: 1.0 },
  { id: 27, name: '浴血之躯', category: '进阶2', type: '被动', desc: '你的流血伤害提高20%', synergyName: '流血', devourCondition: '累计流血伤害达到10000', attackMul: 1.0, speedMul: 1.0, prerequisite: 26 },
  { id: 28, name: '狂乱之怒', category: '进阶', type: '被动', desc: '激怒使你的急速提高15%', synergyName: '激怒', devourCondition: '激怒时间20秒', attackMul: 1.0, speedMul: 1.0, prerequisiteSynergy: '愤怒化身' },
  { id: 29, name: '怒意生威', category: '进阶', type: '被动', desc: '激怒使你的精通提高15%，吸血提高3%', synergyName: '激怒', devourCondition: '激怒时间20秒', attackMul: 1.0, speedMul: 1.0 },
  { id: 30, name: '混沌专注', category: '进阶', type: '被动', desc: '激怒状态下你的自动攻击伤害提高10%', synergyName: '激怒', devourCondition: '激怒时间20秒', attackMul: 1.0, speedMul: 1.0 },
  { id: 31, name: '战争印记', category: '进阶', type: '被动', desc: '激怒时，收到的伤害降低10%', synergyName: '激怒', devourCondition: '激怒时间20秒', attackMul: 1.0, speedMul: 1.0 },
  { id: 32, name: '残酷', category: '进阶', type: '被动', desc: '激怒时，嗜血和怒击的伤害提高10%', synergyName: '激怒', devourCondition: '激怒时间20秒', attackMul: 1.0, speedMul: 1.0 },
  { id: 33, name: '狂怒回复', category: '进阶', type: '被动', desc: '30%以下时，嗜血回复生命提高20%', synergyName: '回复', devourCondition: '获得即吞噬', attackMul: 1.0, speedMul: 1.0, prerequisiteSynergy: '愤怒化身' },
  { id: 34, name: '狂怒提振', category: '进阶2', type: '被动', desc: '狂怒回复的血量判断提高到50%', synergyName: '回复', devourCondition: '获得即吞噬', attackMul: 1.0, speedMul: 1.0, prerequisite: 33 },
  { id: 35, name: '生死决战', category: '进阶3', type: '被动', desc: '当你死亡时，立即复活你，生命值恢复到50%。一局游戏只能触发一次', synergyName: '回复', devourCondition: '获得即吞噬', attackMul: 1.0, speedMul: 1.0, prerequisite: 34 },
  { id: 36, name: '血之气息', category: '进阶', type: '被动', desc: '嗜血和暴怒的伤害提高10%', synergyName: '暴怒', devourCondition: '集齐血之气息、处决者的愤怒', attackMul: 1.0, speedMul: 1.0, prerequisite: 5 },
  { id: 37, name: '处决者的愤怒', category: '进阶', type: '被动', desc: '斩杀额外产生5点怒气，暴怒的伤害提高10%', synergyName: '暴怒', devourCondition: '集齐血之气息、处决者的愤怒', attackMul: 1.0, speedMul: 1.0, prerequisite: 5 },
  { id: 38, name: '暴怒毁灭', category: '进阶', type: '被动', desc: '暴怒还会对攻击范围内的所有目标造成80%的伤害', synergyName: '暴怒', devourCondition: '集齐暴怒毁灭、狂乱', attackMul: 1.0, speedMul: 1.0, prerequisiteSynergy: '暴怒' },
  { id: 39, name: '狂乱', category: '进阶', type: '被动', desc: '暴怒使你的急速提高2%，持续12秒，多次释放急速可以叠加，但是持续时间不叠加', synergyName: '暴怒', devourCondition: '集齐暴怒毁灭、狂乱', attackMul: 1.0, speedMul: 1.0 },
  { id: 40, name: '奥丁之怒', category: '进阶', type: '主动', desc: '对攻击范围内的所有单位，造成200%的伤害，并且造成200%的流血伤害，产生20点怒气，进入激怒状态。冷却时间30秒', synergyName: '奥丁之怒', devourCondition: '60s后吞噬', attackMul: 1.0, speedMul: 1.0, isActive: true }
]

// 每个吞噬单独一色（吞噬名 → 顶条/边框色），识别更细；钥匙卡用金色
const SYNERGY_LINE_COLORS = {
  '双持狂战士': '#6B7280',
  '愤怒化身': '#B91C1C',
  '斩杀': '#16A34A',
  '旋风斩': '#0891B2',
  '嗜血': '#DC2626',
  '怒击': '#EA580C',
  '怒击2': '#C2410C',
  '流血': '#991B1B',
  '激怒': '#6D28D9',
  '回复': '#65A30D',
  '暴怒': '#7C3AED',
  '暴怒2': '#5B21B6',
  '鲁莽': '#E11D48',
  '奥丁之怒': '#2563EB'
}
const KEY_CARD_COLOR = '#D97706'

// 吞噬定义：集齐 req 内技能即激活，组成技能不占栏位
const SYNERGY_DEFS = [
  { name: '双持狂战士', req: [0, 1, 2] },
  { name: '愤怒化身', req: [3, 4, 5, 6] },
  { name: '斩杀', req: [8, 9, 10] },
  { name: '旋风斩', req: [11, 12] },
  { name: '嗜血', req: [13, 14, 15, 16] },
  { name: '怒击', req: [17, 18, 19] },
  { name: '怒击2', req: [20, 21, 22, 23] },
  { name: '流血', req: [26, 27] },
  { name: '激怒', req: [28, 29, 30, 31, 32] },
  { name: '回复', req: [33, 34, 35] },
  { name: '暴怒', req: [36, 37] },
  { name: '暴怒2', req: [38, 39] }
]

// 进阶池：满足前置后该池技能进入 3 选 1。prerequisite=技能id 表示「学了该技能后」；prerequisiteSynergy=吞噬名 表示「该吞噬激活后」
const ADVANCED_POOLS = [
  { poolName: '斩杀', skillIds: [8, 9, 10], prerequisite: 7 },
  { poolName: '旋风斩', skillIds: [11, 12], prerequisite: 6 },
  { poolName: '嗜血', skillIds: [13, 14, 15, 16], prerequisite: 3 },
  { poolName: '怒击', skillIds: [17, 18, 19], prerequisite: 4 },
  { poolName: '怒击2', skillIds: [20, 21, 22, 23], prerequisiteSynergy: '怒击' },
  { poolName: '鲁莽', skillIds: [24] },
  { poolName: '鲁莽2', skillIds: [25], prerequisite: 24 },
  { poolName: '流血', skillIds: [26, 27], prerequisite: 3 },
  { poolName: '激怒', skillIds: [28, 29, 30, 31, 32], prerequisiteSynergy: '愤怒化身' },
  { poolName: '回复', skillIds: [33], prerequisiteSynergy: '愤怒化身' },
  { poolName: '回复2', skillIds: [34], prerequisite: 33 },
  { poolName: '回复3', skillIds: [35], prerequisite: 34 },
  { poolName: '暴怒', skillIds: [36, 37], prerequisite: 5 },
  { poolName: '暴怒2', skillIds: [38, 39], prerequisiteSynergy: '暴怒' },
  { poolName: '奥丁之怒', skillIds: [40] }
]

const TOTAL_SKILL_COUNT = ALL_SKILLS.length

function getAllSkills() {
  return ALL_SKILLS
}

function getSkillById(skillId) {
  return (skillId >= 0 && skillId < ALL_SKILLS.length) ? ALL_SKILLS[skillId] : null
}

function isKeyCardId(id) {
  return typeof id === 'number' && id >= KEY_CARD_ID_MIN && id <= KEY_CARD_ID_MAX
}

function getKeyCardDisplayName(id) {
  if (!isKeyCardId(id)) return ''
  for (const line of Object.values(CLASSIC_FURY_LINES)) {
    for (const t of line.tiers) {
      if (t.keyCardId === id) return t.keyName
    }
  }
  return '钥匙卡'
}

function getKeyCardDesc(id) {
  if (!isKeyCardId(id)) return ''
  for (const [lineKey, line] of Object.entries(CLASSIC_FURY_LINES)) {
    for (const t of line.tiers) {
      if (t.keyCardId === id) return '选择后打开「' + line.name + '」技能链'
    }
  }
  return '选择后打开技能链'
}

// 卡牌顶条文案：钥匙卡=「钥匙卡」，愤怒化身四张=嗜血/怒击/暴怒/旋风斩，其余=吞噬名
function getCardTopBarText(skillId) {
  if (isKeyCardId(skillId)) return '钥匙卡'
  if (skillId === 3) return '嗜血'
  if (skillId === 4) return '怒击'
  if (skillId === 5) return '暴怒'
  if (skillId === 6) return '旋风斩'
  const sk = getSkillById(skillId)
  return sk ? (sk.synergyName || '') : ''
}

// 卡牌线条色：钥匙卡=金色，其余按吞噬名一色（愤怒化身四张 3,4,5,6 用「愤怒化身」色）
function getCardLineColor(skillId) {
  if (isKeyCardId(skillId)) return KEY_CARD_COLOR
  if (skillId >= 3 && skillId <= 6) return SYNERGY_LINE_COLORS['愤怒化身']
  const sk = getSkillById(skillId)
  const name = sk ? sk.synergyName : null
  return (name && SYNERGY_LINE_COLORS[name]) ? SYNERGY_LINE_COLORS[name] : UI.primary
}

function isSynergyActiveByName(synergyName) {
  const idx = SYNERGY_DEFS.findIndex(s => s.name === synergyName)
  return idx >= 0 && isSynergyActive(idx)
}

// 经典狂暴战阶段：愤怒化身已激活时使用钥匙卡+已展开技能池
function isClassicFuryPoolActive() {
  return isSynergyActiveByName('愤怒化身')
}

// 经典狂暴战阶段与钥匙卡一起出现的「线外」进阶池（斩杀、旋风斩、鲁莽、奥丁之怒）
const CLASSIC_FURY_EXTRA_POOL_NAMES = ['斩杀', '旋风斩', '鲁莽', '鲁莽2', '奥丁之怒']

function buildClassicFuryPool() {
  const available = []
  // 1. 顶层未选的钥匙卡
  for (const kid of TOP_LEVEL_KEY_IDS) {
    if (pickedKeyCardIds.indexOf(kid) < 0) available.push(kid)
  }
  // 2. 各线：已选钥匙卡展开的当前层技能（未学的）+ 本层吞噬后下一张钥匙卡
  for (const line of Object.values(CLASSIC_FURY_LINES)) {
    for (let t = 0; t < line.tiers.length; t++) {
      const tier = line.tiers[t]
      const keyPicked = pickedKeyCardIds.indexOf(tier.keyCardId) >= 0
      if (keyPicked) {
        for (const sid of tier.skillIds) {
          if (!isLearned(sid)) available.push(sid)
        }
      } else {
        if (t === 0) continue
        const prevTier = line.tiers[t - 1]
        if (pickedKeyCardIds.indexOf(prevTier.keyCardId) < 0) continue
        const prevSynergyOk = prevTier.synergyName ? isSynergyActiveByName(prevTier.synergyName) : (function () {
          for (const sid of prevTier.skillIds) if (!isLearned(sid)) return false
          return true
        })()
        if (prevSynergyOk) available.push(tier.keyCardId)
      }
    }
  }
  // 3. 吞噬愤怒化身后，与钥匙卡一起出现的线外技能（斩杀、旋风斩、鲁莽、奥丁之怒），按进阶池前置判断
  if (!isLearned(7)) available.push(7) // 斩杀基础卡 7，否则斩杀池 [8,9,10] 永远无法解锁
  for (const pool of ADVANCED_POOLS) {
    if (CLASSIC_FURY_EXTRA_POOL_NAMES.indexOf(pool.poolName) < 0) continue
    if (!isAdvancedPoolUnlocked(pool)) continue
    for (const sid of pool.skillIds) {
      if (!isLearned(sid)) available.push(sid)
    }
  }
  return available
}

function getAdvancedPoolName(skillId) {
  if (skillId < 0 || skillId >= ALL_SKILLS.length) return null
  for (let i = 0; i < ADVANCED_POOLS.length; i++) {
    const p = ADVANCED_POOLS[i]
    if (p.skillIds.indexOf(skillId) >= 0) return p.poolName
  }
  return null
}

// 商店商品：名称、价格、描述（打磨武器已移至「游戏」抽屉第三张卡）
const SHOP_ITEMS = [
  { name: '生命药水', cost: 15, desc: '恢复 15% 最大生命', healPct: 0.15 }
]
const FORGE_WEAPON_BASE_PRICE = 10
const FORGE_WEAPON_PRICE_MUL = 1.5
const FORGE_WEAPON_STAT_MUL = 1.2

function getForgeWeaponCost() {
  return Math.floor(FORGE_WEAPON_BASE_PRICE * Math.pow(FORGE_WEAPON_PRICE_MUL, weaponForgeCount))
}

// 装备定义：id 与 equipment_slots 中存的数字一致；strBonus/staBonus 为装备提供的力/耐加成，attackFlat 为固定攻击力
const EQUIPMENT_DEFS = [
  { id: 0, name: '两把双手剑', strBonus: 10, staBonus: 10, attackFlat: 20 }
]
const SYNERGY_DUAL_WIELDER_INDEX = 0   // 双持狂战士，吞噬后发放「两把双手剑」
const EQUIP_DUAL_SWORDS_ID = 0

// 状态
let playerY = 100
let heroClass = DEFAULT_CLASS
let heroType = (CLASSES[DEFAULT_CLASS] && CLASSES[DEFAULT_CLASS].heroType) || 'str'
let playerStr = (CLASSES[DEFAULT_CLASS] && CLASSES[DEFAULT_CLASS].baseStr) || 15
let playerAgi = (CLASSES[DEFAULT_CLASS] && CLASSES[DEFAULT_CLASS].baseAgi) || 10
let playerInt = (CLASSES[DEFAULT_CLASS] && CLASSES[DEFAULT_CLASS].baseInt) || 10
let playerSta = (CLASSES[DEFAULT_CLASS] && CLASSES[DEFAULT_CLASS].baseSta) || 15
let playerHp = PLAYER_MAX_HP
let playerMaxHp = PLAYER_MAX_HP
let playerAttackMul = 1.0
let playerSpeedMul = 1.0
let weaponForgeCount = 0
let weaponForgedMul = 1.0
let playerAttackFlat = 0
let playerCrit = 0
let playerHaste = 0
let playerRage = 0
let playerMastery = 0   // 精通：1% = 1% 伤害提升
let playerLifesteal = 0  // 吸血：造成伤害的该比例回血（如 3 表示 3%）
let timeSinceAttack = 0
let gameOver = false
let lastTime = 0
let killCount = 0
let monsterKillCount = 0 // 仅统计战斗中击杀的怪数
let skillMonsterKillSinceLearned = {} // 旋风斩等「选技能后才计数」：学到该技能后的击杀数，如 { 6: 12 }
let rageConsumedTotal = 0 // 累计消耗的怒气，用于暴怒吞噬（每次释放暴怒 +100）
let combatTimeSeconds = 0 // 仅战斗内累计秒数（选技能/商店/波次间隔不计），用于 60 秒吞噬
let skillCombatTimeLearnedAt = {} // 学到「60秒吞噬」技能时的 combatTimeSeconds，如 { 6: 12.5, 7: 45 }
let rageGainedTotal = 0 // 全局累计获得的怒气（用于统计）
let skillRageGainedSinceLearned = {} // 选到鲁莽/肆意放纵后累计获得的怒气，如 { 24: 120, 25: 0 }
let enrageBuffRemaining = 0 // 激怒状态剩余秒数
let enrageTimeTotal = 0 // 处于激怒状态的累计秒数，用于激怒 20 秒吞噬
let skillEnrageTimeLearnedAt = {} // 学到「激怒20秒」技能时的 enrageTimeTotal，如 { 28: 0 }
let totalBleedDamage = 0 // 累计造成的流血伤害，用于浴血之躯 10000 吞噬
let playerGold = 0
let playerInspiration = 0        // 灵感：每秒+1、每击杀+1，用于学习技能
let skillLearnCount = 0          // 已学习技能次数（用于下次消耗计算：幂增长，封顶100）
let choosingSkillByInspiration = false // 当前选技能界面是否由「学习技能」按钮打开（选完扣灵感）
const DAMAGE_TYPE_NAMES = { normal: '普攻', xue: '嗜血', nuji: '怒击', xuanfeng: '旋风斩', cleave: '顺劈', baonu: '暴怒', baonu_aoe: '暴怒毁灭', zhansha: '斩杀', odin: '奥丁之怒', bleed: '流血' }
const DAMAGE_TYPE_COLORS = { '普攻': '#3b82f6', '嗜血': '#e8a84a', '怒击': '#d97706', '旋风斩': '#a78bfa', '顺劈': '#22c55e', '暴怒': '#c2410c', '暴怒毁灭': '#9a3412', '斩杀': '#dc2626', '奥丁之怒': '#7c3aed', '流血': '#b91c1c' }
let damageByType = { normal: 0, xue: 0, nuji: 0, xuanfeng: 0, cleave: 0, baonu: 0, baonu_aoe: 0, zhansha: 0, odin: 0, bleed: 0 }
let hitCountByType = { normal: 0, xue: 0, nuji: 0, xuanfeng: 0, cleave: 0, baonu: 0, baonu_aoe: 0, zhansha: 0, odin: 0, bleed: 0 }
let enemies = []
let timeSinceSpawn = 0
let wave = 1
let spawnsThisWave = 0
let waveBreakCountdown = 0
let skillXueCd = 0
let skillXueBuff = 0
let skillXuanFengCd = 0
let skillShunpiBuff = 0
let skillNuJiCd = 0
let skillZhanShaCd = 0
let nuJiResetBuffRemaining = 0
let skillLumangCd = 0
let recklessBuffRemaining = 0
let kuangLuanHasteStacks = 0      // 狂乱(39)：暴怒后极速+2%每层，持续12秒可叠层、时间不刷新
let kuangLuanBuffRemaining = 0
const KUANG_LUAN_HASTE_PER_STACK = 2
const KUANG_LUAN_BUFF_DURATION = 12
let skillOdinCd = 0               // 奥丁之怒(40) 冷却
const SKILL_ODIN_COOLDOWN = 30
const SKILL_ODIN_DAMAGE_MUL = 2
const SKILL_ODIN_BLEED_PCT = 2    // 200% 攻击力流血（6秒内每0.2s跳，与重伤一致）
const SKILL_ODIN_RAGE = 20
let deathReviveUsed = false
let gameEnded = false
let gameState = 'playing' // 'title' | 'intro' | 'playing' | ...
const INTRO_DURATION = 2.5   // 新游戏开始前开场动画时长（秒），可改为 0 关闭；使用视频时作备用
const INTRO_VIDEO_URL = 'intro.mp4'   // 填 mp4 路径则用视频做开场，留空则用 canvas 动画
let introTimer = 0           // 开场动画剩余秒数，>0 时处于 intro 状态（未用视频时）
let introUseVideo = false    // 本局开场是否使用视频
let introVideoPreloaded = false  // 标题页是否已预加载过开场视频
// 根据当前页面地址解析视频 URL，避免 GitHub Pages 子路径下 404
function getIntroVideoSrc() {
  if (!INTRO_VIDEO_URL) return ''
  if (typeof window === 'undefined' || !window.location) return INTRO_VIDEO_URL
  const path = window.location.pathname || '/'
  const dir = path.replace(/\/[^/]*$/, '/') || '/'
  return window.location.origin + dir + INTRO_VIDEO_URL.replace(/^\//, '')
}
// 开场视频加载进度 0～1，用于进度条；全部加载完才播放
function getIntroVideoLoadProgress() {
  if (typeof document === 'undefined') return 0
  const el = document.getElementById('intro-video')
  if (!el || !el.duration || el.duration <= 0 || !isFinite(el.duration)) return 0
  const buf = el.buffered
  if (!buf || buf.length === 0) return 0
  const end = buf.end(buf.length - 1)
  return Math.min(1, end / el.duration)
}
function isIntroVideoFullyLoaded() {
  return getIntroVideoLoadProgress() >= 0.99
}
let playerLevel = 1
let playerExp = 0
let playerExpToNext = BASE_EXP_TO_NEXT
let levelUpDelayRemaining = 0 // 升级前延迟 0.5 秒，期间经验条满格闪烁
let learned_skill_ids = []
let pickedKeyCardIds = []   // 经典狂暴战阶段已选钥匙卡（选过的钥匙卡不再进池）
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
let damageStatsOverlayOpen = false
let damageStatsButtonRect = null
let damageStatsCloseRect = null
let synergyOverlayOpen = false
let synergyButtonRect = null
let synergyCloseRect = null
let attributeOverlayOpen = false
let attributeButtonRect = null
let attributeCloseRect = null
const TAB_BAR_HEIGHT = 44
const TAB_IDS = ['game', 'attribute', 'damage', 'synergy', 'shop']
const TAB_LABELS = ['游戏', '属性', '伤害统计', '吞噬效果', '商店']
let bottomDrawerTab = null           // null | 'game' | 'attribute' | 'damage' | 'synergy' | 'shop'
let drawerSlideProgress = 0         // 0..1 抽屉升起动画
let tabRects = []                   // 4 个 tab 的 hit 区域
let drawerCloseRect = null
let drawerChallengeStartRect = null
let drawerGameChallengeRect = null
let drawerGameLearnSkillRect = null
let drawerGameForgeBuyRect = null
let lumangButtonRect = null
let odinButtonRect = null
let learnSkillButtonRect = null
let challengeButtonRect = null
let challengeCount = 0              // 已完成的挑战次数，用于下次挑战 Boss 血量翻倍
let challengeTimer = 0              // 挑战倒计时，>0 表示挑战进行中
let shopBuyRects = []
let weaponGrantToastRemaining = 0   // 获得武器提示剩余秒数（倒计时）
let weaponGrantToastDuration = 1.8  // 总时长，用于计算动画进度
let weaponGrantToastName = ''      // 获得的武器名
let synergyDevourAnimationPlayed = {}  // 已播放过飞卡动画的吞噬名 { '嗜血': true }
let devourFloatingCards = []       // 正在飞向吞噬 Tab 的卡 { synergyName, skillId, skillName, startX, startY, endX, endY, progress, lineColor }
let damageStatsScrollY = 0
let damageStatsContentHeight = 0
let damageStatsBoxBounds = null
let damageStatsDragging = false
let damageStatsDragStartY = 0
let damageStatsDragStartScroll = 0
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
  // 装备的 attackFlat 由 getEquipmentAttackFlat() 按打磨乘数动态计算，不再写入 playerAttackFlat
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
}

function getRageGainMul() {
  let pct = 0
  for (let i = 0; i < equipment_slots.length; i++) {
    const def = equipment_slots[i] != null ? EQUIPMENT_DEFS[equipment_slots[i]] : null
    if (def && def.rageGainPct) pct += def.rageGainPct
  }
  let mul = 1 + pct / 100
  if (recklessBuffRemaining > 0 && isLearned(SKILL_LUMANG_ID)) mul *= 1.5
  return mul
}

function tryDropEquipment() {
  // 装备逻辑重新设计中，怪物暂不掉落装备
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
  const actual = (amount * getRageGainMul()) | 0
  if (actual <= 0) return
  rageGainedTotal += actual
  if (isLearned(24)) skillRageGainedSinceLearned[24] = (skillRageGainedSinceLearned[24] || 0) + actual
  if (isLearned(25)) skillRageGainedSinceLearned[25] = (skillRageGainedSinceLearned[25] || 0) + actual
  playerRage = Math.min(RAGE_MAX, playerRage + actual)
}

// 音效：优先用程序生成（无需文件），若有 audio/*.mp3 则可通过 SOUND_URLS 播放
const SOUND_URLS = {
  hit: 'audio/hit.mp3',
  kill: 'audio/kill.mp3',
  levelup: 'audio/levelup.mp3',
  buy: 'audio/buy.mp3',
  hurt: 'audio/hurt.mp3'
}
let _audioCtx = null
function getAudioCtx() {
  if (_audioCtx != null) return _audioCtx
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  try {
    _audioCtx = new Ctor()
  } catch (e) {
    return null
  }
  return _audioCtx
}
function playProceduralSound(name) {
  const ctx = getAudioCtx()
  if (!ctx) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  const end = t + 0.15
  gain.gain.setValueAtTime(0.12, t)
  gain.gain.exponentialRampToValueAtTime(0.001, end)
  if (name === 'hit') {
    osc.frequency.value = 680
    osc.type = 'square'
    osc.start(t)
    osc.stop(t + 0.08)
  } else if (name === 'kill') {
    osc.frequency.value = 420
    osc.type = 'square'
    gain.gain.setValueAtTime(0.15, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    osc.start(t)
    osc.stop(t + 0.12)
  } else if (name === 'levelup') {
    osc.frequency.setValueAtTime(523, t)
    osc.frequency.linearRampToValueAtTime(784, t + 0.18)
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.15, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
    osc.start(t)
    osc.stop(t + 0.22)
  } else if (name === 'buy') {
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
    osc.start(t)
    osc.stop(t + 0.1)
  } else if (name === 'hurt') {
    osc.frequency.value = 120
    osc.type = 'sawtooth'
    gain.gain.setValueAtTime(0.12, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
    osc.start(t)
    osc.stop(t + 0.2)
  } else {
    osc.frequency.value = 440
    osc.type = 'sine'
    osc.start(t)
    osc.stop(t + 0.15)
  }
}
function playSound(name) {
  try {
    playProceduralSound(name)
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
      playerSta,
      heroType,
      heroClass,
      playerHp,
      playerMaxHp,
      playerGold,
      playerInspiration,
      skillLearnCount,
      killCount,
      monsterKillCount,
      skillMonsterKillSinceLearned: { ...skillMonsterKillSinceLearned },
      rageConsumedTotal,
      combatTimeSeconds,
      skillCombatTimeLearnedAt: { ...skillCombatTimeLearnedAt },
      rageGainedTotal,
      skillRageGainedSinceLearned: { ...skillRageGainedSinceLearned },
      enrageBuffRemaining,
      enrageTimeTotal,
      skillEnrageTimeLearnedAt: { ...skillEnrageTimeLearnedAt },
      totalBleedDamage,
      damageByType: { ...damageByType },
      hitCountByType: { ...hitCountByType },
      learned_skill_ids: learned_skill_ids.slice(),
      pickedKeyCardIds: pickedKeyCardIds.slice(),
      playerAttackMul,
      playerSpeedMul,
      weaponForgeCount,
      weaponForgedMul,
      playerAttackFlat,
      playerCrit,
      playerHaste,
      playerRage,
      playerMastery,
      playerLifesteal,
      gameEnded,
      gameOver,
      enemies: enemies.filter(e => e.alive).map(e => ({
        x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, speed: e.speed,
        attack: e.attack, attackCooldown: e.attackCooldown, isBoss: e.isBoss,
        isChallengeBoss: e.isChallengeBoss || false,
        wound: e.wound ? { remaining: e.wound.remaining, totalRemaining: e.wound.totalRemaining, tickAccumulator: e.wound.tickAccumulator ?? 0 } : undefined
      })),
      challengeCount,
      challengeTimer,
      skillRefreshChances,
      equipment_slots: equipment_slots.slice(),
      pendingDropEquipmentId,
      skillXueCd,
      skillXueBuff,
      skillXuanFengCd,
      skillShunpiBuff,
      skillNuJiCd,
      skillZhanShaCd,
      nuJiResetBuffRemaining,
      skillLumangCd,
      recklessBuffRemaining,
      kuangLuanHasteStacks,
      kuangLuanBuffRemaining,
      skillOdinCd,
      deathReviveUsed,
      synergyDevourAnimationPlayed: { ...synergyDevourAnimationPlayed }
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
    playerSta = data.playerSta ?? (loadCls.baseSta != null ? loadCls.baseSta : 15)
    playerMaxHp = data.playerMaxHp ?? (HP_BASE + playerSta * HP_PER_STA)
    playerHp = data.playerHp ?? playerMaxHp
    playerGold = data.playerGold || 0
    playerInspiration = (data.playerInspiration ?? 0) | 0
    skillLearnCount = (data.skillLearnCount ?? 0) | 0
    killCount = data.killCount || 0
    monsterKillCount = (data.monsterKillCount ?? 0) | 0
    skillMonsterKillSinceLearned = (data.skillMonsterKillSinceLearned && typeof data.skillMonsterKillSinceLearned === 'object') ? { ...data.skillMonsterKillSinceLearned } : {}
    rageConsumedTotal = (data.rageConsumedTotal ?? 0) | 0
    combatTimeSeconds = (data.combatTimeSeconds ?? 0) | 0
    skillCombatTimeLearnedAt = (data.skillCombatTimeLearnedAt && typeof data.skillCombatTimeLearnedAt === 'object') ? { ...data.skillCombatTimeLearnedAt } : {}
    rageGainedTotal = (data.rageGainedTotal ?? 0) | 0
    skillRageGainedSinceLearned = (data.skillRageGainedSinceLearned && typeof data.skillRageGainedSinceLearned === 'object') ? { ...data.skillRageGainedSinceLearned } : {}
    enrageBuffRemaining = (data.enrageBuffRemaining ?? 0) | 0
    enrageTimeTotal = (data.enrageTimeTotal ?? 0) | 0
    skillEnrageTimeLearnedAt = (data.skillEnrageTimeLearnedAt && typeof data.skillEnrageTimeLearnedAt === 'object') ? { ...data.skillEnrageTimeLearnedAt } : {}
    totalBleedDamage = (data.totalBleedDamage ?? 0) | 0
    for (let i = 0; i < learned_skill_ids.length; i++) {
      const id = learned_skill_ids[i]
      if (DEVOUR_60S_COMBAT_IDS.indexOf(id) >= 0 && skillCombatTimeLearnedAt[id] == null) skillCombatTimeLearnedAt[id] = 0
      if (DEVOUR_ENRAGE_20S_IDS.indexOf(id) >= 0 && skillEnrageTimeLearnedAt[id] == null) skillEnrageTimeLearnedAt[id] = 0
      if (id === SKILL_XUANFENG_ID && skillMonsterKillSinceLearned[id] == null) skillMonsterKillSinceLearned[id] = 0
      if ((id === 24 || id === 25) && skillRageGainedSinceLearned[id] == null) skillRageGainedSinceLearned[id] = 0
    }
    if (data.damageByType && typeof data.damageByType === 'object') {
      damageByType = { normal: 0, xue: 0, nuji: 0, xuanfeng: 0, cleave: 0, baonu: 0, baonu_aoe: 0, zhansha: 0, odin: 0, bleed: 0, ...data.damageByType }
    }
    if (data.hitCountByType && typeof data.hitCountByType === 'object') {
      hitCountByType = { normal: 0, xue: 0, nuji: 0, xuanfeng: 0, cleave: 0, baonu: 0, baonu_aoe: 0, zhansha: 0, odin: 0, bleed: 0, ...data.hitCountByType }
    }
    learned_skill_ids = Array.isArray(data.learned_skill_ids) ? data.learned_skill_ids : []
    pickedKeyCardIds = Array.isArray(data.pickedKeyCardIds) ? data.pickedKeyCardIds : []
    playerAttackMul = data.playerAttackMul ?? 1
    playerSpeedMul = data.playerSpeedMul ?? 1
    weaponForgeCount = (data.weaponForgeCount ?? 0) | 0
    weaponForgedMul = (data.weaponForgedMul ?? 1) || 1
    playerAttackFlat = (data.playerAttackFlat ?? 0) | 0
    playerCrit = data.playerCrit ?? 0
    playerHaste = data.playerHaste ?? 0
    playerRage = Math.min(RAGE_MAX, (data.playerRage ?? 0) | 0)
    playerMastery = (data.playerMastery ?? 0) | 0
    playerLifesteal = (data.playerLifesteal ?? 0) | 0
    gameEnded = !!data.gameEnded
    gameOver = !!data.gameOver
    if (Array.isArray(data.enemies) && data.enemies.length > 0) {
      enemies = data.enemies.map(e => ({
        ...e,
        x: (e.x > WORLD_WIDTH ? WORLD_WIDTH - SPAWN_MARGIN : e.x),
        alive: true,
        attackCooldown: e.attackCooldown || 0,
        wound: e.wound && typeof e.wound.remaining === 'number' && typeof e.wound.totalRemaining === 'number'
          ? { remaining: e.wound.remaining, totalRemaining: e.wound.totalRemaining, tickAccumulator: e.wound.tickAccumulator ?? 0 } : undefined,
        isChallengeBoss: e.isChallengeBoss || false
      }))
    } else {
      enemies = []
    }
    skillRefreshChances = Math.max(0, (data.skillRefreshChances || 0) | 0)
    if (Array.isArray(data.equipment_slots) && EQUIPMENT_DEFS.length > 0) {
      equipment_slots = data.equipment_slots.slice(0, MAX_EQUIP_SLOTS)
      while (equipment_slots.length < MAX_EQUIP_SLOTS) equipment_slots.push(null)
      pendingDropEquipmentId = data.pendingDropEquipmentId != null ? data.pendingDropEquipmentId : null
    } else {
      equipment_slots = []
      for (let i = 0; i < MAX_EQUIP_SLOTS; i++) equipment_slots.push(null)
      if (EQUIPMENT_DEFS.length === 0) playerAttackFlat = 0
      pendingDropEquipmentId = null
    }
    tryGrantDualWielderWeapon()
    skillXueCd = data.skillXueCd ?? 0
    skillXueBuff = data.skillXueBuff ?? 0
    skillXuanFengCd = data.skillXuanFengCd ?? 0
    skillShunpiBuff = data.skillShunpiBuff ?? 0
    skillNuJiCd = data.skillNuJiCd ?? 0
    skillZhanShaCd = data.skillZhanShaCd ?? 0
    nuJiResetBuffRemaining = data.nuJiResetBuffRemaining ?? 0
    skillLumangCd = data.skillLumangCd ?? 0
    recklessBuffRemaining = data.recklessBuffRemaining ?? 0
    kuangLuanHasteStacks = (data.kuangLuanHasteStacks ?? 0) | 0
    kuangLuanBuffRemaining = (data.kuangLuanBuffRemaining ?? 0) | 0
    skillOdinCd = (data.skillOdinCd ?? 0) | 0
    deathReviveUsed = !!data.deathReviveUsed
    if (data.synergyDevourAnimationPlayed && typeof data.synergyDevourAnimationPlayed === 'object') {
      synergyDevourAnimationPlayed = { ...data.synergyDevourAnimationPlayed }
    }
    challengeCount = Math.max(0, (data.challengeCount ?? 0) | 0)
    challengeTimer = Math.max(0, (data.challengeTimer ?? 0) | 0)
    if (pendingDropEquipmentId != null) gameState = 'choosing_equip_replace'
    else if (gameOver || gameEnded) gameState = 'playing'
  } catch (err) {
    console.warn('loadGame failed', err)
  }
}

function updateLayout() {
  const w = canvas.width
  const h = canvas.height
  gameWidth = w
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
  if (idx < 0 || idx >= SYNERGY_DEFS.length) return false
  const s = SYNERGY_DEFS[idx]
  for (let i = 0; i < s.req.length; i++)
    if (!isLearned(s.req[i])) return false
  return true
}

function isSkillConsumedBySynergy(skillId) {
  // 获得即吞噬：选到即不占栏位
  if (DEVOUR_OBTAIN_NOW_IDS.indexOf(skillId) >= 0) return true
  // 累计消耗怒气：暴怒 500
  if (skillId === SKILL_BAONU_ID && rageConsumedTotal >= RAGE_CONSUMED_FOR_BAONU_DEVOUR) return true
  // 50 击杀：旋风斩（保留旧逻辑，与策划「60秒」可并存，满足其一即吞噬）
  if (skillId === SKILL_XUANFENG_ID && (skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] || 0) >= MONSTER_KILL_FOR_XUANFENG_DEVOUR) return true
  // 60 秒战斗时间吞噬
  if (DEVOUR_60S_COMBAT_IDS.indexOf(skillId) >= 0 && isLearned(skillId)) {
    const learnedAt = skillCombatTimeLearnedAt[skillId]
    if (learnedAt != null && (combatTimeSeconds - learnedAt) >= COMBAT_SECONDS_FOR_60S_DEVOUR) return true
  }
  // 累计获得怒气：鲁莽 500、肆意放纵 1000
  if (skillId === 24 && (skillRageGainedSinceLearned[24] || 0) >= RAGE_GAINED_FOR_LUMANG_DEVOUR) return true
  if (skillId === 25 && (skillRageGainedSinceLearned[25] || 0) >= RAGE_GAINED_FOR_SIYI_DEVOUR) return true
  // 激怒时间 20 秒吞噬
  if (DEVOUR_ENRAGE_20S_IDS.indexOf(skillId) >= 0 && isLearned(skillId)) {
    const learnedAt = skillEnrageTimeLearnedAt[skillId]
    if (learnedAt != null && (enrageTimeTotal - learnedAt) >= ENRAGE_SECONDS_FOR_DEVOUR) return true
  }
  // 累计流血伤害 10000：浴血之躯
  if (skillId === DEVOUR_BLEED_10000_ID && totalBleedDamage >= BLEED_DAMAGE_FOR_YUXUE_DEVOUR) return true
  // 集齐 N 张吞噬
  for (let i = 0; i < SYNERGY_DEFS.length; i++) {
    if (!isSynergyActive(i)) continue
    const s = SYNERGY_DEFS[i]
    for (let j = 0; j < s.req.length; j++)
      if (s.req[j] === skillId) return true
  }
  return false
}

function advancedPoolUnlocked() {
  for (let i = 0; i < SYNERGY_DEFS.length; i++)
    if (isSynergyActive(i)) return true
  return false
}

function isAdvancedPoolUnlocked(pool) {
  if (pool.prerequisite != null) return isLearned(pool.prerequisite)
  if (pool.prerequisiteSynergy != null) {
    const idx = SYNERGY_DEFS.findIndex(s => s.name === pool.prerequisiteSynergy)
    return idx >= 0 && isSynergyActive(idx)
  }
  return true
}

function getUnlockedAdvancedPoolNames() {
  const names = []
  for (let i = 0; i < ADVANCED_POOLS.length; i++) {
    if (isAdvancedPoolUnlocked(ADVANCED_POOLS[i])) names.push(ADVANCED_POOLS[i].poolName)
  }
  return names
}

function getEffectiveSlotsUsed() {
  let n = 0
  for (let i = 0; i < learned_skill_ids.length; i++)
    if (!isSkillConsumedBySynergy(learned_skill_ids[i])) n++
  return n
}

// 技能栏 6 格在主界面中的位置（与 drawPanel 布局一致），用于吞噬飞卡起点
function getSkillBarSlotRects(w) {
  const gap = 16
  const btnW = 100
  const slotRowH = SKILL_BAR_SLOT_H
  const slotRowY = panelTop + 28
  const slotAreaW = Math.max(0, w - gap * 2 - btnW - gap - 8)
  const slotGap = SKILL_BAR_SLOT_GAP
  const slotH = slotRowH
  const slotW = slotAreaW > 0 ? Math.max(0, Math.floor((slotAreaW - slotGap * (SKILL_SLOTS_PER_ROW - 1)) / SKILL_SLOTS_PER_ROW)) : 0
  const slotStartX = gap
  const rects = []
  for (let i = 0; i < MAX_SKILL_SLOTS; i++) {
    const row = Math.floor(i / SKILL_SLOTS_PER_ROW)
    const col = i % SKILL_SLOTS_PER_ROW
    rects.push({
      x: slotStartX + col * (slotW + slotGap),
      y: slotRowY + row * (slotH + slotGap),
      w: slotW,
      h: slotH
    })
  }
  return rects
}

// 吞噬达成时：从技能栏（或新选卡位置）飞向「吞噬效果」Tab 的动画
function tryStartDevourAnimation(skillsInSlotsBefore, slotRects, w, h, newSkillId, newSkillCardRect) {
  if (!slotRects || slotRects.length < MAX_SKILL_SLOTS) return
  const tabBarTop = h - TAB_BAR_HEIGHT
  const tabW = w / TAB_IDS.length
  const synergyTabIdx = TAB_IDS.indexOf('synergy')
  const endX = (synergyTabIdx + 0.5) * tabW
  const endY = tabBarTop + TAB_BAR_HEIGHT / 2
  for (let i = 0; i < SYNERGY_DEFS.length; i++) {
    const s = SYNERGY_DEFS[i]
    if (synergyDevourAnimationPlayed[s.name]) continue
    if (!isSynergyActive(i)) continue
    synergyDevourAnimationPlayed[s.name] = true
    for (let k = 0; k < s.req.length; k++) {
      const skillId = s.req[k]
      const sk = getSkillById(skillId)
      const skillName = sk ? sk.name : ('id' + skillId)
      const lineColor = getCardLineColor(skillId)
      let startX, startY
      if (newSkillId === skillId && newSkillCardRect) {
        startX = newSkillCardRect.x + newSkillCardRect.w / 2
        startY = newSkillCardRect.y + newSkillCardRect.h / 2
      } else {
        const slotIndex = skillsInSlotsBefore.findIndex(slot => slot && slot.skillId === skillId)
        if (slotIndex < 0 || !slotRects[slotIndex]) continue
        const r = slotRects[slotIndex]
        startX = r.x + r.w / 2
        startY = r.y + r.h / 2
      }
      devourFloatingCards.push({
        synergyName: s.name,
        skillId,
        skillName,
        startX, startY, endX, endY,
        progress: 0,
        lineColor
      })
    }
  }
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
    const isAdvanced = id > 7
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

// 该技能所属的吞噬（基础技能可属多个，进阶技能属对应池）
function getSynergiesForSkill(skillId) {
  const sk = getSkillById(skillId)
  if (!sk) return []
  if (skillId > 7) {
    const pool = getAdvancedPoolName(skillId)
    return pool ? [pool] : []
  }
  const list = []
  for (let i = 0; i < SYNERGY_DEFS.length; i++)
    if (SYNERGY_DEFS[i].req.includes(skillId)) list.push(SYNERGY_DEFS[i].name)
  return list
}

// 该技能在选卡界面应显示的吞噬规则文案（达成什么条件后吞噬）
function getDevourRuleText(skillId) {
  const sk = getSkillById(skillId)
  if (sk && sk.devourCondition)
    return (sk.devourCondition.indexOf('吞噬') >= 0 ? '' : '吞噬条件：') + sk.devourCondition + (sk.devourCondition.indexOf('。') >= 0 ? '' : '。')
  if (skillId > 7)
    return '进阶技能，无专属吞噬条件。'
  const belongTo = getSynergiesForSkill(skillId)
  if (belongTo.length === 0)
    return '本技能无吞噬条件。'
  return '吞噬条件：集齐该吞噬所需技能即激活，组成技能不占栏位。所属吞噬：' + belongTo.join('、')
}

// 吞噬进度数字显示用：取整并缩短大数，避免一长串小数
function formatProgressDisplay(current, total) {
  const c = Math.floor(Number(current))
  const t = Number(total)
  if (t >= 10000) return c + '/' + (t / 10000) + '万'
  return c + '/' + t
}

// 该技能所属各吞噬的收集进度：[{ name, current, total }]，用于技能栏内展示
function getSynergyProgressForSkill(skillId) {
  if (DEVOUR_OBTAIN_NOW_IDS.indexOf(skillId) >= 0) return [] // 获得即吞噬无进度条
  if (skillId === SKILL_XUANFENG_ID) {
    const label = MONSTER_KILL_FOR_XUANFENG_DEVOUR + '击杀'
    const cur = skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] || 0
    return [{ name: label, current: Math.min(cur, MONSTER_KILL_FOR_XUANFENG_DEVOUR), total: MONSTER_KILL_FOR_XUANFENG_DEVOUR }]
  }
  if (skillId === SKILL_BAONU_ID) {
    const label = RAGE_CONSUMED_FOR_BAONU_DEVOUR + '怒气'
    return [{ name: label, current: Math.min(rageConsumedTotal, RAGE_CONSUMED_FOR_BAONU_DEVOUR), total: RAGE_CONSUMED_FOR_BAONU_DEVOUR }]
  }
  if (DEVOUR_60S_COMBAT_IDS.indexOf(skillId) >= 0 && isLearned(skillId)) {
    const learnedAt = skillCombatTimeLearnedAt[skillId] != null ? skillCombatTimeLearnedAt[skillId] : 0
    const current = Math.min(combatTimeSeconds - learnedAt, COMBAT_SECONDS_FOR_60S_DEVOUR)
    return [{ name: '60秒战斗', current: Math.max(0, current), total: COMBAT_SECONDS_FOR_60S_DEVOUR }]
  }
  if (skillId === 24) {
    const cur = Math.min(skillRageGainedSinceLearned[24] || 0, RAGE_GAINED_FOR_LUMANG_DEVOUR)
    return [{ name: '获得怒气', current: cur, total: RAGE_GAINED_FOR_LUMANG_DEVOUR }]
  }
  if (skillId === 25) {
    const cur = Math.min(skillRageGainedSinceLearned[25] || 0, RAGE_GAINED_FOR_SIYI_DEVOUR)
    return [{ name: '获得怒气', current: cur, total: RAGE_GAINED_FOR_SIYI_DEVOUR }]
  }
  if (DEVOUR_ENRAGE_20S_IDS.indexOf(skillId) >= 0 && isLearned(skillId)) {
    const learnedAt = skillEnrageTimeLearnedAt[skillId] != null ? skillEnrageTimeLearnedAt[skillId] : 0
    const current = Math.min(enrageTimeTotal - learnedAt, ENRAGE_SECONDS_FOR_DEVOUR)
    return [{ name: '激怒20秒', current: Math.max(0, current), total: ENRAGE_SECONDS_FOR_DEVOUR }]
  }
  if (skillId === DEVOUR_BLEED_10000_ID) {
    return [{ name: '流血伤害', current: Math.min(totalBleedDamage, BLEED_DAMAGE_FOR_YUXUE_DEVOUR), total: BLEED_DAMAGE_FOR_YUXUE_DEVOUR }]
  }
  if (skillId > 7) {
    const pool = getAdvancedPoolName(skillId)
    if (!pool) return []
    const idx = SYNERGY_DEFS.findIndex(s => s.name === pool)
    if (idx < 0) return []
    const s = SYNERGY_DEFS[idx]
    const current = s.req.filter(id => isLearned(id)).length
    return [{ name: pool, current, total: s.req.length }]
  }
  const list = []
  for (let i = 0; i < SYNERGY_DEFS.length; i++) {
    const s = SYNERGY_DEFS[i]
    if (!s.req.includes(skillId)) continue
    const current = s.req.filter(id => isLearned(id)).length
    list.push({ name: s.name, current, total: s.req.length })
  }
  return list
}

// 若选择技能 id 后能激活的吞噬（缺一张即激活时）
function getSynergiesIfChoose(skillId) {
  if (skillId > 7) return []
  const list = []
  for (let i = 0; i < SYNERGY_DEFS.length; i++) {
    const s = SYNERGY_DEFS[i]
    if (!s.req.includes(skillId)) continue
    const othersLearned = s.req.filter(r => r !== skillId).every(r => isLearned(r))
    if (othersLearned) list.push(s.name)
  }
  return list
}

// 每个吞噬的收集情况：{ name, status: 'active'|'lack1'|'none', lackName?, consumedNames? }
function getSynergyProgress() {
  const result = []
  for (let i = 0; i < SYNERGY_DEFS.length; i++) {
    const s = SYNERGY_DEFS[i]
    const learned = s.req.filter(id => isLearned(id)).length
    if (learned === s.req.length) {
      const consumedNames = s.req.map(id => (getSkillById(id) && getSkillById(id).name) || ('id' + id))
      result.push({ name: s.name, status: 'active', consumedNames })
    } else if (learned === s.req.length - 1) {
      const lackId = s.req.find(id => !isLearned(id))
      const sk = getSkillById(lackId)
      result.push({ name: s.name, status: 'lack1', lackName: sk ? sk.name : ('id' + lackId) })
    } else {
      result.push({ name: s.name, status: 'none' })
    }
  }
  return result
}

// 职业开局三技能 id（前三次升级只能从这三个里抽，抽完后再从全池抽）
function getStarterSkillIds() {
  return (getHeroClass().startSkillIds || []).slice()
}

function getLateGameSkillChance() {
  const progress = Math.min(1, (wave - 1) / LATE_GAME_PROGRESS_WAVES)
  return LATE_GAME_CHANCE_MIN + (1 - LATE_GAME_CHANCE_MIN) * progress
}

function fillSkillChoices() {
  const starterIds = getStarterSkillIds()
  const starterNotLearned = starterIds.filter(id => !isLearned(id))
  let available = []
  if (starterNotLearned.length > 0) {
    available = starterNotLearned.slice()
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[available[i], available[j]] = [available[j], available[i]]
    }
    skill_choices = available.slice(0, 3)
    skill_choice_count = skill_choices.length
    return
  }
  // 经典狂暴战阶段：愤怒化身已激活时，池子 = 未选钥匙卡 + 已展开各线当前层技能
  if (isClassicFuryPoolActive()) {
    available = buildClassicFuryPool()
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[available[i], available[j]] = [available[j], available[i]]
    }
    const n = Math.min(3, available.length)
    skill_choices = available.slice(0, n)
    skill_choice_count = n
    return
  }
  // 愤怒化身未激活前：只出现组成愤怒化身的 4 张卡（嗜血、怒击、暴怒、旋风斩），不出现斩杀与任何进阶池
  const furyAvatarSkillIds = [3, 4, 5, 6]
  available = furyAvatarSkillIds.filter(id => !isLearned(id))
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[available[i], available[j]] = [available[j], available[i]]
  }
  const n = Math.min(3, available.length)
  skill_choices = available.slice(0, n)
  skill_choice_count = n
}

function getHeroClass() {
  return CLASSES[heroClass] || CLASSES[DEFAULT_CLASS]
}

// 武器属性与打磨：EQUIPMENT_DEFS 中装备的「属性类」字段（strBonus/staBonus/attackFlat，及以后可能有的 agiBonus/intBonus 等）
// 在打磨/升级武器时都要乘 weaponForgedMul。新增属性时：1）加对应 getEquipmentXxxBonus 并乘 weaponForgedMul 2）在 getMainStat/生命/攻击等里用该 getter 3）打磨后若影响生命则更新 playerMaxHp。详见 项目上下文.md「武器属性与打磨/升级」。
function getEquipmentStrBonus() {
  let sum = 0
  for (let i = 0; i < equipment_slots.length; i++) {
    const def = equipment_slots[i] != null ? EQUIPMENT_DEFS[equipment_slots[i]] : null
    if (def && def.strBonus) sum += def.strBonus * weaponForgedMul
  }
  return sum
}

function getEquipmentStaBonus() {
  let sum = 0
  for (let i = 0; i < equipment_slots.length; i++) {
    const def = equipment_slots[i] != null ? EQUIPMENT_DEFS[equipment_slots[i]] : null
    if (def && def.staBonus) sum += def.staBonus * weaponForgedMul
  }
  return sum
}

function getEquipmentAttackFlat() {
  let sum = 0
  for (let i = 0; i < equipment_slots.length; i++) {
    const def = equipment_slots[i] != null ? EQUIPMENT_DEFS[equipment_slots[i]] : null
    if (def && def.attackFlat) sum += def.attackFlat * weaponForgedMul
  }
  return sum
}

function getMainStat() {
  if (heroType === 'str') return playerStr + getEquipmentStrBonus()
  if (heroType === 'agi') return playerAgi
  return playerInt
}

function getBaseMaxHpFromSta() {
  return HP_BASE + (playerSta + getEquipmentStaBonus()) * HP_PER_STA
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

function getSynergyHasteBonus() {
  return 0
}

function getEffectiveHaste() {
  let sum = playerHaste + getLearnedHasteBonus() + getSynergyHasteBonus()
  if (enrageBuffRemaining > 0 && isLearned(28)) sum += 15  // 狂乱之怒(28)：激怒时极速+15%
  if (kuangLuanBuffRemaining > 0 && isLearned(39)) sum += kuangLuanHasteStacks * KUANG_LUAN_HASTE_PER_STACK  // 狂乱(39)：暴怒后极速+2%每层
  return sum
}

function getCritChance(forNuJi) {
  let chance = 0
  const crit = getEffectiveCrit()
  if (crit > 0) chance = Math.min(1, crit / (crit + CRIT_RATE_DENOM))
  if (forNuJi && isLearned(22)) chance = Math.min(1, chance + 0.1) // 暴虐成性：怒击暴击几率 +10%
  if (recklessBuffRemaining > 0 && isLearned(SKILL_LUMANG_ID)) chance = Math.min(1, chance + 0.2)
  return chance
}

function getCritDamageMul(forNuJi) {
  let mul = CRIT_DAMAGE_MUL
  if (isLearned(18)) mul += 0.08   // 敌意：暴击伤害 +8%
  if (forNuJi && isLearned(22)) mul += 0.1 // 暴虐成性：怒击暴击伤害 +10%
  return mul
}

function applyCrit(damage, forNuJi) {
  const chance = getCritChance(forNuJi)
  const isCrit = Math.random() < chance
  const mul = isCrit ? getCritDamageMul(forNuJi) : 1
  return { damage: damage * mul, isCrit }
}

// 精通：最终伤害乘 (1 + 精通%)
function getEffectiveMastery() {
  let m = playerMastery
  if (enrageBuffRemaining > 0 && isLearned(1)) m += 15 // 激怒状态：精通 +15%
  return m
}

// 吸血：造成伤害的该比例回血（数值，如 3 表示 3%）
function getEffectiveLifesteal() {
  let L = playerLifesteal
  if (enrageBuffRemaining > 0 && isLearned(1)) L += 3  // 激怒状态：吸血 +3%
  return L
}

// 应用精通得到最终伤害（暴击后调用）
function applyMastery(damage) {
  const m = getEffectiveMastery()
  if (m <= 0) return damage
  return damage * (1 + m / 100)
}

// 根据造成的伤害按吸血比例回血
function applyLifestealHeal(damageDealt) {
  const L = getEffectiveLifesteal()
  if (L <= 0 || damageDealt <= 0) return
  playerHp = Math.min(playerMaxHp, playerHp + (damageDealt * L / 100))
}

// ---------- 阶段六：技能效果接新表（进阶伤害/回复/怒气倍率） ----------
function getXueDamageMul(target) {
  let mul = 1.0
  if (isLearned(15)) mul += 0.05   // 血腥疯狂：怒击和嗜血 +5%
  if (isLearned(18)) mul += 0.08   // 敌意：嗜血和怒击 +8%
  if (isLearned(16) && target && target.hp <= target.maxHp * 0.5) mul += 0.25 // 恶毒瞥视：嗜血对低于50%血 +25%
  if (isLearned(36)) mul += 0.10   // 血之气息：嗜血和暴怒 +10%
  if (enrageBuffRemaining > 0 && isLearned(32)) mul += 0.10 // 残酷：激怒时嗜血和怒击 +10%
  if (recklessBuffRemaining > 0 && isLearned(25)) mul += 0.20 // 肆意放纵：鲁莽持续时嗜血 +20%
  return mul
}

function getNuJiDamageMul() {
  let mul = 1.0
  if (isLearned(15)) mul += 0.05
  if (isLearned(18)) mul += 0.08
  if (isLearned(19)) mul += 0.10   // 酌饮怒火：怒击 +10%
  if (isLearned(21)) mul += 0.15   // 愤与怒：怒击 +15%
  if (enrageBuffRemaining > 0 && isLearned(32)) mul += 0.10
  if (recklessBuffRemaining > 0 && isLearned(25)) mul += 0.20 // 肆意放纵：鲁莽持续时怒击 +20%
  return mul
}

function getXuanFengDamageMul() {
  if (isLearned(12)) return 1.5    // 血肉顺劈：旋风斩伤害 +50%
  return 1.0
}

function getBaoNuDamageMul() {
  let mul = 1.0
  if (isLearned(36)) mul += 0.10   // 血之气息：嗜血和暴怒 +10%
  if (isLearned(37)) mul += 0.10   // 处决者的愤怒：暴怒 +10%
  return mul
}

function getZhanShaProcChance() {
  return 0.2 + (isLearned(8) ? 0.1 : 0) // 猝死：触发概率 +10%
}

function getZhanShaDamageMul() {
  let mul = SKILL_ZHANSHA_DAMAGE_MUL
  if (isLearned(8)) mul *= 1.5   // 猝死：伤害提高 50%
  if (isLearned(10)) mul *= 2    // 毁灭：伤害提高 100%
  return mul
}

function getZhanShaCooldown() {
  return Math.max(0.5, SKILL_ZHANSHA_COOLDOWN - (isLearned(10) ? SKILL_ZHANSHA_CD_REDUCE : 0))
}

function computeAttack() {
  const mainStat = getMainStat()
  const baseAttack = MAIN_STAT_ATTACK_BASE + mainStat * MAIN_STAT_ATTACK_PER_POINT
  const all = getAllSkills()
  let mul = 1.0
  for (let i = 0; i < learned_skill_ids.length; i++) {
    const id = learned_skill_ids[i]
    if (isSkillConsumedBySynergy(id)) continue
    if (id >= 0 && id < all.length && !all[id].isActive && all[id].attackMul) mul *= all[id].attackMul
  }
  let ret = baseAttack * mul * playerAttackMul + getEquipmentAttackFlat()
  if (nuJiResetBuffRemaining > 0 && isLearned(23)) ret *= 1.3
  return ret
}

function computeAttackInterval() {
  const baseInterval = BASE_ATTACK_INTERVAL
  const all = getAllSkills()
  let mul = 1.0
  for (let i = 0; i < learned_skill_ids.length; i++) {
    const id = learned_skill_ids[i]
    if (isSkillConsumedBySynergy(id)) continue
    if (id >= 0 && id < all.length && !all[id].isActive && all[id].speedMul) mul *= all[id].speedMul
  }
  let interval = baseInterval / mul / playerSpeedMul
  if (skillXueBuff > 0) interval /= 1.2
  const effectiveHaste = getEffectiveHaste()
  if (effectiveHaste > 0) interval /= (1 + effectiveHaste / HASTE_PCT_DENOM)
  if (nuJiResetBuffRemaining > 0 && isLearned(23)) interval /= 1.3
  return interval
}

function castSkillXue() {
  if (!isLearned(SKILL_XUE_ID) || skillXueCd > 0 || gameOver || gameEnded) return
  const target = findTarget()
  if (!target) return
  const baseDmg = computeAttack() * SKILL_XUE_DAMAGE_MUL * getXueDamageMul(target)
  const critResult = applyCrit(baseDmg)
  const finalDamage = applyMastery(critResult.damage)
  addDamage('xue', finalDamage)
    target.hp -= finalDamage
  effects.push({ x: target.x, y: target.y, type: 'hit', life: 0.2 })
  if (critResult.isCrit) effects.push({ x: target.x, y: target.y, type: 'crit', life: 0.6 })
  if (target.hp <= 0) {
    target.alive = false
    killCount++
    if (!target.isChallengeBoss) giveInspiration(INSPIRATION_PER_KILL)
    monsterKillCount++
    if (isLearned(SKILL_XUANFENG_ID)) skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] = (skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] || 0) + 1
    playerGold += target.isBoss ? GOLD_BOSS : GOLD_PER_KILL
    giveExp(target.isBoss ? EXP_BOSS : EXP_PER_KILL)
    if (!target.isBoss) tryDropEquipment()
    playSound('kill')
  } else {
    playSound('hit')
    setEnemySquash(target)
  }
  let healPct = SKILL_XUE_HEAL_PCT + (isLearned(14) ? 0.10 : 0) // 寒光热血：额外回复 10%
  const hpPct = playerHp / playerMaxHp
  const lowHpThreshold = isLearned(34) ? 0.5 : 0.3  // 狂怒提振(34)：阈值提到50%
  if ((isLearned(33) || isLearned(34)) && hpPct <= lowHpThreshold) healPct *= 1.2  // 狂怒回复(33)/狂怒提振(34)：低血量时嗜血回复+20%
  playerHp = Math.min(playerMaxHp, playerHp + finalDamage * healPct)
  applyLifestealHeal(finalDamage)
  addRage(RAGE_XUE_BONUS + (isLearned(14) ? 4 : 0)) // 寒光热血：嗜血额外 +4 怒气
  const enrageChance = isLearned(13) ? 0.6 : 0.3    // 新鲜血肉：嗜血触发激怒几率翻倍
  if (Math.random() < enrageChance) enrageBuffRemaining = Math.max(enrageBuffRemaining, 4)
  applyWoundToTarget(target, finalDamage)
  applyCleaveDamage(target, finalDamage)
  if (isLearned(20) && Math.random() < 0.25) skillNuJiCd = 0
  effects.push({ type: 'shout', text: '嗜血', x: PLAYER_X, y: playerY, life: 1.1, maxLife: 1.1, stackIndex: getShoutStackIndex() })
  skillXueBuff = SKILL_XUE_BUFF_DURATION
  skillXueCd = SKILL_XUE_COOLDOWN
}

function castSkillXuanFeng() {
  if (skillXuanFengCd > 0 || gameOver || gameEnded) return
  if (!isLearned(SKILL_XUANFENG_ID)) return
  const targets = getEnemiesInRange(SKILL_XUANFENG_MAX_TARGETS)
  if (targets.length === 0) return
  const baseDmg = computeAttack() * SKILL_XUANFENG_DAMAGE_MUL * getXuanFengDamageMul()
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]
    const critResult = applyCrit(baseDmg)
    const finalDamage = applyMastery(critResult.damage)
    addDamage('xuanfeng', finalDamage)
    target.hp -= finalDamage
    applyLifestealHeal(finalDamage)
    effects.push({ x: target.x, y: target.y, type: 'hit', life: 0.2 })
    if (critResult.isCrit) effects.push({ x: target.x, y: target.y, type: 'crit', life: 0.6 })
    applyWoundToTarget(target, finalDamage)
    if (target.hp <= 0) {
      target.alive = false
      killCount++
      if (!target.isChallengeBoss) giveInspiration(INSPIRATION_PER_KILL)
      monsterKillCount++
    if (isLearned(SKILL_XUANFENG_ID)) skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] = (skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] || 0) + 1
      playerGold += target.isBoss ? GOLD_BOSS : GOLD_PER_KILL
      giveExp(target.isBoss ? EXP_BOSS : EXP_PER_KILL)
      if (!target.isBoss) tryDropEquipment()
      playSound('kill')
    } else {
      playSound('hit')
      setEnemySquash(target)
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
  rageConsumedTotal += SKILL_BAONU_RAGE_COST
  const baseDamage = (playerStr * SKILL_BAONU_STR_FACTOR + computeAttack()) * SKILL_BAONU_PCT * getBaoNuDamageMul()
  const critResult = applyCrit(baseDamage)
  const finalDamage = applyMastery(critResult.damage)
  addDamage('baonu', finalDamage)
  target.hp -= finalDamage
  applyLifestealHeal(finalDamage)
  effects.push({ x: target.x, y: target.y, type: 'hit', life: 0.2 })
  if (critResult.isCrit) effects.push({ x: target.x, y: target.y, type: 'crit', life: 0.6 })
  if (target.hp <= 0) {
    target.alive = false
    killCount++
    if (!target.isChallengeBoss) giveInspiration(INSPIRATION_PER_KILL)
    monsterKillCount++
    if (isLearned(SKILL_XUANFENG_ID)) skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] = (skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] || 0) + 1
    playerGold += target.isBoss ? GOLD_BOSS : GOLD_PER_KILL
    giveExp(target.isBoss ? EXP_BOSS : EXP_PER_KILL)
    if (!target.isBoss) tryDropEquipment()
    playSound('kill')
  } else {
    playSound('hit')
    setEnemySquash(target)
  }
  enrageBuffRemaining = Math.max(enrageBuffRemaining, 4) // 暴怒进入激怒 4 秒
  applyWoundToTarget(target, finalDamage)
  applyCleaveDamage(target, finalDamage)
  if (isLearned(38)) {
    const baseDamage = (playerStr * SKILL_BAONU_STR_FACTOR + computeAttack()) * SKILL_BAONU_PCT * getBaoNuDamageMul()
    const aoe80 = applyMastery(baseDamage * 0.8)
    const allInRange = getEnemiesInRange(SKILL_XUANFENG_MAX_TARGETS)
    for (let i = 0; i < allInRange.length; i++) {
      const e = allInRange[i]
      if (!e.alive) continue
      addDamage('baonu_aoe', aoe80)
      e.hp -= aoe80
      applyLifestealHeal(aoe80)
      applyWoundToTarget(e, aoe80)
      effects.push({ x: e.x, y: e.y, type: 'hit', life: 0.15 })
      if (e.hp <= 0) {
        e.alive = false
        killCount++
        if (!e.isChallengeBoss) giveInspiration(INSPIRATION_PER_KILL)
        monsterKillCount++
    if (isLearned(SKILL_XUANFENG_ID)) skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] = (skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] || 0) + 1
        playerGold += e.isBoss ? GOLD_BOSS : GOLD_PER_KILL
        giveExp(e.isBoss ? EXP_BOSS : EXP_PER_KILL)
        if (!e.isBoss) tryDropEquipment()
        playSound('kill')
      } else {
        playSound('hit')
        setEnemySquash(e)
      }
    }
  }
  if (isLearned(39)) {
    kuangLuanHasteStacks++
    if (kuangLuanBuffRemaining <= 0) kuangLuanBuffRemaining = KUANG_LUAN_BUFF_DURATION
  }
  if (isLearned(20) && Math.random() < 0.25) skillNuJiCd = 0
  effects.push({ type: 'shout', text: '暴怒', x: PLAYER_X, y: playerY, life: 1.1, maxLife: 1.1, stackIndex: getShoutStackIndex() })
}

function castSkillNuJi() {
  if (!isLearned(SKILL_NUJI_ID) || skillNuJiCd > 0 || gameOver || gameEnded) return
  const target = findTarget()
  if (!target) return
  const baseDmg = computeAttack() * SKILL_NUJI_DAMAGE_MUL * getNuJiDamageMul()
  const critResult = applyCrit(baseDmg, true)
  const finalDamage = applyMastery(critResult.damage)
  addDamage('nuji', finalDamage)
  target.hp -= finalDamage
  applyLifestealHeal(finalDamage)
  applyWoundToTarget(target, finalDamage)
  applyCleaveDamage(target, finalDamage)
  effects.push({ x: target.x, y: target.y, type: 'hit', life: 0.2 })
  if (critResult.isCrit) effects.push({ x: target.x, y: target.y, type: 'crit', life: 0.6 })
  if (target.hp <= 0) {
    target.alive = false
    killCount++
    if (!target.isChallengeBoss) giveInspiration(INSPIRATION_PER_KILL)
    monsterKillCount++
    if (isLearned(SKILL_XUANFENG_ID)) skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] = (skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] || 0) + 1
    playerGold += target.isBoss ? GOLD_BOSS : GOLD_PER_KILL
    giveExp(target.isBoss ? EXP_BOSS : EXP_PER_KILL)
    if (!target.isBoss) tryDropEquipment()
    playSound('kill')
  } else {
    playSound('hit')
  }
  addRage(SKILL_NUJI_RAGE)
  skillNuJiCd = SKILL_NUJI_COOLDOWN
  if (isLearned(17) && Math.random() < 0.25) {
    skillNuJiCd = 0
    if (isLearned(23)) nuJiResetBuffRemaining = NUJI_RESET_BUFF_DURATION
  }
  effects.push({ type: 'shout', text: '怒击', x: PLAYER_X, y: playerY, life: 1.1, maxLife: 1.1, stackIndex: getShoutStackIndex() })
}

function getShoutStackIndex() {
  let n = 0
  for (let i = 0; i < effects.length; i++) if (effects[i].type === 'shout' && effects[i].life > 0) n++
  return n
}

function castSkillOdin() {
  if (gameOver || gameEnded || !isLearned(40) || skillOdinCd > 0) return
  const targets = getEnemiesInRange(MAX_ENEMIES)
  if (targets.length === 0) return
  const baseDmg = computeAttack() * SKILL_ODIN_DAMAGE_MUL
  const finalDamage = applyMastery(baseDmg)
  const bleedTotal = computeAttack() * SKILL_ODIN_BLEED_PCT
  for (let i = 0; i < targets.length; i++) {
    const e = targets[i]
    if (!e.alive) continue
    addDamage('odin', finalDamage)
    e.hp -= finalDamage
    applyLifestealHeal(finalDamage)
    applyWoundToTarget(e, null, bleedTotal)
    effects.push({ x: e.x, y: e.y, type: 'hit', life: 0.2 })
    if (e.hp <= 0) {
      e.alive = false
      killCount++
      if (!e.isChallengeBoss) giveInspiration(INSPIRATION_PER_KILL)
      monsterKillCount++
    if (isLearned(SKILL_XUANFENG_ID)) skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] = (skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] || 0) + 1
      playerGold += e.isBoss ? GOLD_BOSS : GOLD_PER_KILL
      giveExp(e.isBoss ? EXP_BOSS : EXP_PER_KILL)
      if (!e.isBoss) tryDropEquipment()
      playSound('kill')
    } else {
      playSound('hit')
    }
  }
  if (hasRageMechanic()) addRage(SKILL_ODIN_RAGE)
  enrageBuffRemaining = Math.max(enrageBuffRemaining, 4)
  skillOdinCd = SKILL_ODIN_COOLDOWN
  effects.push({ type: 'shout', text: '奥丁之怒', x: PLAYER_X, y: playerY, life: 1.2, maxLife: 1.2, stackIndex: getShoutStackIndex() })
}

// ---------- 阶段七：重伤/流血 dot ----------
// damageDealt：造成重伤的该次技能伤害，流血总量 = damageDealt * 50%；customTotal：奥丁等直接指定总量时用
function applyWoundToTarget(enemy, damageDealt, customTotal) {
  if (!enemy || !enemy.alive) return
  let addTotal = 0
  if (customTotal != null) {
    addTotal = customTotal
  } else if (damageDealt != null && isLearned(26)) {
    addTotal = damageDealt * WOUND_DAMAGE_PCT
  } else {
    return
  }
  if (addTotal <= 0) return
  if (enemy.wound) {
    enemy.wound.totalRemaining += addTotal
    enemy.wound.remaining = WOUND_DURATION
    enemy.wound.tickAccumulator = 0
  } else {
    enemy.wound = { remaining: WOUND_DURATION, totalRemaining: addTotal, tickAccumulator: 0 }
  }
}

function tickWound(dt) {
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]
    if (!e.alive || !e.wound || e.wound.remaining <= 0 || e.wound.totalRemaining <= 0) continue
    const w = e.wound
    if (w.tickAccumulator == null) w.tickAccumulator = 0
    w.tickAccumulator += dt
    while (w.tickAccumulator >= WOUND_TICK_INTERVAL && w.remaining > 0 && w.totalRemaining > 0) {
      const tickDuration = Math.min(WOUND_TICK_INTERVAL, w.remaining)
      const dmgRaw = w.totalRemaining * (tickDuration / w.remaining)
      const dmg = isLearned(27) ? dmgRaw * 1.2 : dmgRaw
      w.totalRemaining -= dmgRaw
      w.remaining -= tickDuration
      w.tickAccumulator -= WOUND_TICK_INTERVAL
      if (dmg > 0) {
        totalBleedDamage += dmg
        damageByType.bleed = (damageByType.bleed || 0) + dmg
        e.hp -= dmg
        applyLifestealHeal(dmg)
        if (e.hp <= 0) {
          e.alive = false
          killCount++
          if (!e.isChallengeBoss) giveInspiration(INSPIRATION_PER_KILL)
          monsterKillCount++
    if (isLearned(SKILL_XUANFENG_ID)) skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] = (skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] || 0) + 1
          playerGold += e.isBoss ? GOLD_BOSS : GOLD_PER_KILL
          giveExp(e.isBoss ? EXP_BOSS : EXP_PER_KILL)
          if (!e.isBoss) tryDropEquipment()
          playSound('kill')
          break
        }
      }
      if (w.remaining <= 0 || w.totalRemaining <= 0) break
    }
    if (w.remaining <= 0 || w.totalRemaining <= 0) delete e.wound
  }
}

// 顺劈：对主目标外的最多 4 个范围内敌人造成 mainDamage * SHUNPI_DAMAGE_MUL 伤害（mainDamage 为已应用精通后的主目标伤害）
function applyCleaveDamage(mainTarget, mainDamage) {
  if (skillShunpiBuff <= 0) return
  const allInRange = getEnemiesInRange(SKILL_XUANFENG_MAX_TARGETS + SHUNPI_EXTRA_TARGETS)
  const others = allInRange.filter(e => e !== mainTarget && e.alive).slice(0, SHUNPI_EXTRA_TARGETS)
  const cleaveDmg = mainDamage * SHUNPI_DAMAGE_MUL
  for (let i = 0; i < others.length; i++) {
    const e = others[i]
    addDamage('cleave', cleaveDmg)
    e.hp -= cleaveDmg
    applyLifestealHeal(cleaveDmg)
    applyWoundToTarget(e, cleaveDmg)
    effects.push({ x: e.x, y: e.y, type: 'hit', life: 0.15 })
    if (e.hp <= 0) {
      e.alive = false
      killCount++
      if (!e.isChallengeBoss) giveInspiration(INSPIRATION_PER_KILL)
      monsterKillCount++
    if (isLearned(SKILL_XUANFENG_ID)) skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] = (skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] || 0) + 1
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
  if (levelUpDelayRemaining > 0) return
  levelUpDelayRemaining = 0.5
}

// 下次学习技能消耗的灵感：二次曲线过 (1,5)、(2,8)、(15,100)，第 15 次达 100 后封顶
function getLearnSkillCost() {
  const n = skillLearnCount + 1
  const cost = (470 + 387 * n + 53 * n * n) / 182
  return Math.min(LEARN_SKILL_COST_CAP, Math.ceil(cost))
}

function giveInspiration(amount) {
  playerInspiration += amount
}

function doLevelUp() {
  playerExp -= playerExpToNext
  const cls = getHeroClass()
  playerStr += cls.strPerLevel || 0
  playerAgi += cls.agiPerLevel || 0
  playerInt += cls.intPerLevel || 0
  playerSta += cls.staPerLevel || 0
  const extraMaxHp = playerMaxHp - getBaseMaxHpFromSta()
  playerMaxHp = getBaseMaxHpFromSta() + Math.max(0, extraMaxHp)
  playerHp = Math.min(playerHp, playerMaxHp)
  playerLevel++
  playerExpToNext = BASE_EXP_TO_NEXT + playerLevel * 5
  playSound('levelup')
}

function openLearnSkillChoice() {
  if (gameState !== 'playing' || gameOver || gameEnded) return
  const cost = getLearnSkillCost()
  if (playerInspiration < cost) return
  choosingSkillByInspiration = true
  gameState = 'choosing_skill'
  fillSkillChoices()
}

function chooseSkill(index) {
  if (gameState !== 'choosing_skill') return
  if (index < 0 || index >= skill_choice_count) return
  if (choosingSkillByInspiration) {
    const cost = getLearnSkillCost()
    if (playerInspiration < cost) return
    playerInspiration -= cost
    skillLearnCount++
    choosingSkillByInspiration = false
  }
  const id = skill_choices[index]
  if (isKeyCardId(id)) {
    pickedKeyCardIds.push(id)
    tryGrantDualWielderWeapon()
    gameState = 'playing'
    return
  }
  if (getEffectiveSlotsUsed() >= MAX_SKILL_SLOTS) {
    pendingReplaceSkillId = id
    gameState = 'choosing_replace_target'
    return
  }
  const skillsInSlotsBefore = getSkillsInSlots()
  const slotRects = getSkillBarSlotRects(gameWidth)
  const chosenCardRect = (index >= 0 && index < skillChoiceRects.length) ? skillChoiceRects[index] : null
  learned_skill_ids.push(id)
  recordDevourTimersOnLearn(id)
  tryStartDevourAnimation(skillsInSlotsBefore, slotRects, gameWidth, gameHeight, id, chosenCardRect)
  tryGrantDualWielderWeapon()
  gameState = 'playing'
}
function recordDevourTimersOnLearn(skillId) {
  if (DEVOUR_60S_COMBAT_IDS.indexOf(skillId) >= 0) skillCombatTimeLearnedAt[skillId] = combatTimeSeconds
  if (DEVOUR_ENRAGE_20S_IDS.indexOf(skillId) >= 0) skillEnrageTimeLearnedAt[skillId] = enrageTimeTotal
  if (skillId === 24) skillRageGainedSinceLearned[24] = 0
  if (skillId === 25) skillRageGainedSinceLearned[25] = 0
  if (skillId === SKILL_XUANFENG_ID) skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] = 0
}

function tryGrantDualWielderWeapon() {
  if (!isSynergyActive(SYNERGY_DUAL_WIELDER_INDEX)) return
  if (equipment_slots[0] != null) return
  equipment_slots[0] = EQUIP_DUAL_SWORDS_ID
  applyEquipmentEffect(EQUIP_DUAL_SWORDS_ID)
  const def = EQUIPMENT_DEFS[EQUIP_DUAL_SWORDS_ID]
  weaponGrantToastName = def ? def.name : '两把双手剑'
  weaponGrantToastDuration = 1.8
  weaponGrantToastRemaining = 1.8
}

function replaceSkillAtSlot(slotIndex) {
  if (gameState !== 'choosing_replace_target' || pendingReplaceSkillId == null) return
  if (isKeyCardId(pendingReplaceSkillId)) return
  const toRemove = getSkillIdAtSlot(slotIndex)
  if (toRemove == null) return
  if (choosingSkillByInspiration) {
    const cost = getLearnSkillCost()
    if (playerInspiration < cost) return
    playerInspiration -= cost
    skillLearnCount++
    choosingSkillByInspiration = false
  }
  const skillsInSlotsBefore = getSkillsInSlots()
  const slotRects = getSkillBarSlotRects(gameWidth)
  const replacedSlotRect = (slotIndex >= 0 && slotIndex < replaceSlotRects.length) ? replaceSlotRects[slotIndex] : null
  learned_skill_ids = learned_skill_ids.filter(sid => sid !== toRemove)
  const id = pendingReplaceSkillId
  learned_skill_ids.push(id)
  recordDevourTimersOnLearn(id)
  tryStartDevourAnimation(skillsInSlotsBefore, slotRects, gameWidth, gameHeight, id, replacedSlotRect)
  tryGrantDualWielderWeapon()
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
  choosingSkillByInspiration = false
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
  playerSta = cls.baseSta != null ? cls.baseSta : 15
  playerMaxHp = getBaseMaxHpFromSta()
  playerHp = playerMaxHp
  playerAttackMul = 1.0
  playerSpeedMul = 1.0
  weaponForgeCount = 0
  weaponForgedMul = 1.0
  weaponGrantToastRemaining = 0
  weaponGrantToastName = ''
  weaponGrantToastDuration = 1.8
  playerCrit = 0
  playerHaste = 0
  playerRage = 0
  playerMastery = 0
  playerLifesteal = 0
  timeSinceAttack = 0
  gameOver = false
  killCount = 0
  monsterKillCount = 0
  skillMonsterKillSinceLearned = {}
  rageConsumedTotal = 0
  combatTimeSeconds = 0
  skillCombatTimeLearnedAt = {}
  rageGainedTotal = 0
  skillRageGainedSinceLearned = {}
  enrageBuffRemaining = 0
  enrageTimeTotal = 0
  skillEnrageTimeLearnedAt = {}
  totalBleedDamage = 0
  playerGold = 0
  playerInspiration = 0
  skillLearnCount = 0
  damageByType = { normal: 0, xue: 0, nuji: 0, xuanfeng: 0, cleave: 0, baonu: 0, baonu_aoe: 0, zhansha: 0, odin: 0, bleed: 0 }
  hitCountByType = { normal: 0, xue: 0, nuji: 0, xuanfeng: 0, cleave: 0, baonu: 0, baonu_aoe: 0, zhansha: 0, odin: 0, bleed: 0 }
  enemies = []
  timeSinceSpawn = 0
  wave = 1
  spawnsThisWave = 0
  waveBreakCountdown = 0
  skillXueCd = 0
  skillXueBuff = 0
  skillXuanFengCd = 0
  skillShunpiBuff = 0
  skillNuJiCd = 0
  skillZhanShaCd = 0
  nuJiResetBuffRemaining = 0
  skillLumangCd = 0
  recklessBuffRemaining = 0
  kuangLuanHasteStacks = 0
  kuangLuanBuffRemaining = 0
  skillOdinCd = 0
  deathReviveUsed = false
  synergyDevourAnimationPlayed = {}
  devourFloatingCards = []
  challengeCount = 0
  challengeTimer = 0
  gameEnded = false
  gameState = 'playing'
  damageStatsOverlayOpen = false
  synergyOverlayOpen = false
  attributeOverlayOpen = false
  bottomDrawerTab = null
  drawerSlideProgress = 0
  playerLevel = 1
  playerExp = 0
  playerExpToNext = BASE_EXP_TO_NEXT
  levelUpDelayRemaining = 0
  learned_skill_ids = []
  pickedKeyCardIds = []
  skill_choices = []
  skill_choice_count = 0
  skillRefreshChances = 0
  pendingReplaceSkillId = null
  pendingDropEquipmentId = null
  playerAttackFlat = 0
  equipment_slots = []
  for (let i = 0; i < MAX_EQUIP_SLOTS; i++) equipment_slots.push(null)
  effects = []
  try { wx.removeStorageSync(SAVE_KEY) } catch (e) {}
}

function buyShopItem(i) {
  if (bottomDrawerTab !== 'shop' || i < 0 || i >= SHOP_ITEMS.length) return false
  const item = SHOP_ITEMS[i]
  const cost = item.cost
  if (playerGold < cost) return false
  playerGold -= cost
  playSound('buy')
  if (item.healPct != null) {
    const heal = item.healPct * playerMaxHp
    playerHp = Math.min(playerHp + heal, playerMaxHp)
  }
  return true
}

function buyForgeWeapon() {
  const cost = getForgeWeaponCost()
  if (playerGold < cost) return false
  playerGold -= cost
  playSound('buy')
  const extraMaxHp = playerMaxHp - getBaseMaxHpFromSta()
  weaponForgeCount += 1
  weaponForgedMul *= FORGE_WEAPON_STAT_MUL
  playerMaxHp = getBaseMaxHpFromSta() + Math.max(0, extraMaxHp)
  playerHp = Math.min(playerHp, playerMaxHp)
  return true
}

function spawnEnemy() {
  if (gameEnded) return
  if (spawnsThisWave >= SPAWNS_PER_WAVE) return
  let slot = -1
  for (let i = 0; i < enemies.length; i++) {
    if (!enemies[i].alive) {
      slot = i
      break
    }
  }
  if (slot < 0 && enemies.length >= MAX_ENEMIES) return
  const yMin = gameTop + GAME_MARGIN_Y
  const yMax = gameTop + gameHeight - GAME_MARGIN_Y
  const isBoss = (wave % 5 === 0) && (spawnsThisWave === 0)
  const waveHp = getWaveEnemyHp(wave)
  const maxHp = isBoss ? waveHp * BOSS_HP_MUL : waveHp
  const speed = isBoss ? ENEMY_SPEED * BOSS_SPEED_MUL : ENEMY_SPEED
  const e = {
    x: WORLD_WIDTH - SPAWN_MARGIN,
    y: yMin + Math.random() * (yMax - yMin),
    hp: maxHp,
    maxHp: maxHp,
    speed: speed,
    attack: ENEMY_ATTACK,
    attackCooldown: 0,
    alive: true,
    isBoss: isBoss,
    appearance: 'slime',
    wobblePhase: Math.random() * Math.PI * 2
  }
  if (slot >= 0) enemies[slot] = e
  else enemies.push(e)
  spawnsThisWave++
  // 第 20 波刷完后不进入波次间隔倒计时，通关改为「20 波怪全清 + Boss 死后」判定
  if (spawnsThisWave >= SPAWNS_PER_WAVE && wave < MAX_WAVE) waveBreakCountdown = WAVE_BREAK_DURATION
}

function getFirstBossHp() {
  const waveHp = getWaveEnemyHp(FIRST_BOSS_WAVE)
  return waveHp * BOSS_HP_MUL
}

function getChallengeBoss() {
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i].alive && enemies[i].isChallengeBoss) return enemies[i]
  }
  return null
}

const CHALLENGE_CENTER_X = (PLAYER_X + WORLD_WIDTH) / 2  // 挑战 Boss 生成在屏幕水平中央（世界坐标）
const CHALLENGE_BOSS_Y_GAP = 22  // 多只挑战 Boss 时垂直间距（像素）

// 大波次：1-4 第1波(只数1,2,3,4)，5 大Boss(1只)，6-9 第2波(1,2,3,4)，10 大Boss，11-14 第3波… 只数 (层-1)%5 → 0,1,2,3,4 对应 1,2,3,4,1
function getChallengeBossCount() {
  const layer = challengeCount + 1
  const pos = (layer - 1) % 5
  return pos === 4 ? 1 : pos + 1
}

// 挑战阶段：1-5 层阶段 0，6-10 层阶段 1，11-15 层阶段 2… 用于攻击力与奖励档位
function getChallengeStage() {
  const layer = challengeCount + 1
  return Math.floor((layer - 1) / 5)
}

// 是否大 Boss 层（5、10、15…），大 Boss 血量 = 上一阶段小怪 ×2.5
function isChallengeBigBossLayer() {
  const layer = challengeCount + 1
  return layer % 5 === 0
}

function spawnChallengeBoss() {
  const firstBossHp = getFirstBossHp()
  const B = firstBossHp * CHALLENGE_FIRST_BOSS_HP_PCT
  const layer = challengeCount + 1
  const stage = getChallengeStage()
  const numBosses = getChallengeBossCount()
  const isBigBoss = isChallengeBigBossLayer()
  const hpPerBoss = isBigBoss
    ? B * Math.pow(2, Math.floor(layer / 5) - 1) * 2.5
    : B * Math.pow(2, Math.floor(layer / 5))
  const attackPerBoss = ENEMY_ATTACK * Math.pow(2, stage)
  const slotsNeeded = []
  for (let i = 0; i < enemies.length; i++) {
    if (!enemies[i].alive) slotsNeeded.push(i)
    if (slotsNeeded.length >= numBosses) break
  }
  while (slotsNeeded.length < numBosses) slotsNeeded.push(-1)
  for (let i = 0; i < numBosses; i++) {
    const yOffset = numBosses === 1 ? 0 : (i - (numBosses - 1) / 2) * CHALLENGE_BOSS_Y_GAP
    const e = {
      x: CHALLENGE_CENTER_X,
      y: playerY + yOffset,
      hp: hpPerBoss,
      maxHp: hpPerBoss,
      speed: ENEMY_SPEED * BOSS_SPEED_MUL,
      attack: attackPerBoss,
      attackCooldown: 0,
      alive: true,
      isBoss: true,
      isChallengeBoss: true,
      appearance: 'slime',
      wobblePhase: Math.random() * Math.PI * 2
    }
    const slot = slotsNeeded[i]
    if (slot >= 0) enemies[slot] = e
    else enemies.push(e)
  }
  challengeTimer = CHALLENGE_DURATION
  effects.push({ type: 'shout', text: '挑战开始！', x: PLAYER_X, y: playerY, life: 1.2, maxLife: 1.2, stackIndex: getShoutStackIndex() })
}

function isInAttackRange(ex) {
  const r = getAttackRadius()
  const playerSx = worldToScreenX(PLAYER_X)
  const exSx = worldToScreenX(ex.x)
  const dx = exSx - playerSx
  const dy = ex.y - playerY
  if (dx < 0) return false
  return dx * dx + dy * dy <= r * r
}

function findTarget() {
  let best = null
  let bestD2 = 1e9
  const r2 = getAttackRadius() * getAttackRadius()
  const playerSx = worldToScreenX(PLAYER_X)
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]
    if (!e.alive) continue
    const dx = worldToScreenX(e.x) - playerSx
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
  const playerSx = worldToScreenX(PLAYER_X)
  const list = []
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]
    if (!e.alive) continue
    const dx = worldToScreenX(e.x) - playerSx
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

if (typeof wx.onTouchStart === 'function') {
  wx.onTouchStart(function (e) {
    const t = e.touches && e.touches[0]
    if (!t) return
    const x = t.x !== undefined ? t.x : t.clientX
    const y = t.y !== undefined ? t.y : t.clientY
    if (gameState === 'playing' && bottomDrawerTab === 'damage' && drawerSlideProgress >= 0.98 && damageStatsBoxBounds && hitTest(x, y, damageStatsBoxBounds)) {
      damageStatsDragging = true
      damageStatsDragStartY = y
      damageStatsDragStartScroll = damageStatsScrollY
    }
  })
}
if (typeof wx.onTouchMove === 'function') {
  wx.onTouchMove(function (e) {
    if (!damageStatsDragging || !damageStatsBoxBounds) return
    const t = e.touches && e.touches[0]
    if (!t) return
    const y = t.y !== undefined ? t.y : t.clientY
    const maxScroll = Math.max(0, damageStatsContentHeight - damageStatsBoxBounds.h)
    let next = damageStatsDragStartScroll + (damageStatsDragStartY - y)
    next = Math.max(0, Math.min(maxScroll, next))
    damageStatsScrollY = next
  })
}

wx.onTouchEnd(function (e) {
  damageStatsDragging = false
  const t = e.changedTouches && e.changedTouches[0]
  if (!t) return
  const x = t.x !== undefined ? t.x : t.clientX
  const y = t.y !== undefined ? t.y : t.clientY
  if (gameState === 'playing') {
    const w = canvas.width
    const h = canvas.height
    if (y >= h - TAB_BAR_HEIGHT && tabRects.length >= TAB_IDS.length) {
      const tabIndex = getTabIndexFromX(x, w)
      const nextTab = TAB_IDS[tabIndex]
      bottomDrawerTab = (bottomDrawerTab === nextTab ? null : nextTab)
      if (bottomDrawerTab !== 'damage') damageStatsScrollY = 0
      return
    }
    if (bottomDrawerTab === 'game' && drawerSlideProgress >= 0.98) {
      if (drawerGameChallengeRect && hitTest(x, y, drawerGameChallengeRect) && challengeTimer <= 0) {
        spawnChallengeBoss()
        return
      }
      if (drawerGameLearnSkillRect && hitTest(x, y, drawerGameLearnSkillRect) && playerInspiration >= getLearnSkillCost()) {
        openLearnSkillChoice()
        return
      }
      if (drawerGameForgeBuyRect && hitTest(x, y, drawerGameForgeBuyRect) && playerGold >= getForgeWeaponCost()) {
        buyForgeWeapon()
        return
      }
    }
    if (bottomDrawerTab === 'shop' && drawerSlideProgress >= 0.98 && shopBuyRects.length > 0) {
      for (let i = 0; i < shopBuyRects.length; i++) {
        if (hitTest(x, y, shopBuyRects[i])) {
          buyShopItem(i)
          return
        }
      }
    }
    // 仅当触摸点确实在抽屉区域内才吞掉事件，与 drawBottomDrawer 用同一套高度（不超过 panelContentBottom）
    const tabBarTop = h - TAB_BAR_HEIGHT
    const panelContentBottom = (TOP_SAFE_MARGIN + Math.floor((h - TOP_SAFE_MARGIN) * GAME_HEIGHT_RATIO)) + 28 + (Math.ceil(MAX_SKILL_SLOTS / SKILL_SLOTS_PER_ROW) * SKILL_BAR_SLOT_H + (Math.ceil(MAX_SKILL_SLOTS / SKILL_SLOTS_PER_ROW) - 1) * SKILL_BAR_SLOT_GAP) + 16 + 44
    const maxDrawerH = Math.max(180, tabBarTop - panelContentBottom)
    const drawerH = Math.min(340, Math.floor((h - TAB_BAR_HEIGHT) * 0.55), maxDrawerH)
    const drawerTop = tabBarTop - drawerH
    if (bottomDrawerTab != null && drawerSlideProgress >= 0.98 && y >= drawerTop) return
    if (lumangButtonRect && hitTest(x, y, lumangButtonRect) && isLearned(SKILL_LUMANG_ID) && skillLumangCd <= 0 && recklessBuffRemaining <= 0) {
      recklessBuffRemaining = LUMANG_BUFF_DURATION
      skillLumangCd = LUMANG_COOLDOWN
      if (isLearned(25)) addRage(50)
      effects.push({ type: 'shout', text: '鲁莽！', x: PLAYER_X, y: playerY, life: 1.2, maxLife: 1.2, stackIndex: getShoutStackIndex() })
      return
    }
    if (odinButtonRect && hitTest(x, y, odinButtonRect) && isLearned(40) && skillOdinCd <= 0 && getEnemiesInRange(1).length > 0) {
      castSkillOdin()
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
  }
  if (gameState === 'title') {
    if (hitTest(x, y, titleNewRect)) {
      try { wx.removeStorageSync(SAVE_KEY) } catch (e) {}
      resetGame()
      const introVideoEl = (typeof document !== 'undefined' && document.getElementById('intro-video')) || null
      if (INTRO_VIDEO_URL && introVideoEl) {
        introUseVideo = true
        gameState = 'intro'
        introVideoEl.style.display = 'block'
        introVideoEl.currentTime = 0
        introVideoEl.onended = function () {
          introVideoEl.style.display = 'none'
          introVideoEl.onended = null
          introVideoEl.onerror = null
          introUseVideo = false
          gameState = 'playing'
        }
        introVideoEl.onerror = function () {
          introVideoEl.style.display = 'none'
          introVideoEl.onended = null
          introVideoEl.onerror = null
          introUseVideo = false
          gameState = 'playing'
        }
        if (!introVideoPreloaded) {
          introVideoEl.src = getIntroVideoSrc()
          introVideoEl.load()
        }
        if (isIntroVideoFullyLoaded()) introVideoEl.play().catch(function () {})
      } else if (INTRO_DURATION > 0) {
        introUseVideo = false
        gameState = 'intro'
        introTimer = INTRO_DURATION
      } else {
        gameState = 'playing'
      }
    } else if (titleContinueRect && hitTest(x, y, titleContinueRect)) {
      loadGame()
      gameState = 'playing'
    }
    return
  }
  if (gameState === 'intro') {
    // 点击/触摸可跳过开场动画
    if (introUseVideo) {
      const introVideoEl = typeof document !== 'undefined' && document.getElementById('intro-video')
      if (introVideoEl) {
        introVideoEl.pause()
        introVideoEl.style.display = 'none'
        introVideoEl.onended = null
      }
      introUseVideo = false
      gameState = 'playing'
    } else {
      introTimer = 0
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
      gameState = 'title'
    } catch (e) {}
  }
  updateLayout()

  if (gameState === 'title') {
    if (!introVideoPreloaded && INTRO_VIDEO_URL && typeof document !== 'undefined') {
      const preloadEl = document.getElementById('intro-video')
      if (preloadEl) {
        preloadEl.src = getIntroVideoSrc()
        preloadEl.load()
        introVideoPreloaded = true
      }
    }
    drawTitleScreen(w, h)
    requestAnimationFrame(loop)
    return
  }

  if (gameState === 'intro') {
    if (introUseVideo) {
      const introVideoEl = typeof document !== 'undefined' && document.getElementById('intro-video')
      if (introVideoEl && introVideoEl.ended) {
        introVideoEl.style.display = 'none'
        introUseVideo = false
        gameState = 'playing'
      } else if (introVideoEl && introVideoEl.paused && !introVideoEl.ended && isIntroVideoFullyLoaded()) {
        introVideoEl.play().catch(function () {})
      }
    } else {
      introTimer -= dt
      if (introTimer <= 0) {
        introTimer = 0
        gameState = 'playing'
      }
    }
    drawIntroScreen(w, h)
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
  // 通关判定：第 20 波已刷完且场上无存活敌人（含本关 Boss 死亡）即通关
  if (!gameEnded && wave === MAX_WAVE && spawnsThisWave >= SPAWNS_PER_WAVE) {
    const anyAlive = enemies.some(e => e.alive)
    if (!anyAlive) {
      gameEnded = true
      saveGame()
    }
  }
  // 波次间隔：本波怪物全部出完后开始计时，倒计时结束进入下一波（第 20 波不再进入倒计时）
  if (!gameEnded) {
    if (waveBreakCountdown > 0) {
      waveBreakCountdown -= dt
      if (waveBreakCountdown <= 0) {
        waveBreakCountdown = 0
        spawnsThisWave = 0
        wave++
        if (wave > MAX_WAVE) gameEnded = true
        saveGame()
      }
    } else {
      timeSinceSpawn += dt
      if (timeSinceSpawn >= SPAWN_INTERVAL) {
        timeSinceSpawn = 0
        spawnEnemy()
      }
    }
  }

  if (levelUpDelayRemaining > 0) {
    levelUpDelayRemaining -= dt
    if (levelUpDelayRemaining <= 0) {
      levelUpDelayRemaining = 0
      doLevelUp()
    }
  }

  // 挑战 Boss：倒计时与成功/失败判定
  if (challengeTimer > 0) {
    const cb = getChallengeBoss()
    if (!cb) {
      const rewardStage = Math.floor((challengeCount + 1) / 5)
      const reward = Math.min(CHALLENGE_REWARD_CAP, Math.floor(CHALLENGE_GOLD_BASE * Math.pow(CHALLENGE_GOLD_MUL, rewardStage)))
      playerGold += reward
      giveInspiration(reward)
      challengeCount++
      challengeTimer = 0
      effects.push({ type: 'shout', text: '挑战成功！', x: PLAYER_X, y: playerY, life: 1.5, maxLife: 1.5, stackIndex: getShoutStackIndex() })
    } else {
      challengeTimer -= dt
      if (challengeTimer <= 0) {
        cb.alive = false
        challengeTimer = 0
        effects.push({ type: 'shout', text: '挑战失败', x: PLAYER_X, y: playerY, life: 1.5, maxLife: 1.5, stackIndex: getShoutStackIndex() })
      }
    }
  }

  // 仅战斗内累计时间（选技能/商店/波次间隔不计）
  if (waveBreakCountdown <= 0) combatTimeSeconds += dt
  // 灵感：每秒 +1（与战斗时间同节奏，进行中即增加）
  if (gameState === 'playing' && !gameOver && !gameEnded) playerInspiration += dt * INSPIRATION_PER_SECOND
  // 激怒状态计时
  if (enrageBuffRemaining > 0) {
    enrageBuffRemaining = Math.max(0, enrageBuffRemaining - dt)
    enrageTimeTotal += dt
  }
  if (recklessBuffRemaining > 0) recklessBuffRemaining = Math.max(0, recklessBuffRemaining - dt)
  skillLumangCd = Math.max(0, skillLumangCd - dt)
  if (kuangLuanBuffRemaining > 0) {
    kuangLuanBuffRemaining = Math.max(0, kuangLuanBuffRemaining - dt)
    if (kuangLuanBuffRemaining <= 0) kuangLuanHasteStacks = 0
  }
  skillOdinCd = Math.max(0, skillOdinCd - dt * (1 + getEffectiveHaste() / HASTE_PCT_DENOM))
  tickWound(dt)
  const effectiveHaste = getEffectiveHaste()
  const hasteFactor = 1 + effectiveHaste / HASTE_PCT_DENOM
  skillXueCd = Math.max(0, skillXueCd - dt * hasteFactor)
  skillXueBuff = Math.max(0, skillXueBuff - dt)
  skillXuanFengCd = Math.max(0, skillXuanFengCd - dt * hasteFactor)
  skillShunpiBuff = Math.max(0, skillShunpiBuff - dt)
  skillNuJiCd = Math.max(0, skillNuJiCd - dt * hasteFactor)
  skillZhanShaCd = Math.max(0, skillZhanShaCd - dt * hasteFactor)
  nuJiResetBuffRemaining = Math.max(0, nuJiResetBuffRemaining - dt)
  if (isLearned(SKILL_XUE_ID) && skillXueCd <= 0 && findTarget()) castSkillXue()
  if (skillXuanFengCd <= 0 && getEnemiesInRange(1).length > 0) castSkillXuanFeng()
  if (isLearned(SKILL_BAONU_ID) && playerRage >= SKILL_BAONU_RAGE_COST && findTarget()) castSkillBaoNu()
  if (isLearned(SKILL_NUJI_ID) && skillNuJiCd <= 0 && findTarget()) castSkillNuJi()

  const critResult = applyCrit(computeAttack())
  const interval = computeAttackInterval()
  timeSinceAttack += dt
  if (timeSinceAttack >= interval) {
    const normalTargets = isLearned(2) ? getEnemiesInRange(2) : (findTarget() ? [findTarget()] : [])
    if (normalTargets.length > 0) {
      const finalDamage = applyMastery(critResult.damage)
      timeSinceAttack = 0
      addRage(RAGE_PER_DAMAGE)
      if (critResult.isCrit) addRage(RAGE_ON_CRIT)
      for (let ti = 0; ti < normalTargets.length; ti++) {
        const target = normalTargets[ti]
        addDamage('normal', finalDamage)
        target.hp -= finalDamage
        applyLifestealHeal(finalDamage)
        if (target.hp <= 0) {
          effects.push({ x: target.x, y: target.y, type: 'hit', life: 0.2 })
          if (critResult.isCrit) effects.push({ x: target.x, y: target.y, type: 'crit', life: 0.6 })
          target.alive = false
          killCount++
          if (!target.isChallengeBoss) giveInspiration(INSPIRATION_PER_KILL)
          monsterKillCount++
    if (isLearned(SKILL_XUANFENG_ID)) skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] = (skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] || 0) + 1
          playerGold += target.isBoss ? GOLD_BOSS : GOLD_PER_KILL
          giveExp(target.isBoss ? EXP_BOSS : EXP_PER_KILL)
          if (!target.isBoss) tryDropEquipment()
          playSound('kill')
        } else {
          effects.push({ x: target.x, y: target.y, type: 'hit', life: 0.12 })
          if (critResult.isCrit) effects.push({ x: target.x, y: target.y, type: 'crit', life: 0.6 })
          playSound('hit')
          setEnemySquash(target)
        }
        if (ti === 0 && target.alive && isLearned(SKILL_ZHANSHA_ID) && Math.random() < getZhanShaProcChance() && skillZhanShaCd <= 0) {
          const zsBase = computeAttack() * getZhanShaDamageMul()
          const zsCrit = applyCrit(zsBase)
          const zsFinal = applyMastery(zsCrit.damage)
          addDamage('zhansha', zsFinal)
          target.hp -= zsFinal
          applyLifestealHeal(zsFinal)
          applyWoundToTarget(target, zsFinal)
          applyCleaveDamage(target, zsFinal)
          if (hasRageMechanic()) {
            if (isLearned(9)) addRage(20)
            if (isLearned(37)) addRage(5)
          }
          skillZhanShaCd = getZhanShaCooldown()
          effects.push({ x: target.x, y: target.y, type: 'hit', life: 0.2 })
          if (zsCrit.isCrit) effects.push({ x: target.x, y: target.y, type: 'crit', life: 0.6 })
          effects.push({ type: 'shout', text: '斩杀', x: PLAYER_X, y: playerY, life: 1.0, maxLife: 1.0, stackIndex: getShoutStackIndex() })
          if (target.hp <= 0) {
            target.alive = false
            killCount++
            if (!target.isChallengeBoss) giveInspiration(INSPIRATION_PER_KILL)
            monsterKillCount++
    if (isLearned(SKILL_XUANFENG_ID)) skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] = (skillMonsterKillSinceLearned[SKILL_XUANFENG_ID] || 0) + 1
            playerGold += target.isBoss ? GOLD_BOSS : GOLD_PER_KILL
            giveExp(target.isBoss ? EXP_BOSS : EXP_PER_KILL)
            if (!target.isBoss) tryDropEquipment()
            playSound('kill')
          } else {
            playSound('hit')
            setEnemySquash(target)
          }
        }
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
        let dmg = e.attack
        if (enrageBuffRemaining > 0 && isLearned(31)) dmg *= 0.9
        playerHp -= dmg
        if (playerHp <= 0) {
          if (isLearned(35) && !deathReviveUsed) {
            playerHp = Math.ceil(playerMaxHp * 0.5)
            deathReviveUsed = true
            effects.push({ type: 'shout', text: '生死决战！', x: PLAYER_X, y: playerY, life: 1.5, maxLife: 1.5, stackIndex: getShoutStackIndex() })
          } else {
            playerHp = 0
            gameOver = true
            saveGame()
          }
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

  if (bottomDrawerTab != null && drawerSlideProgress < 1) drawerSlideProgress = Math.min(1, drawerSlideProgress + 0.12)
  if (bottomDrawerTab == null && drawerSlideProgress > 0) {
    drawerSlideProgress = Math.max(0, drawerSlideProgress - 0.12)
    if (drawerSlideProgress <= 0) drawerSlideProgress = 0
  }
  if (weaponGrantToastRemaining > 0) weaponGrantToastRemaining = Math.max(0, weaponGrantToastRemaining - dt)
  for (let i = devourFloatingCards.length - 1; i >= 0; i--) {
    devourFloatingCards[i].progress += dt / DEVOUR_FLOAT_DURATION
    if (devourFloatingCards[i].progress >= 1) devourFloatingCards.splice(i, 1)
  }

  drawGame(w, h)
  drawPanel(w, h)
  if (devourFloatingCards.length > 0) drawDevourFloatingCards(w, h)
  drawBottomDrawer(w, h)
  drawTabBar(w, h)
  if (damageStatsOverlayOpen) drawDamageStatsOverlay(w, h)
  if (synergyOverlayOpen) drawSynergyOverlay(w, h)
  if (attributeOverlayOpen) drawAttributeOverlay(w, h)
  if (weaponGrantToastRemaining > 0) drawWeaponGrantToast(w, h)
  requestAnimationFrame(loop)
}

function drawTitleScreen(w, h) {
  let hasSave = false
  try { hasSave = !!wx.getStorageSync(SAVE_KEY) } catch (e) {}
  ctx.fillStyle = UI.bg
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = UI.primary
  ctx.font = 'bold 26px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('塔防 Roguelike', w / 2, h * 0.30)
  ctx.fillStyle = UI.textDim
  ctx.font = '14px sans-serif'
  ctx.fillText(hasSave ? '检测到上次进度，请选择' : '点击下方开始游戏', w / 2, h * 0.38)
  const btnW = 160
  const btnH = 48
  const gap = 24
  const totalW = hasSave ? btnW * 2 + gap : btnW
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
  ctx.fillText(hasSave ? '新游戏' : '开始游戏', leftX + btnW / 2, btnY + btnH / 2)
  titleNewRect = { x: leftX, y: btnY, w: btnW, h: btnH }
  if (hasSave) {
    const contX = leftX + btnW + gap
    roundRect(contX, btnY, btnW, btnH, UI.radius)
    ctx.fillStyle = UI.bgCard
    ctx.fill()
    ctx.strokeStyle = UI.border
    ctx.stroke()
    ctx.fillStyle = UI.text
    ctx.fillText('继续游戏', contX + btnW / 2, btnY + btnH / 2)
    titleContinueRect = { x: contX, y: btnY, w: btnW, h: btnH }
  } else {
    titleContinueRect = null
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

// 开场动画：用视频时只画背景（视频叠在上层），否则画 canvas 动画
function drawIntroScreen(w, h) {
  ctx.fillStyle = UI.bg
  ctx.fillRect(0, 0, w, h)
  if (introUseVideo) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const introVideoEl = typeof document !== 'undefined' && document.getElementById('intro-video')
    const isLoading = introVideoEl && introVideoEl.paused && !introVideoEl.ended
    const progress = getIntroVideoLoadProgress()
    if (isLoading) {
      ctx.fillStyle = UI.primary
      ctx.font = '16px sans-serif'
      ctx.fillText('加载中…', w / 2, h * 0.38)
      const barW = Math.min(280, w * 0.8)
      const barH = 12
      const barX = (w - barW) / 2
      const barY = h * 0.48
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      roundRect(barX, barY, barW, barH, 6)
      ctx.fill()
      ctx.fillStyle = UI.primary
      roundRect(barX, barY, barW * Math.max(0, Math.min(1, progress)), barH, 6)
      ctx.fill()
      ctx.strokeStyle = UI.border
      ctx.lineWidth = 1
      roundRect(barX, barY, barW, barH, 6)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.font = '14px sans-serif'
      ctx.fillText(Math.round(progress * 100) + '%', w / 2, barY + barH + 22)
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '12px sans-serif'
    ctx.fillText('点击屏幕跳过', w / 2, h * 0.92)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    return
  }
  const progress = INTRO_DURATION > 0 ? Math.min(1, 1 - introTimer / INTRO_DURATION) : 1
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const fade1 = Math.min(1, progress * 2)
  const fade2 = Math.max(0, Math.min(1, (progress - 0.4) / 0.4))
  ctx.fillStyle = 'rgba(245, 158, 11, ' + fade1 + ')'
  ctx.font = 'bold 28px sans-serif'
  ctx.fillText('塔防 Roguelike', w / 2, h * 0.35)
  ctx.fillStyle = 'rgba(255, 255, 255, ' + fade2 * 0.8 + ')'
  ctx.font = '14px sans-serif'
  ctx.fillText('准备战斗…', w / 2, h * 0.48)
  ctx.fillStyle = 'rgba(255, 255, 255, ' + fade2 * 0.5 + ')'
  ctx.font = '12px sans-serif'
  ctx.fillText('点击屏幕跳过', w / 2, h * 0.92)
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
  const cardH = 300
  const blockTop = 24
  const titleH = 48
  const overlaySlotRowH = SKILL_BAR_SLOT_H
  const slotRowMargin = 10
  const cardsH = cardH + 8
  const skipH = 44
  const synTitleH = 22
  const synLineH = 18
  const synCount = 5
  const totalH = blockTop + titleH + overlaySlotRowH + slotRowMargin + cardsH + skipH + synTitleH + synCount * synLineH + 18 + 18
  const startY = (h - totalH) / 2

  let y = startY + blockTop
  ctx.fillStyle = UI.primary
  ctx.font = 'bold 18px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(choosingSkillByInspiration ? ('学习技能（消耗 ' + getLearnSkillCost() + ' 灵感）') : '升级！选择一项技能', w / 2, y + 20)
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

  const slotRowY = y + 4
  const slotAreaW = w - 32
  const slotGap = SKILL_BAR_SLOT_GAP
  const slotH = SKILL_BAR_SLOT_H
  const slotW = slotAreaW > 0 ? Math.max(0, Math.floor((slotAreaW - slotGap * (SKILL_SLOTS_PER_ROW - 1)) / SKILL_SLOTS_PER_ROW)) : 0
  const slotStartX = 16
  const slotRows = Math.ceil(MAX_SKILL_SLOTS / SKILL_SLOTS_PER_ROW)
  const skillsInSlots = getSkillsInSlots()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < MAX_SKILL_SLOTS; i++) {
    const row = Math.floor(i / SKILL_SLOTS_PER_ROW)
    const col = i % SKILL_SLOTS_PER_ROW
    const sx = slotStartX + col * (slotW + slotGap)
    const sy = slotRowY + row * (slotH + slotGap)
    const filled = skillsInSlots[i]
    roundRect(sx, sy, slotW, slotH, UI.radiusSm)
    if (filled) {
      const slotLineColor = getCardLineColor(filled.skillId)
      ctx.fillStyle = filled.isAdvanced ? UI.bgCardAlt : UI.bgCard
      ctx.fill()
      ctx.fillStyle = slotLineColor
      ctx.fillRect(sx, sy, slotW, Math.min(8, slotH / 4))
      ctx.strokeStyle = slotLineColor
      ctx.lineWidth = 1
      roundRect(sx, sy, slotW, slotH, UI.radiusSm)
      ctx.stroke()
      const nameY = 18
      const nameFontSize = filled.name.length > 6 ? 9 : (filled.name.length > 4 ? 10 : 11)
      ctx.font = nameFontSize + 'px sans-serif'
      ctx.fillStyle = filled.isAdvanced ? slotLineColor : UI.text
      ctx.fillText(filled.name, sx + slotW / 2, sy + nameY)
      const progressList = getSynergyProgressForSkill(filled.skillId)
      if (progressList.length > 0) {
        const isXuanfengProgress = filled.skillId === SKILL_XUANFENG_ID && progressList[0].name === (MONSTER_KILL_FOR_XUANFENG_DEVOUR + '击杀')
        const isBaonuProgress = filled.skillId === SKILL_BAONU_ID && progressList[0].name === (RAGE_CONSUMED_FOR_BAONU_DEVOUR + '怒气')
        const progressFont = ((isXuanfengProgress || isBaonuProgress) && slotW < 42) ? '8px' : '9px'
        ctx.font = progressFont + ' sans-serif'
        ctx.fillStyle = progressList.every(p => p.current >= p.total) ? UI.success : UI.textMuted
        if (isXuanfengProgress) {
          ctx.textBaseline = 'top'
          ctx.fillText(MONSTER_KILL_FOR_XUANFENG_DEVOUR + '击杀后吞噬', sx + slotW / 2, sy + 26)
          ctx.fillText(formatProgressDisplay(progressList[0].current, progressList[0].total), sx + slotW / 2, sy + 36)
          ctx.textBaseline = 'middle'
        } else if (isBaonuProgress) {
          ctx.textBaseline = 'top'
          ctx.fillText(RAGE_CONSUMED_FOR_BAONU_DEVOUR + '怒气后吞噬', sx + slotW / 2, sy + 26)
          ctx.fillText(formatProgressDisplay(progressList[0].current, progressList[0].total), sx + slotW / 2, sy + 36)
          ctx.textBaseline = 'middle'
        } else if (progressList.length === 1 && progressList[0].name === '60秒战斗') {
          const p = progressList[0]
          const remaining = Math.max(0, p.total - Math.floor(p.current))
          const text = remaining > 0 ? (remaining === 60 ? '60秒后吞噬' : (remaining + '秒后可吞噬')) : '可吞噬'
          ctx.fillText(text, sx + slotW / 2, sy + slotH - 12)
        } else {
          const progressStr = progressList.map(p => p.name + formatProgressDisplay(p.current, p.total)).join(' ')
          ctx.fillText(progressStr, sx + slotW / 2, sy + slotH - 12)
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
      ctx.fillText('空', sx + slotW / 2, sy + slotH / 2)
    }
  }
  ctx.textBaseline = 'alphabetic'
  y = slotRowY + slotRows * (slotH + slotGap) - slotGap + slotRowMargin

  const cardY = y
  skillChoiceRects = []
  const allSkills = getAllSkills()
  const topBarH = 22
  for (let i = 0; i < skill_choice_count; i++) {
    const x = 16 + i * (16 + cardW)
    const id = skill_choices[i]
    const isKeyCard = isKeyCardId(id)
    const isAdvanced = !isKeyCard && id > 7
    const lineColor = getCardLineColor(id)
    const topBarText = getCardTopBarText(id)
    roundRect(x, cardY, cardW, cardH, UI.radiusSm)
    ctx.fillStyle = (isKeyCard || isAdvanced) ? UI.bgCardAlt : UI.bgCard
    ctx.fill()
    ctx.fillStyle = lineColor
    ctx.fillRect(x, cardY, cardW, topBarH)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(topBarText, x + cardW / 2, cardY + 14)
    ctx.strokeStyle = lineColor
    ctx.lineWidth = 1.5
    roundRect(x, cardY, cardW, cardH, UI.radiusSm)
    ctx.stroke()
    if (isKeyCard) {
      ctx.fillStyle = UI.text
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText(getKeyCardDisplayName(id), x + cardW / 2, cardY + topBarH + 14)
      ctx.fillStyle = UI.textDim
      ctx.font = '10px sans-serif'
      const descPadding = 8
      const descMaxW = Math.max(0, cardW - descPadding * 2)
      const descLineH = 12
      const descMaxLines = 14
      const descStartY = cardY + topBarH + 26
      fillTextWrapped(getKeyCardDesc(id), x + cardW / 2, descStartY, descMaxW, descLineH, descMaxLines)
    } else {
      const sk = allSkills[id]
      ctx.fillStyle = isAdvanced ? lineColor : UI.text
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText(sk.name, x + cardW / 2, cardY + topBarH + 14)
      ctx.fillStyle = UI.textDim
      ctx.font = '10px sans-serif'
      const descText = sk.desc != null ? sk.desc : ('攻×' + sk.attackMul + ' 速×' + sk.speedMul)
      const descPadding = 8
      const descMaxW = Math.max(0, cardW - descPadding * 2)
      const descLineH = 12
      const descMaxLines = 14
      const descStartY = cardY + topBarH + 26
      fillTextWrapped(descText, x + cardW / 2, descStartY, descMaxW, descLineH, descMaxLines)
      const belongTo = getSynergiesForSkill(id)
      const canActivate = getSynergiesIfChoose(id)
      let lineY = cardY + topBarH + 26 + descMaxLines * descLineH + 4
      ctx.fillStyle = UI.textMuted
      ctx.font = '10px sans-serif'
      const ruleText = getDevourRuleText(id)
      fillTextWrapped(ruleText, x + cardW / 2, lineY, descMaxW, 12, 4)
      lineY += 12 * 4 + 2
      if (belongTo.length > 0) {
        ctx.fillStyle = UI.textDim
        ctx.fillText('所属吞噬：' + belongTo.join('、'), x + cardW / 2, lineY)
        lineY += 14
      }
      if (canActivate.length > 0) {
        ctx.fillStyle = UI.success
        ctx.font = '11px sans-serif'
        ctx.fillText('选此可激活：' + canActivate.join('、'), x + cardW / 2, lineY)
      }
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
  ctx.fillText('吞噬收集情况', 16, y + 14)
  y += synTitleH

  const progress = getSynergyProgress()
  for (let i = 0; i < progress.length; i++) {
    const p = progress[i]
    if (p.status === 'active') {
      ctx.fillStyle = UI.success
      const consumedStr = (p.consumedNames && p.consumedNames.length) ? '（' + p.consumedNames.join('、') + ' 已吞噬）' : ''
      ctx.fillText(p.name + ' ✓ ' + consumedStr, 16, y + 14)
    } else if (p.status === 'lack1') {
      ctx.fillStyle = UI.primary
      ctx.fillText(p.name + ' 缺 ' + p.lackName, 16, y + 14)
    } else {
      ctx.fillStyle = UI.textMuted
      ctx.fillText(p.name + ' —', 16, y + 14)
    }
    y += synLineH
  }
  const activeCount = progress.filter(p => p.status === 'active').length
  if (activeCount > 0) {
    ctx.fillStyle = UI.textMuted
    ctx.font = '11px sans-serif'
    ctx.fillText('激活后，组成技能不占栏位，效果保留', 16, y + 12)
  }

  ctx.textAlign = 'left'
}

function drawReplaceTargetOverlay(w, h) {
  ctx.fillStyle = 'rgba(15,14,20,0.92)'
  ctx.fillRect(0, 0, w, h)

  const allSkills = getAllSkills()
  const newSkill = pendingReplaceSkillId != null && allSkills[pendingReplaceSkillId] ? allSkills[pendingReplaceSkillId].name : '?'
  const pad = 20
  const slotGap = SKILL_BAR_SLOT_GAP
  const slotH = SKILL_BAR_SLOT_H
  const slotAreaW = w - pad * 2
  const slotW = slotAreaW > 0 ? Math.max(0, Math.floor((slotAreaW - slotGap * (SKILL_SLOTS_PER_ROW - 1)) / SKILL_SLOTS_PER_ROW)) : 0
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
  const slotRows = Math.ceil(MAX_SKILL_SLOTS / SKILL_SLOTS_PER_ROW)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < MAX_SKILL_SLOTS; i++) {
    const row = Math.floor(i / SKILL_SLOTS_PER_ROW)
    const col = i % SKILL_SLOTS_PER_ROW
    const sx = pad + col * (slotW + slotGap)
    const sy = startY + row * (slotH + slotGap)
    const filled = skillsInSlots[i]
    roundRect(sx, sy, slotW, slotH, UI.radiusSm)
    if (filled) {
      const replaceLineColor = getCardLineColor(filled.skillId)
      ctx.fillStyle = filled.isAdvanced ? UI.bgCardAlt : UI.bgCard
      ctx.fill()
      ctx.fillStyle = replaceLineColor
      ctx.fillRect(sx, sy, slotW, Math.min(8, slotH / 4))
      ctx.strokeStyle = replaceLineColor
      ctx.lineWidth = 1
      roundRect(sx, sy, slotW, slotH, UI.radiusSm)
      ctx.stroke()
      const nameFontSize = filled.name.length > 6 ? 9 : (filled.name.length > 4 ? 10 : 11)
      ctx.font = nameFontSize + 'px sans-serif'
      ctx.fillStyle = filled.isAdvanced ? replaceLineColor : UI.text
      ctx.fillText(filled.name, sx + slotW / 2, sy + 18)
      const progressList = getSynergyProgressForSkill(filled.skillId)
      if (progressList.length > 0) {
        const isXuanfengProgress = filled.skillId === SKILL_XUANFENG_ID && progressList[0].name === (MONSTER_KILL_FOR_XUANFENG_DEVOUR + '击杀')
        const isBaonuProgress = filled.skillId === SKILL_BAONU_ID && progressList[0].name === (RAGE_CONSUMED_FOR_BAONU_DEVOUR + '怒气')
        const progressFont = ((isXuanfengProgress || isBaonuProgress) && slotW < 42) ? '8px' : '9px'
        ctx.font = progressFont + ' sans-serif'
        ctx.fillStyle = progressList.every(p => p.current >= p.total) ? UI.success : UI.textMuted
        if (isXuanfengProgress) {
          ctx.textBaseline = 'top'
          ctx.fillText(MONSTER_KILL_FOR_XUANFENG_DEVOUR + '击杀后吞噬', sx + slotW / 2, sy + 26)
          ctx.fillText(formatProgressDisplay(progressList[0].current, progressList[0].total), sx + slotW / 2, sy + 36)
          ctx.textBaseline = 'middle'
        } else if (isBaonuProgress) {
          ctx.textBaseline = 'top'
          ctx.fillText(RAGE_CONSUMED_FOR_BAONU_DEVOUR + '怒气后吞噬', sx + slotW / 2, sy + 26)
          ctx.fillText(formatProgressDisplay(progressList[0].current, progressList[0].total), sx + slotW / 2, sy + 36)
          ctx.textBaseline = 'middle'
        } else if (progressList.length === 1 && progressList[0].name === '60秒战斗') {
          const p = progressList[0]
          const remaining = Math.max(0, p.total - Math.floor(p.current))
          const text = remaining > 0 ? (remaining === 60 ? '60秒后吞噬' : (remaining + '秒后可吞噬')) : '可吞噬'
          ctx.fillText(text, sx + slotW / 2, sy + slotH - 12)
        } else {
          const progressStr = progressList.map(p => p.name + formatProgressDisplay(p.current, p.total)).join(' ')
          ctx.fillText(progressStr, sx + slotW / 2, sy + slotH - 12)
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
      ctx.fillText('空', sx + slotW / 2, sy + slotH / 2)
    }
    replaceSlotRects.push({ x: sx, y: sy, w: slotW, h: slotH })
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const cancelY = startY + slotRows * (slotH + slotGap) - slotGap + 20
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
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('取消', cancelX + cancelW / 2, cancelY + cancelH / 2)
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

  const playerSx = worldToScreenX(PLAYER_X)
  const attackRadius = getAttackRadius()
  ctx.save()
  ctx.translate(playerSx, playerY)
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
  ctx.arc(playerSx, playerY, 14, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = UI.border
  ctx.lineWidth = 1.5
  ctx.stroke()
  const barW = 60
  const barX = playerSx - barW / 2
  const playerBarY = gameTop + 8
  roundRect(barX, playerBarY, barW, 6, 3)
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fill()
  roundRect(barX, playerBarY, barW * (playerHp / playerMaxHp), 6, 3)
  ctx.fillStyle = UI.success
  ctx.fill()
  if (hasRageMechanic()) {
    const rageBarY = gameTop + 16
    const rageBarH = 5
    roundRect(barX, rageBarY, barW, rageBarH, 2)
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fill()
    roundRect(barX, rageBarY, barW * (playerRage / RAGE_MAX), rageBarH, 2)
    ctx.fillStyle = '#c2410c'
    ctx.fill()
  }

  const BAR_STACK_GAP = 10
  const OVERLAP_X = 40
  const OVERLAP_Y = 28
  const nowSec = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]
    if (!e.alive) continue
    const ex = worldToScreenX(e.x)
    const radius = e.isBoss ? 14 : 10
    let stackIdx = 0
    for (let j = 0; j < enemies.length; j++) {
      if (i === j || !enemies[j].alive) continue
      const ex2 = worldToScreenX(enemies[j].x)
      if (Math.abs(ex - ex2) < OVERLAP_X && Math.abs(e.y - enemies[j].y) < OVERLAP_Y) {
        if (j < i) stackIdx++
      }
    }
    const barOffset = stackIdx * BAR_STACK_GAP
    if (!e.appearance || e.appearance === 'slime') {
      drawSlimeBody(ex, e.y, radius, e.isBoss, nowSec, e)
    } else {
      ctx.fillStyle = e.isBoss ? '#8b5cf6' : UI.danger
      ctx.beginPath()
      ctx.arc(ex, e.y, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = UI.border
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    if (e.isBoss) {
      ctx.fillStyle = UI.text
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(e.isChallengeBoss ? '挑战' : 'Boss', ex, e.y - radius - 4 - barOffset)
      ctx.textAlign = 'left'
    }
    const eBarW = e.isBoss ? 56 : 40
    const eBarY = e.y - radius - 14 - barOffset
    roundRect(ex - eBarW / 2, eBarY, eBarW, 5, 2)
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fill()
    roundRect(ex - eBarW / 2, eBarY, eBarW * (e.hp / e.maxHp), 5, 2)
    ctx.fillStyle = e.isBoss ? '#a78bfa' : '#f97316'
    ctx.fill()
    ctx.fillStyle = UI.text
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(Math.ceil(e.hp) + '/' + Math.round(e.maxHp), ex, eBarY - 6)
    ctx.textAlign = 'left'
  }

  for (let i = 0; i < effects.length; i++) {
    const ef = effects[i]
    const efx = (ef.x != null) ? worldToScreenX(ef.x) : playerSx
    if (ef.type === 'hit') {
      const alpha = Math.max(0, ef.life / 0.2)
      ctx.fillStyle = 'rgba(232,168,74,' + alpha * 0.8 + ')'
      ctx.beginPath()
      ctx.arc(efx, ef.y, 8 + (1 - alpha) * 6, 0, Math.PI * 2)
      ctx.fill()
    } else if (ef.type === 'hurt') {
      const alpha = Math.max(0, ef.life / 0.25)
      ctx.fillStyle = 'rgba(201,74,74,' + alpha * 0.5 + ')'
      ctx.beginPath()
      ctx.arc(efx, ef.y, 20, 0, Math.PI * 2)
      ctx.fill()
    } else if (ef.type === 'crit') {
      const alpha = Math.max(0, ef.life / 0.6)
      ctx.save()
      ctx.translate(efx, ef.y - 24 - (1 - alpha) * 8)
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
    const px = (ef.x != null ? worldToScreenX(ef.x) : playerSx)
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
  const expPct = levelUpDelayRemaining > 0 ? 1 : (playerExp / playerExpToNext)
  roundRect(levelBarX, levelBarY, levelBarW * expPct, levelBarH, 6)
  ctx.fillStyle = UI.primary
  ctx.fill()
  if (levelUpDelayRemaining > 0) {
    const timeElapsed = 0.5 - levelUpDelayRemaining
    const flash1 = Math.max(0, 1 - Math.abs(timeElapsed - 0.125) / 0.08)
    const flash2 = Math.max(0, 1 - Math.abs(timeElapsed - 0.375) / 0.08)
    const flashAlpha = Math.min(1, (flash1 + flash2) * 0.7)
    if (flashAlpha > 0) {
      roundRect(levelBarX, levelBarY, levelBarW, levelBarH, 6)
      ctx.fillStyle = 'rgba(255,255,255,' + flashAlpha + ')'
      ctx.fill()
    }
  }
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
  const panelH = (h - TAB_BAR_HEIGHT) - panelTop
  ctx.fillStyle = UI.bgPanel
  ctx.fillRect(0, panelTop, w, panelH)

  const gap = 16
  const btnW = 100
  const slotRowH = SKILL_BAR_SLOT_H
  const slotRowY = panelTop + 28
  const slotRows = Math.ceil(MAX_SKILL_SLOTS / SKILL_SLOTS_PER_ROW)
  const skillBarTotalH = slotRows * slotRowH + (slotRows - 1) * SKILL_BAR_SLOT_GAP
  const equipRowH = 44
  const equipRowY = slotRowY + skillBarTotalH + 16

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
  ctx.fillStyle = UI.textDim
  ctx.fillText('灵感 ' + Math.floor(playerInspiration), shopX + btnW, resBlockTop + 52)

  learnSkillButtonRect = null
  const firstRightBtnY = resBlockTop + 58
  if (isLearned(SKILL_LUMANG_ID)) {
    const lumangBtnY = firstRightBtnY
    const canCast = skillLumangCd <= 0 && recklessBuffRemaining <= 0
    roundRect(shopX, lumangBtnY, btnW, 28, UI.radiusSm)
    ctx.fillStyle = canCast ? '#b45309' : UI.bgCard
    ctx.fill()
    ctx.strokeStyle = canCast ? UI.primary : UI.textMuted
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = canCast ? UI.bg : UI.textMuted
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lumangText = recklessBuffRemaining > 0 ? '鲁莽 ' + recklessBuffRemaining.toFixed(1) + 's' : (skillLumangCd > 0 ? '鲁莽 CD' + skillLumangCd.toFixed(0) : '鲁莽')
    ctx.fillText(lumangText, shopX + btnW / 2, lumangBtnY + 14)
    lumangButtonRect = { x: shopX, y: lumangBtnY, w: btnW, h: 28 }
  } else {
    lumangButtonRect = null
  }
  if (isLearned(40)) {
    const odinBtnY = (lumangButtonRect ? lumangButtonRect.y + lumangButtonRect.h + 4 : firstRightBtnY)
    const canOdin = skillOdinCd <= 0 && getEnemiesInRange(1).length > 0
    roundRect(shopX, odinBtnY, btnW, 28, UI.radiusSm)
    ctx.fillStyle = canOdin ? '#6b21a8' : UI.bgCard
    ctx.fill()
    ctx.strokeStyle = canOdin ? '#a78bfa' : UI.textMuted
    ctx.stroke()
    ctx.fillStyle = UI.text
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const odinText = skillOdinCd > 0 ? '奥丁 CD' + skillOdinCd.toFixed(0) : '奥丁之怒'
    ctx.fillText(odinText, shopX + btnW / 2, odinBtnY + 14)
    odinButtonRect = { x: shopX, y: odinBtnY, w: btnW, h: 28 }
  } else {
    odinButtonRect = null
  }

  ctx.fillStyle = UI.textMuted
  ctx.font = '11px sans-serif'
  const effectiveSlots = getEffectiveSlotsUsed()
  const hasConsumed = learned_skill_ids.some(id => isSkillConsumedBySynergy(id))
  const skillBarTitleW = Math.max(0, shopX - gap)
  ctx.save()
  ctx.beginPath()
  ctx.rect(gap, panelTop, skillBarTitleW, 22)
  ctx.clip()
  ctx.textAlign = 'left'
  ctx.fillText('技能栏 ' + effectiveSlots + '/' + MAX_SKILL_SLOTS + (hasConsumed ? '（已吞噬不占位）' : ''), gap, panelTop + 14)
  ctx.restore()
  const slotAreaW = Math.max(0, w - gap * 2 - btnW - gap - 8)
  const slotGap = SKILL_BAR_SLOT_GAP
  const slotH = slotRowH
  const slotW = slotAreaW > 0 ? Math.max(0, Math.floor((slotAreaW - slotGap * (SKILL_SLOTS_PER_ROW - 1)) / SKILL_SLOTS_PER_ROW)) : 0
  const slotStartX = gap
  const skillsInSlots = getSkillsInSlots()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < MAX_SKILL_SLOTS; i++) {
    const row = Math.floor(i / SKILL_SLOTS_PER_ROW)
    const col = i % SKILL_SLOTS_PER_ROW
    const sx = slotStartX + col * (slotW + slotGap)
    const sy = slotRowY + row * (slotH + slotGap)
    const filled = skillsInSlots[i]
    roundRect(sx, sy, slotW, slotH, UI.radiusSm)
    if (filled) {
      const slotLineColor = getCardLineColor(filled.skillId)
      let slotBg = filled.isAdvanced ? UI.bgCardAlt : UI.bgCard
      let slotStroke = slotLineColor
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
      } else if (filled.isActive && filled.skillId === SKILL_NUJI_ID) {
        activeCd = skillNuJiCd
        activeCdMax = SKILL_NUJI_COOLDOWN
        if (skillNuJiCd > 0) {
          slotBg = 'rgba(60,58,70,0.9)'
          slotStroke = UI.textMuted
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
      } else if (filled.isActive && filled.skillId === 40) {
        activeCd = skillOdinCd
        activeCdMax = SKILL_ODIN_COOLDOWN
        if (skillOdinCd > 0) {
          slotBg = 'rgba(60,58,70,0.9)'
          slotStroke = UI.textMuted
        } else {
          slotBg = '#6b21a8'
          slotStroke = '#a78bfa'
        }
      }
      ctx.fillStyle = slotBg
      ctx.fill()
      ctx.fillStyle = slotLineColor
      ctx.fillRect(sx, sy, slotW, Math.min(8, slotH / 4))
      ctx.strokeStyle = slotStroke
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.save()
      ctx.beginPath()
      ctx.rect(sx, sy, slotW, slotH)
      ctx.clip()
      if (filled.isActive && activeCd > 0) {
        const cdPct = 1 - activeCd / activeCdMax
        const barY = sy + slotH - 5
        roundRect(sx + 2, barY, slotW - 4, 3, 1)
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.fill()
        roundRect(sx + 2, barY, Math.max(0, (slotW - 4) * cdPct), 3, 1)
        ctx.fillStyle = UI.primary
        ctx.fill()
      }
      const nameY = filled.isActive ? 12 : 18
      const nameFontSize = filled.name.length > 6 ? 9 : (filled.name.length > 4 ? 10 : 11)
      ctx.font = nameFontSize + 'px sans-serif'
      ctx.fillStyle = filled.isAdvanced ? slotLineColor : (filled.isActive && activeCd > 0 ? UI.textMuted : UI.text)
      ctx.fillText(filled.name, sx + slotW / 2, sy + nameY)
      if (filled.isActive) {
        ctx.font = '9px sans-serif'
        if (filled.skillId === SKILL_XUE_ID && activeBuff) {
          ctx.fillStyle = UI.primary
          ctx.fillText('攻速+', sx + slotW / 2, sy + 26)
        } else if (filled.skillId === SKILL_XUANFENG_ID && skillShunpiBuff > 0 && activeCd <= 0) {
          ctx.fillStyle = UI.primary
          ctx.fillText('顺劈', sx + slotW / 2, sy + 26)
        } else if (filled.skillId === SKILL_BAONU_ID) {
          ctx.fillStyle = playerRage >= SKILL_BAONU_RAGE_COST ? UI.primary : UI.textMuted
          ctx.fillText(playerRage >= SKILL_BAONU_RAGE_COST ? '就绪' : '怒气不足', sx + slotW / 2, sy + 26)
        } else if (filled.skillId === 40) {
          ctx.fillStyle = skillOdinCd <= 0 ? '#a78bfa' : UI.textMuted
          ctx.fillText(skillOdinCd > 0 ? 'CD ' + Math.ceil(skillOdinCd) + 's' : '就绪', sx + slotW / 2, sy + 26)
        } else if (activeCd > 0) {
          ctx.fillStyle = UI.textMuted
          ctx.fillText('CD ' + Math.ceil(activeCd) + 's', sx + slotW / 2, sy + 26)
        } else {
          ctx.fillStyle = UI.primary
          ctx.fillText('就绪', sx + slotW / 2, sy + 26)
        }
      }
      const progressList = getSynergyProgressForSkill(filled.skillId)
      if (progressList.length > 0) {
        const isXuanfengProgress = filled.skillId === SKILL_XUANFENG_ID && progressList[0].name === (MONSTER_KILL_FOR_XUANFENG_DEVOUR + '击杀')
        const isBaonuProgress = filled.skillId === SKILL_BAONU_ID && progressList[0].name === (RAGE_CONSUMED_FOR_BAONU_DEVOUR + '怒气')
        const progressFont = ((isXuanfengProgress || isBaonuProgress) && slotW < 42) ? '8px' : '9px'
        ctx.font = progressFont + ' sans-serif'
        ctx.fillStyle = progressList.every(p => p.current >= p.total) ? UI.success : UI.textMuted
        if (isXuanfengProgress) {
          ctx.textBaseline = 'top'
          ctx.fillText(MONSTER_KILL_FOR_XUANFENG_DEVOUR + '击杀后吞噬', sx + slotW / 2, sy + 26)
          ctx.fillText(formatProgressDisplay(progressList[0].current, progressList[0].total), sx + slotW / 2, sy + 36)
          ctx.textBaseline = 'middle'
        } else if (isBaonuProgress) {
          ctx.textBaseline = 'top'
          ctx.fillText(RAGE_CONSUMED_FOR_BAONU_DEVOUR + '怒气后吞噬', sx + slotW / 2, sy + 26)
          ctx.fillText(formatProgressDisplay(progressList[0].current, progressList[0].total), sx + slotW / 2, sy + 36)
          ctx.textBaseline = 'middle'
        } else if (progressList.length === 1 && progressList[0].name === '60秒战斗') {
          const p = progressList[0]
          const remaining = Math.max(0, p.total - Math.floor(p.current))
          const text = remaining > 0 ? (remaining === 60 ? '60秒后吞噬' : (remaining + '秒后可吞噬')) : '可吞噬'
          ctx.fillText(text, sx + slotW / 2, sy + slotH - 12)
        } else {
          const progressStr = progressList.map(p => p.name + formatProgressDisplay(p.current, p.total)).join(' ')
          ctx.fillText(progressStr, sx + slotW / 2, sy + slotH - 12)
        }
      }
      ctx.restore()
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fill()
      ctx.strokeStyle = UI.textMuted
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.font = '10px sans-serif'
      ctx.fillStyle = UI.textMuted
      ctx.fillText('空', sx + slotW / 2, sy + slotH / 2)
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
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (item) {
      ctx.font = '11px sans-serif'
      ctx.fillText(item.name, ex + equipSlotW / 2, equipRowY + 12)
      const effParts = []
      if (item.strBonus) effParts.push('力量+' + Math.round(item.strBonus * weaponForgedMul))
      if (item.staBonus) effParts.push('耐力+' + Math.round(item.staBonus * weaponForgedMul))
      if (item.attackFlat) effParts.push('攻击+' + Math.round(item.attackFlat * weaponForgedMul))
      if (item.attackMul && item.attackMul !== 1) effParts.push('攻击' + (item.attackMul > 1 ? '+' : '') + Math.round((item.attackMul - 1) * 100) + '%')
      if (item.speedMul && item.speedMul !== 1) effParts.push('攻速' + (item.speedMul > 1 ? '+' : '') + Math.round((item.speedMul - 1) * 100) + '%')
      if (item.maxHp) effParts.push('生命+' + item.maxHp)
      if (item.rageGainPct) effParts.push('怒气+' + item.rageGainPct + '%')
      ctx.font = '9px sans-serif'
      ctx.fillStyle = UI.textDim
      ctx.fillText(effParts.length ? effParts.join(' ') : '', ex + equipSlotW / 2, equipRowY + 28)
      ctx.fillStyle = UI.text
    } else {
      ctx.font = '10px sans-serif'
      ctx.fillText('空', ex + equipSlotW / 2, equipRowY + equipRowH / 2)
    }
    ctx.textAlign = 'left'
  }
  ctx.textBaseline = 'alphabetic'

}

function drawDevourFloatingCards(w, h) {
  for (let i = 0; i < devourFloatingCards.length; i++) {
    const card = devourFloatingCards[i]
    const t = Math.min(1, card.progress)
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    const x = card.startX + (card.endX - card.startX) * ease
    const floatY = 14 * Math.sin(t * Math.PI)
    const y = card.startY + (card.endY - card.startY) * ease - floatY
    const scale = 1 - t * 0.75
    const cardW = Math.max(24, 56 * scale)
    const cardH = Math.max(18, 40 * scale)
    const left = x - cardW / 2
    const top = y - cardH / 2
    roundRect(left, top, cardW, cardH, UI.radiusSm)
    ctx.fillStyle = UI.bgCardAlt
    ctx.fill()
    ctx.fillStyle = card.lineColor
    ctx.fillRect(left, top, cardW, Math.min(12, cardH / 3))
    ctx.strokeStyle = card.lineColor
    ctx.lineWidth = 1.5
    roundRect(left, top, cardW, cardH, UI.radiusSm)
    ctx.stroke()
    ctx.fillStyle = UI.text
    ctx.font = (scale > 0.45 ? '10px' : '9px') + ' sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const name = card.skillName.length > 4 ? (card.skillName.slice(0, 4) + '…') : card.skillName
    ctx.fillText(name, x, y)
  }
}

// 游戏 Tab 是否可提示（可打磨武器或可抽取技能时显示动态亮边）
function canGameTabPrompt() {
  if (gameState !== 'playing' && gameState !== 'wave_break') return false
  return playerInspiration >= getLearnSkillCost() || playerGold >= getForgeWeaponCost()
}

function drawTabBar(w, h) {
  const tabBarTop = h - TAB_BAR_HEIGHT
  ctx.fillStyle = UI.bgPanel
  ctx.fillRect(0, tabBarTop, w, TAB_BAR_HEIGHT)
  ctx.strokeStyle = UI.border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, tabBarTop)
  ctx.lineTo(w, tabBarTop)
  ctx.stroke()

  tabRects = []
  const tabW = w / TAB_IDS.length
  ctx.font = '12px sans-serif'
  ctx.textBaseline = 'middle'
  const gameTabPrompt = canGameTabPrompt()
  const dotPulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin((Date.now() / 400) * Math.PI * 2))
  for (let i = 0; i < TAB_IDS.length; i++) {
    const tx = i * tabW
    const active = bottomDrawerTab === TAB_IDS[i]
    if (active) {
      ctx.fillStyle = UI.bgCard
      roundRect(tx + 2, tabBarTop + 4, tabW - 4, TAB_BAR_HEIGHT - 8, UI.radiusSm)
      ctx.fill()
      ctx.strokeStyle = UI.primary
      ctx.lineWidth = 1
      ctx.stroke()
    }
    if (i === 0 && gameTabPrompt) {
      const dotX = tx + tabW - 10
      const dotY = tabBarTop + 10
      const r = 4
      ctx.beginPath()
      ctx.arc(dotX, dotY, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(220, 38, 38, ' + dotPulse + ')'
      ctx.fill()
    }
    ctx.fillStyle = active ? UI.primary : UI.text
    ctx.textAlign = 'center'
    ctx.fillText(TAB_LABELS[i], tx + tabW / 2, tabBarTop + TAB_BAR_HEIGHT / 2)
    tabRects.push({ x: tx, y: tabBarTop, w: tabW, h: TAB_BAR_HEIGHT })
  }
  ctx.textAlign = 'left'
}

function getTabIndexFromX(x, w) {
  const tabW = w / TAB_IDS.length
  return Math.min(TAB_IDS.length - 1, Math.floor(x / tabW))
}

function drawBottomDrawer(w, h) {
  if (bottomDrawerTab == null) return
  drawerCloseRect = null
  drawerChallengeStartRect = null
  drawerGameChallengeRect = null
  drawerGameLearnSkillRect = null
  drawerGameForgeBuyRect = null
  const gameTop = TOP_SAFE_MARGIN
  const restH = h - TOP_SAFE_MARGIN
  const gameHeight = Math.floor(restH * GAME_HEIGHT_RATIO)
  const panelTopHere = gameTop + gameHeight
  const tabBarTop = h - TAB_BAR_HEIGHT
  const skillBarRows = Math.ceil(MAX_SKILL_SLOTS / SKILL_SLOTS_PER_ROW)
  const skillBarH = skillBarRows * SKILL_BAR_SLOT_H + (skillBarRows - 1) * SKILL_BAR_SLOT_GAP
  const panelContentBottom = panelTopHere + 28 + skillBarH + 16 + 44
  const maxDrawerHeight = Math.max(180, tabBarTop - panelContentBottom)
  const drawerHeight = Math.min(340, Math.floor((h - TAB_BAR_HEIGHT) * 0.55), maxDrawerHeight)
  const visibleH = drawerHeight * drawerSlideProgress
  if (visibleH <= 0) return
  const drawerTop = tabBarTop - visibleH
  roundRect(0, drawerTop, w, visibleH, UI.radius)
  ctx.fillStyle = UI.bgPanel
  ctx.fill()
  ctx.strokeStyle = UI.border
  ctx.lineWidth = 1
  ctx.stroke()

  if (drawerSlideProgress < 0.98) return
  const pad = 16
  const titleH = 32
  const contentTop = drawerTop + titleH
  const contentH = visibleH - titleH - pad
  const contentW = w - pad * 2
  const contentX = pad

  if (bottomDrawerTab === 'game') {
    ctx.fillStyle = UI.primary
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('游戏', w / 2, drawerTop + 16)
    ctx.textAlign = 'left'
    const cardW = (contentW - 12) / 3
    const cardH = Math.min(88, contentH - 8)
    const cardY = contentTop + 4
    const pad = 4
    const challengeActive = challengeTimer > 0
    const layer = challengeCount + 1
    const nextBossCount = getChallengeBossCount()
    for (let i = 0; i < 3; i++) {
      const cx = contentX + i * (cardW + pad)
      roundRect(cx, cardY, cardW, cardH, UI.radiusSm)
      ctx.fillStyle = UI.bgCard
      ctx.fill()
      ctx.strokeStyle = UI.border
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = UI.text
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      if (i === 0) {
        ctx.fillText('挑战', cx + cardW / 2, cardY + 10)
        ctx.font = '11px sans-serif'
        ctx.fillStyle = UI.text
        ctx.fillText('当前第 ' + layer + ' 层', cx + cardW / 2, cardY + 24)
        ctx.font = '10px sans-serif'
        ctx.fillStyle = UI.textDim
        ctx.fillText(challengeActive ? '剩余 ' + Math.ceil(challengeTimer) + ' 秒' : '限时击杀Boss，得金币与灵感', cx + cardW / 2, cardY + 38)
        if (!challengeActive) {
          const btnW = 56
          const btnH = 22
          const btnX = cx + (cardW - btnW) / 2
          const btnY = cardY + cardH - btnH - 6
          roundRect(btnX, btnY, btnW, btnH, UI.radiusSm)
          ctx.fillStyle = '#0d9488'
          ctx.fill()
          ctx.strokeStyle = 'rgba(13,148,136,0.6)'
          ctx.stroke()
          ctx.fillStyle = UI.bg
          ctx.font = '11px sans-serif'
          ctx.textBaseline = 'middle'
          ctx.fillText('开始挑战', btnX + btnW / 2, btnY + btnH / 2)
          ctx.textBaseline = 'alphabetic'
          drawerGameChallengeRect = { x: btnX, y: btnY, w: btnW, h: btnH }
        } else drawerGameChallengeRect = null
      } else if (i === 1) {
        ctx.fillText('学习技能', cx + cardW / 2, cardY + 12)
        ctx.font = '10px sans-serif'
        ctx.fillStyle = UI.textDim
        ctx.fillText('消耗灵感学习新技能', cx + cardW / 2, cardY + 28)
        const learnCost = getLearnSkillCost()
        const canLearn = playerInspiration >= learnCost
        const btnW = 52
        const btnH = 22
        const btnX = cx + (cardW - btnW) / 2
        const btnY = cardY + cardH - btnH - 6
        roundRect(btnX, btnY, btnW, btnH, UI.radiusSm)
        ctx.fillStyle = canLearn ? '#0d9488' : UI.bgCardAlt
        ctx.fill()
        ctx.strokeStyle = canLearn ? 'rgba(13,148,136,0.6)' : UI.textMuted
        ctx.stroke()
        ctx.fillStyle = canLearn ? UI.bg : UI.textMuted
        ctx.font = '11px sans-serif'
        ctx.textBaseline = 'middle'
        ctx.fillText(learnCost + ' 灵感', btnX + btnW / 2, btnY + btnH / 2)
        ctx.textBaseline = 'alphabetic'
        drawerGameLearnSkillRect = { x: btnX, y: btnY, w: btnW, h: btnH }
      } else {
        ctx.fillText('打磨武器', cx + cardW / 2, cardY + 14)
        ctx.font = '10px sans-serif'
        ctx.fillStyle = UI.textDim
        const forgeCost = getForgeWeaponCost()
        const forgePct = ((weaponForgedMul - 1) * 100).toFixed(0)
        ctx.fillText('属性+20% 当前+' + forgePct + '%', cx + cardW / 2, cardY + 30)
        const btnW = 44
        const btnH = 22
        const buyX = cx + (cardW - btnW) / 2
        const buyY = cardY + cardH - btnH - 6
        const canForge = playerGold >= forgeCost
        roundRect(buyX, buyY, btnW, btnH, UI.radiusSm)
        ctx.fillStyle = canForge ? '#0d9488' : UI.bgCardAlt
        ctx.fill()
        ctx.strokeStyle = canForge ? 'rgba(13,148,136,0.6)' : UI.textMuted
        ctx.stroke()
        ctx.fillStyle = canForge ? UI.bg : UI.textMuted
        ctx.font = '11px sans-serif'
        ctx.textBaseline = 'middle'
        ctx.fillText(forgeCost + '金', buyX + btnW / 2, buyY + btnH / 2)
        ctx.textBaseline = 'alphabetic'
        drawerGameForgeBuyRect = { x: buyX, y: buyY, w: btnW, h: btnH }
      }
    }
    ctx.textAlign = 'left'
    return
  }
  drawerGameChallengeRect = null
  drawerGameLearnSkillRect = null
  drawerGameForgeBuyRect = null

  if (bottomDrawerTab === 'attribute') {
    ctx.fillStyle = UI.primary
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('角色属性', w / 2, drawerTop + 16)
    ctx.textAlign = 'left'
    drawAttributeContentInDrawer(contentX, contentTop, contentW, contentH)
    return
  }
  if (bottomDrawerTab === 'damage') {
    ctx.fillStyle = UI.primary
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('伤害统计  总伤害 ' + Math.round(getTotalDamage()), w / 2, drawerTop + 16)
    ctx.textAlign = 'left'
    drawDamageStatsContentInDrawer(contentX, contentTop, contentW, contentH)
    return
  }
  if (bottomDrawerTab === 'synergy') {
    ctx.fillStyle = UI.primary
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('吞噬效果', w / 2, drawerTop + 16)
    ctx.textAlign = 'left'
    drawSynergyContentInDrawer(contentX, contentTop, contentW, contentH)
    return
  }
  if (bottomDrawerTab === 'shop') {
    ctx.fillStyle = UI.primary
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('商店  ·  金币 ' + playerGold, w / 2, drawerTop + 16)
    ctx.textAlign = 'left'
    drawShopContentInDrawer(contentX, contentTop, contentW, contentH)
  }
}

function drawShopContentInDrawer(boxX, boxY, boxW, boxH) {
  const rowH = 40
  const buyW = 56
  const buyH = 28
  shopBuyRects = []
  for (let i = 0; i < SHOP_ITEMS.length; i++) {
    const ry = boxY + i * rowH
    const item = SHOP_ITEMS[i]
    const cost = item.isForge ? getForgeWeaponCost() : item.cost
    const canBuy = playerGold >= cost
    const forgePct = item.isForge ? ((weaponForgedMul - 1) * 100).toFixed(0) : ''
    ctx.fillStyle = UI.text
    ctx.font = '13px sans-serif'
    ctx.fillText(item.name + '  ' + cost + ' 金' + (forgePct ? '（当前 +' + forgePct + '%）' : ''), boxX, ry + 12)
    ctx.fillStyle = UI.textDim
    ctx.font = '11px sans-serif'
    ctx.fillText(item.desc, boxX, ry + 26)
    const buyX = boxX + boxW - buyW
    roundRect(buyX, ry + 4, buyW, buyH, UI.radiusSm)
    ctx.fillStyle = canBuy ? UI.success : UI.bgCardAlt
    ctx.fill()
    ctx.strokeStyle = canBuy ? 'rgba(255,255,255,0.15)' : UI.border
    ctx.stroke()
    ctx.fillStyle = canBuy ? UI.bg : UI.textMuted
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('购买', buyX + buyW / 2, ry + 4 + buyH / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    shopBuyRects.push({ x: buyX, y: ry + 4, w: buyW, h: buyH })
  }
}

function drawAttributeContentInDrawer(boxX, boxY, boxW, boxH) {
  const attackVal = computeAttack()
  const intervalVal = computeAttackInterval()
  const attacksPerSec = intervalVal > 0 ? (1 / intervalVal).toFixed(2) : '0'
  const shopAttackPct = ((playerAttackMul - 1) * 100) | 0
  const shopSpeedPct = ((playerSpeedMul - 1) * 100) | 0
  const effectiveCritVal = getEffectiveCrit()
  const effectiveHasteDisplay = getEffectiveHaste()
  const critPct = (getCritChance() * 100).toFixed(0)
  const masteryVal = getEffectiveMastery()
  const lifestealVal = getEffectiveLifesteal()
  const lineH = 18
  const innerGap = 16
  const leftColX = boxX
  const rightColX = boxX + Math.floor(boxW / 2) + 8
  let rowY = boxY + 8
  ctx.font = '13px sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = UI.text
  ctx.fillText('生命值 ' + Math.ceil(playerHp) + '/' + Math.round(playerMaxHp), leftColX, rowY)
  rowY += lineH
  ctx.fillText('攻击力 ' + (attackVal >= 10 ? Math.round(attackVal) : attackVal.toFixed(1)), leftColX, rowY)
  rowY += lineH
  ctx.fillText('攻速 ' + attacksPerSec + '次/秒', leftColX, rowY)
  rowY += lineH
  ctx.fillText('攻击间隔 ' + intervalVal.toFixed(2) + '秒', leftColX, rowY)
  if (shopAttackPct > 0 || shopSpeedPct > 0) {
    rowY += lineH
    ctx.fillStyle = UI.primary
    ctx.fillText('永久 攻击+' + shopAttackPct + '% 攻速+' + shopSpeedPct + '%', leftColX, rowY)
    ctx.fillStyle = UI.text
  }
  rowY = boxY + 8
  ctx.fillStyle = UI.textDim
  ctx.fillText('力量 ' + Math.round(playerStr + getEquipmentStrBonus()) + '  敏捷 ' + playerAgi + '  智力 ' + playerInt + '  耐力 ' + Math.round(playerSta + getEquipmentStaBonus()), rightColX, rowY)
  rowY += lineH
  ctx.fillText('暴击 ' + critPct + '% (' + effectiveCritVal + ')', rightColX, rowY)
  rowY += lineH
  ctx.fillText('极速 ' + effectiveHasteDisplay + ' (攻速/CD+' + effectiveHasteDisplay + '%)', rightColX, rowY)
  rowY += lineH
  ctx.fillText('精通 ' + masteryVal + '%  吸血 ' + lifestealVal + '%', rightColX, rowY)
  rowY += lineH
  if (hasRageMechanic()) {
    ctx.fillText('怒气 ' + Math.min(RAGE_MAX, Math.floor(playerRage)) + '/' + RAGE_MAX, rightColX, rowY)
    rowY += lineH
  }
  ctx.font = '12px sans-serif'
  ctx.fillText((HERO_TYPES[heroType] || heroType) + ' · ' + getHeroClass().name, rightColX, rowY)
  ctx.textBaseline = 'alphabetic'
}

function drawDamageStatsContentInDrawer(boxX, boxY, boxW, boxH) {
  damageStatsBoxBounds = { x: boxX, y: boxY, w: boxW, h: boxH }
  const innerGap = 12
  const barH = 14
  const barGap = 4
  const rowH = barH + barGap
  const labelW = 52
  const rightW = 62
  const barW = Math.max(0, boxW - labelW - rightW)
  const totalDmg = getTotalDamage()
  const sorted = getDamageStatsSorted()
  damageStatsContentHeight = (sorted.length > 0 && totalDmg > 0) ? 8 + sorted.length * rowH : 32
  const maxScroll = Math.max(0, damageStatsContentHeight - boxH)
  if (damageStatsScrollY > maxScroll) damageStatsScrollY = maxScroll
  ctx.save()
  ctx.beginPath()
  ctx.rect(boxX, boxY, boxW, boxH)
  ctx.clip()
  let rowY = boxY + 8 - damageStatsScrollY
  if (sorted.length > 0 && totalDmg > 0) {
    for (let i = 0; i < sorted.length; i++) {
      const [name, val, count] = sorted[i]
      const pct = val / totalDmg
      ctx.fillStyle = UI.text
      ctx.font = '11px sans-serif'
      ctx.fillText(name, boxX + innerGap, rowY + 10)
      const barX = boxX + innerGap + labelW + 4
      const barY = rowY + 2
      roundRect(barX, barY, barW, barH - 2, 2)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fill()
      roundRect(barX, barY, barW * pct, barH - 2, 2)
      ctx.fillStyle = DAMAGE_TYPE_COLORS[name] || UI.primary
      ctx.fill()
      ctx.fillStyle = UI.textDim
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(Math.round(val) + '  ' + count + '次', boxX + boxW - innerGap - 8, rowY + 10)
      ctx.textAlign = 'left'
      rowY += rowH
    }
  } else {
    ctx.fillStyle = UI.textMuted
    ctx.font = '12px sans-serif'
    ctx.fillText('造成伤害后在此显示', boxX + innerGap, rowY + 12)
  }
  ctx.restore()
}

function drawSynergyContentInDrawer(boxX, boxY, boxW, boxH) {
  const innerGap = 12
  let lineY = boxY + 8
  const activeSynergies = []
  for (let i = 0; i < SYNERGY_DEFS.length; i++)
    if (isSynergyActive(i)) activeSynergies.push(SYNERGY_DEFS[i])
  const xuanfengDevoured = isLearned(SKILL_XUANFENG_ID) && isSkillConsumedBySynergy(SKILL_XUANFENG_ID)
  const baonuDevoured = isLearned(SKILL_BAONU_ID) && isSkillConsumedBySynergy(SKILL_BAONU_ID)
  const otherConsumed = learned_skill_ids.filter(id =>
    isSkillConsumedBySynergy(id) &&
    !activeSynergies.some(s => s.req.includes(id)) &&
    id !== SKILL_XUANFENG_ID && id !== SKILL_BAONU_ID
  )
  const hasAnyDevour = activeSynergies.length > 0 || xuanfengDevoured || baonuDevoured || otherConsumed.length > 0
  if (!hasAnyDevour) {
    ctx.fillStyle = UI.textMuted
    ctx.font = '12px sans-serif'
    ctx.fillText('激活吞噬后在此显示', boxX + innerGap, lineY + 14)
    lineY += 32
  } else {
    ctx.fillStyle = UI.textDim
    ctx.font = '12px sans-serif'
    for (let i = 0; i < activeSynergies.length; i++) {
      const s = activeSynergies[i]
      const consumedNames = s.req.map(id => (getSkillById(id) && getSkillById(id).name) || '')
      ctx.fillText(s.name + '（已激活）', boxX + innerGap, lineY + 12)
      lineY += 16
      ctx.fillStyle = UI.textMuted
      ctx.font = '11px sans-serif'
      ctx.fillText('已吞噬 ' + consumedNames.filter(Boolean).join('、') + '，不占栏位', boxX + innerGap, lineY + 12)
      lineY += 20
      ctx.fillStyle = UI.textDim
      ctx.font = '12px sans-serif'
    }
    if (xuanfengDevoured) {
      ctx.fillText('旋风斩：' + MONSTER_KILL_FOR_XUANFENG_DEVOUR + '击杀已吞噬', boxX + innerGap, lineY + 12)
      lineY += 20
    }
    if (baonuDevoured) {
      ctx.fillText('暴怒：' + RAGE_CONSUMED_FOR_BAONU_DEVOUR + '怒气已吞噬', boxX + innerGap, lineY + 12)
      lineY += 20
    }
    if (otherConsumed.length > 0) {
      const names = otherConsumed.map(id => (getSkillById(id) && getSkillById(id).name) || ('id' + id)).filter(Boolean)
      ctx.fillText('已吞噬 ' + names.join('、') + '，不占栏位', boxX + innerGap, lineY + 12)
    }
  }
}

function drawWeaponGrantToast(w, h) {
  if (weaponGrantToastRemaining <= 0) return
  const total = weaponGrantToastDuration
  const elapsed = total - weaponGrantToastRemaining
  const cx = w / 2
  const cy = h / 2 - 20
  const boxW = Math.min(280, w - 48)
  const boxH = 88
  const gap = 16
  const btnW = 100
  const slotRowH = SKILL_BAR_SLOT_H
  const slotRows = Math.ceil(MAX_SKILL_SLOTS / SKILL_SLOTS_PER_ROW)
  const skillBarTotalH = slotRows * slotRowH + (slotRows - 1) * SKILL_BAR_SLOT_GAP
  const equipRowH = 44
  const equipRowY = panelTop + 28 + skillBarTotalH + 16
  const slotAreaW = Math.max(0, w - gap * 2 - btnW - gap - 8)
  const slotGap = SKILL_BAR_SLOT_GAP
  const equipSlotW = slotAreaW > 0 ? Math.max(0, Math.floor((slotAreaW - slotGap * (MAX_EQUIP_SLOTS - 1)) / MAX_EQUIP_SLOTS)) : 60
  const targetX = gap + equipSlotW / 2
  const targetY = equipRowY + equipRowH / 2

  const phase1End = 0.32
  const phase2Len = total - phase1End
  let x = cx
  let y = cy
  let scale = 1
  let overlayAlpha = 0.85

  if (elapsed < phase1End) {
    const t = elapsed / phase1End
    scale = 0.5 + 0.5 * t * t
    overlayAlpha = 0.85 * (1 - t * 0.3)
  } else {
    const t = (elapsed - phase1End) / phase2Len
    const easeT = t * t * (3 - 2 * t)
    x = cx + (targetX - cx) * easeT
    y = cy + (targetY - cy) * easeT
    scale = 1 - 0.78 * easeT
    overlayAlpha = 0.6 * (1 - easeT)
  }

  ctx.fillStyle = 'rgba(15,14,20,' + overlayAlpha + ')'
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.translate(-boxW / 2, -boxH / 2)
  roundRect(0, 0, boxW, boxH, UI.radius)
  ctx.fillStyle = UI.bgCard
  ctx.fill()
  ctx.strokeStyle = UI.primary
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = UI.primary
  ctx.font = 'bold 20px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('你获得了一把新武器！', boxW / 2, 32)
  ctx.fillStyle = UI.text
  ctx.font = 'bold 16px sans-serif'
  ctx.fillText(weaponGrantToastName, boxW / 2, 62)
  ctx.restore()
  ctx.textAlign = 'left'
}

function drawDamageStatsOverlay(w, h) {
  ctx.fillStyle = 'rgba(15,14,20,0.88)'
  ctx.fillRect(0, 0, w, h)
  const pad = 20
  const boxW = Math.min(320, w - pad * 2)
  const boxH = Math.min(380, h - pad * 2)
  const boxX = (w - boxW) / 2
  const boxY = (h - boxH) / 2
  roundRect(boxX, boxY, boxW, boxH, UI.radius)
  ctx.fillStyle = UI.bgPanel
  ctx.fill()
  ctx.strokeStyle = UI.border
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = UI.primary
  ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('伤害统计  总伤害 ' + Math.round(getTotalDamage()), w / 2, boxY + 28)
  ctx.textAlign = 'left'

  const innerGap = 16
  const barH = 14
  const barGap = 4
  const labelW = 52
  const rightW = 62
  const barW = Math.max(0, boxW - innerGap * 2 - labelW - rightW)
  const totalDmg = getTotalDamage()
  const sorted = getDamageStatsSorted()
  let rowY = boxY + 52
  if (sorted.length > 0 && totalDmg > 0) {
    for (let i = 0; i < sorted.length; i++) {
      const [name, val, count] = sorted[i]
      const pct = val / totalDmg
      ctx.fillStyle = UI.text
      ctx.font = '11px sans-serif'
      ctx.fillText(name, boxX + innerGap, rowY + 10)
      const barX = boxX + innerGap + labelW + 4
      const barY = rowY + 2
      roundRect(barX, barY, barW, barH - 2, 2)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fill()
      roundRect(barX, barY, barW * pct, barH - 2, 2)
      ctx.fillStyle = DAMAGE_TYPE_COLORS[name] || UI.primary
      ctx.fill()
      ctx.fillStyle = UI.textDim
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(Math.round(val) + '  ' + count + '次', boxX + boxW - innerGap - 8, rowY + 10)
      ctx.textAlign = 'left'
      rowY += barH + barGap
    }
  } else {
    ctx.fillStyle = UI.textMuted
    ctx.font = '12px sans-serif'
    ctx.fillText('造成伤害后在此显示', boxX + innerGap, rowY + 12)
    rowY += 28
  }

  const closeW = 80
  const closeH = 36
  const closeX = (w - closeW) / 2
  const closeY = boxY + boxH - closeH - 20
  roundRect(closeX, closeY, closeW, closeH, UI.radiusSm)
  ctx.fillStyle = UI.bgCard
  ctx.fill()
  ctx.strokeStyle = UI.primary
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = UI.primary
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('关闭', closeX + closeW / 2, closeY + closeH / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  damageStatsCloseRect = { x: closeX, y: closeY, w: closeW, h: closeH }
}

function drawSynergyOverlay(w, h) {
  ctx.fillStyle = 'rgba(15,14,20,0.88)'
  ctx.fillRect(0, 0, w, h)
  const pad = 20
  const boxW = Math.min(320, w - pad * 2)
  const boxH = Math.min(400, h - pad * 2)
  const boxX = (w - boxW) / 2
  const boxY = (h - boxH) / 2
  roundRect(boxX, boxY, boxW, boxH, UI.radius)
  ctx.fillStyle = UI.bgPanel
  ctx.fill()
  ctx.strokeStyle = UI.border
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = UI.primary
  ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('吞噬效果', w / 2, boxY + 28)
  ctx.textAlign = 'left'

  const innerGap = 16
  let lineY = boxY + 52
  const activeSynergies = []
  for (let i = 0; i < SYNERGY_DEFS.length; i++)
    if (isSynergyActive(i)) activeSynergies.push(SYNERGY_DEFS[i])
  const xuanfengDevoured = isLearned(SKILL_XUANFENG_ID) && isSkillConsumedBySynergy(SKILL_XUANFENG_ID)
  const baonuDevoured = isLearned(SKILL_BAONU_ID) && isSkillConsumedBySynergy(SKILL_BAONU_ID)
  const otherConsumed = learned_skill_ids.filter(id =>
    isSkillConsumedBySynergy(id) &&
    !activeSynergies.some(s => s.req.includes(id)) &&
    id !== SKILL_XUANFENG_ID && id !== SKILL_BAONU_ID
  )
  const hasAnyDevour = activeSynergies.length > 0 || xuanfengDevoured || baonuDevoured || otherConsumed.length > 0
  if (!hasAnyDevour) {
    ctx.fillStyle = UI.textMuted
    ctx.font = '12px sans-serif'
    ctx.fillText('激活吞噬后在此显示', boxX + innerGap, lineY + 14)
    lineY += 32
  } else {
    ctx.fillStyle = UI.textDim
    ctx.font = '12px sans-serif'
    for (let i = 0; i < activeSynergies.length; i++) {
      const s = activeSynergies[i]
      const consumedNames = s.req.map(id => (getSkillById(id) && getSkillById(id).name) || '')
      const consumedStr = consumedNames.filter(Boolean).join('、')
      ctx.fillText(s.name + '（已激活）', boxX + innerGap, lineY + 12)
      lineY += 16
      ctx.fillStyle = UI.textMuted
      ctx.font = '11px sans-serif'
      ctx.fillText('已吞噬 ' + consumedStr + '，不占栏位', boxX + innerGap, lineY + 12)
      lineY += 20
      ctx.fillStyle = UI.textDim
      ctx.font = '12px sans-serif'
    }
    if (xuanfengDevoured) {
      ctx.fillText('旋风斩：' + MONSTER_KILL_FOR_XUANFENG_DEVOUR + '击杀已吞噬', boxX + innerGap, lineY + 12)
      lineY += 16
      ctx.fillStyle = UI.textMuted
      ctx.font = '11px sans-serif'
      ctx.fillText('已吞噬 旋风斩，不占栏位', boxX + innerGap, lineY + 12)
      lineY += 20
      ctx.fillStyle = UI.textDim
      ctx.font = '12px sans-serif'
    }
    if (baonuDevoured) {
      ctx.fillText('暴怒：' + RAGE_CONSUMED_FOR_BAONU_DEVOUR + '怒气已吞噬', boxX + innerGap, lineY + 12)
      lineY += 16
      ctx.fillStyle = UI.textMuted
      ctx.font = '11px sans-serif'
      ctx.fillText('已吞噬 暴怒，不占栏位', boxX + innerGap, lineY + 12)
      lineY += 20
      ctx.fillStyle = UI.textDim
      ctx.font = '12px sans-serif'
    }
    if (otherConsumed.length > 0) {
      const names = otherConsumed.map(id => (getSkillById(id) && getSkillById(id).name) || ('id' + id)).filter(Boolean)
      ctx.fillText('已吞噬 ' + names.join('、') + '，不占栏位', boxX + innerGap, lineY + 12)
      lineY += 20
    }
  }

  const closeW = 80
  const closeH = 36
  const closeX = (w - closeW) / 2
  const closeY = boxY + boxH - closeH - 20
  roundRect(closeX, closeY, closeW, closeH, UI.radiusSm)
  ctx.fillStyle = UI.bgCard
  ctx.fill()
  ctx.strokeStyle = UI.primary
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = UI.primary
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('关闭', closeX + closeW / 2, closeY + closeH / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  synergyCloseRect = { x: closeX, y: closeY, w: closeW, h: closeH }
}

function drawAttributeOverlay(w, h) {
  ctx.fillStyle = 'rgba(15,14,20,0.88)'
  ctx.fillRect(0, 0, w, h)
  const pad = 20
  const boxW = Math.min(340, w - pad * 2)
  const boxH = Math.min(420, h - pad * 2)
  const boxX = (w - boxW) / 2
  const boxY = (h - boxH) / 2
  roundRect(boxX, boxY, boxW, boxH, UI.radius)
  ctx.fillStyle = UI.bgPanel
  ctx.fill()
  ctx.strokeStyle = UI.border
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = UI.primary
  ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('角色属性', w / 2, boxY + 28)
  ctx.textAlign = 'left'

  const attackVal = computeAttack()
  const intervalVal = computeAttackInterval()
  const attacksPerSec = intervalVal > 0 ? (1 / intervalVal).toFixed(2) : '0'
  const shopAttackPct = ((playerAttackMul - 1) * 100) | 0
  const shopSpeedPct = ((playerSpeedMul - 1) * 100) | 0
  const effectiveCritVal = getEffectiveCrit()
  const effectiveHasteDisplay = getEffectiveHaste()
  const critPct = (getCritChance() * 100).toFixed(0)
  const masteryVal = getEffectiveMastery()
  const lifestealVal = getEffectiveLifesteal()
  const lineH = 18
  const innerGap = 20
  const leftColX = boxX + innerGap
  const rightColX = boxX + Math.floor(boxW / 2) + 8
  let rowY = boxY + 50
  ctx.font = '14px sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = UI.text
  ctx.fillText('生命值 ' + Math.ceil(playerHp) + '/' + Math.round(playerMaxHp), leftColX, rowY)
  rowY += lineH
  ctx.fillText('攻击力 ' + (attackVal >= 10 ? Math.round(attackVal) : attackVal.toFixed(1)), leftColX, rowY)
  rowY += lineH
  ctx.fillText('攻速 ' + attacksPerSec + '次/秒', leftColX, rowY)
  rowY += lineH
  ctx.fillText('攻击间隔 ' + intervalVal.toFixed(2) + '秒', leftColX, rowY)
  if (shopAttackPct > 0 || shopSpeedPct > 0) {
    rowY += lineH
    ctx.fillStyle = UI.primary
    ctx.fillText('永久 攻击+' + shopAttackPct + '% 攻速+' + shopSpeedPct + '%', leftColX, rowY)
    ctx.fillStyle = UI.text
  }
  rowY = boxY + 50
  ctx.fillStyle = UI.textDim
  ctx.fillText('力量 ' + Math.round(playerStr + getEquipmentStrBonus()) + '  敏捷 ' + playerAgi + '  智力 ' + playerInt + '  耐力 ' + Math.round(playerSta + getEquipmentStaBonus()), rightColX, rowY)
  rowY += lineH
  ctx.fillText('暴击 ' + critPct + '% (' + effectiveCritVal + ')', rightColX, rowY)
  rowY += lineH
  ctx.fillText('极速 ' + effectiveHasteDisplay + ' (攻速/CD+' + effectiveHasteDisplay + '%)', rightColX, rowY)
  rowY += lineH
  ctx.fillText('精通 ' + masteryVal + '%  吸血 ' + lifestealVal + '%', rightColX, rowY)
  rowY += lineH
  if (hasRageMechanic()) {
    ctx.fillText('怒气 ' + Math.min(RAGE_MAX, Math.floor(playerRage)) + '/' + RAGE_MAX, rightColX, rowY)
    rowY += lineH
  }
  ctx.font = '12px sans-serif'
  ctx.fillText((HERO_TYPES[heroType] || heroType) + ' · ' + getHeroClass().name, rightColX, rowY)

  const closeW = 80
  const closeH = 36
  const closeX = (w - closeW) / 2
  const closeY = boxY + boxH - closeH - 20
  roundRect(closeX, closeY, closeW, closeH, UI.radiusSm)
  ctx.fillStyle = UI.bgCard
  ctx.fill()
  ctx.strokeStyle = UI.primary
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = UI.primary
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('关闭', closeX + closeW / 2, closeY + closeH / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  attributeCloseRect = { x: closeX, y: closeY, w: closeW, h: closeH }
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

function startLoop() {
  requestAnimationFrame(loop)
}
if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startLoop)
} else {
  startLoop()
}
