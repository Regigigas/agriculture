export type SolarTermSeason = 'spring' | 'summer' | 'autumn' | 'winter'

export interface SolarTerm {
  name: string
  date: string
  season: SolarTermSeason
  theme: string
  cropStage: string
  workItems: string[]
  riskTips: string[]
}

export interface SolarTermPlan {
  current: SolarTerm
  next: SolarTerm
  upcoming: SolarTerm[]
  daysToNext: number
}

const dayMs = 24 * 60 * 60 * 1000

export const solarTerms2026: SolarTerm[] = [
  { name: '小寒', date: '2026-01-05', season: 'winter', theme: '低温防护', cropStage: '越冬作物抗寒期', workItems: ['检查棚室保温', '清沟防渍', '盘点农资库存'], riskTips: ['寒潮', '冻害', '棚膜破损'] },
  { name: '大寒', date: '2026-01-20', season: 'winter', theme: '越冬管理', cropStage: '冬季蓄势期', workItems: ['加固设施', '维护灌溉设备', '整理春耕计划'], riskTips: ['低温', '大风', '用电安全'] },
  { name: '立春', date: '2026-02-04', season: 'spring', theme: '春耕启动', cropStage: '返青准备期', workItems: ['制定春播排期', '检修农机', '关注墒情回升'], riskTips: ['倒春寒', '土壤过湿', '苗床温差'] },
  { name: '雨水', date: '2026-02-18', season: 'spring', theme: '水分管理', cropStage: '越冬作物返青期', workItems: ['清理沟渠', '适时追肥', '巡查低洼地块'], riskTips: ['连阴雨', '渍害', '病害萌发'] },
  { name: '惊蛰', date: '2026-03-05', season: 'spring', theme: '病虫初防', cropStage: '春管提速期', workItems: ['监测虫情', '整地备播', '加强苗情巡查'], riskTips: ['虫卵孵化', '温度波动', '杂草返青'] },
  { name: '春分', date: '2026-03-20', season: 'spring', theme: '播管并进', cropStage: '春播窗口期', workItems: ['安排春播', '均衡施肥', '记录苗情长势'], riskTips: ['晚霜', '风干', '播期延误'] },
  { name: '清明', date: '2026-04-05', season: 'spring', theme: '育苗移栽', cropStage: '苗期管理期', workItems: ['移栽定植', '查苗补苗', '做好田间除草'], riskTips: ['低温阴雨', '苗弱', '土传病害'] },
  { name: '谷雨', date: '2026-04-20', season: 'spring', theme: '雨生百谷', cropStage: '春播保苗期', workItems: ['抢墒播种', '补水保苗', '监测叶面病害'], riskTips: ['强降雨', '田间积水', '病害扩散'] },
  { name: '立夏', date: '2026-05-05', season: 'summer', theme: '夏管开始', cropStage: '营养生长期', workItems: ['追肥促长', '布设虫情板', '校准水肥设备'], riskTips: ['高温初现', '蚜虫', '干旱'] },
  { name: '小满', date: '2026-05-21', season: 'summer', theme: '籽粒灌浆', cropStage: '夏熟作物灌浆期', workItems: ['稳水稳肥', '防治赤霉病', '预估收获批次'], riskTips: ['干热风', '病害', '倒伏'] },
  { name: '芒种', date: '2026-06-05', season: 'summer', theme: '夏收夏种夏管', cropStage: '抢收抢种高峰期', workItems: ['安排抢收', '推进夏播', '同步夏管除草'], riskTips: ['短时强降雨', '机械排队', '播期拥堵'] },
  { name: '夏至', date: '2026-06-21', season: 'summer', theme: '高温长日照', cropStage: '旺盛生长期', workItems: ['优化灌溉时段', '补充钾肥', '巡查日灼风险'], riskTips: ['高温', '蒸发量大', '病虫加速'] },
  { name: '小暑', date: '2026-07-07', season: 'summer', theme: '暑热防涝', cropStage: '水热敏感期', workItems: ['检查排涝能力', '早晚灌溉', '防治虫害'], riskTips: ['暴雨', '热害', '湿热病害'] },
  { name: '大暑', date: '2026-07-23', season: 'summer', theme: '极端天气值守', cropStage: '产量形成关键期', workItems: ['高温预警值守', '加强通风降温', '记录灾害影响'], riskTips: ['极端高温', '台风外围雨', '设施闷棚'] },
  { name: '立秋', date: '2026-08-07', season: 'autumn', theme: '秋管衔接', cropStage: '秋季转段期', workItems: ['评估秋茬计划', '加强水肥收尾', '排查病虫残留'], riskTips: ['秋老虎', '旱涝急转', '晚季病虫'] },
  { name: '处暑', date: '2026-08-23', season: 'autumn', theme: '降温稳产', cropStage: '成熟前管理期', workItems: ['控旺促熟', '安排采收人手', '复核仓储空间'], riskTips: ['昼夜温差', '后期倒伏', '霉变'] },
  { name: '白露', date: '2026-09-07', season: 'autumn', theme: '露重防病', cropStage: '秋收准备期', workItems: ['加强病害巡田', '分批测产', '维护烘干设备'], riskTips: ['露水重', '霜霉类病害', '早晚低温'] },
  { name: '秋分', date: '2026-09-23', season: 'autumn', theme: '秋收秋种', cropStage: '收种并行期', workItems: ['组织秋收', '安排秋播', '复盘产量数据'], riskTips: ['连阴雨', '收获损失', '播种窗口短'] },
  { name: '寒露', date: '2026-10-08', season: 'autumn', theme: '寒意渐起', cropStage: '晚秋管理期', workItems: ['晚茬防寒', '清理田间残体', '推进秸秆处理'], riskTips: ['冷空气', '露重', '病残体传播'] },
  { name: '霜降', date: '2026-10-23', season: 'autumn', theme: '初霜防护', cropStage: '收尾防冻期', workItems: ['抢收耐寒弱的作物', '覆盖防霜', '检查仓储湿度'], riskTips: ['早霜', '低温冻害', '仓储返潮'] },
  { name: '立冬', date: '2026-11-07', season: 'winter', theme: '冬管开局', cropStage: '越冬准备期', workItems: ['播后镇压保墒', '搭建防寒设施', '封存农机'], riskTips: ['骤冷', '大风', '墒情不足'] },
  { name: '小雪', date: '2026-11-22', season: 'winter', theme: '保温保墒', cropStage: '越冬苗期', workItems: ['检查苗情密度', '覆盖保温', '防控棚室湿害'], riskTips: ['雨雪', '棚内高湿', '冻融交替'] },
  { name: '大雪', date: '2026-12-07', season: 'winter', theme: '设施巡检', cropStage: '冬季休整期', workItems: ['清雪除冰预案', '补强棚架', '校验传感器'], riskTips: ['积雪压棚', '低温寡照', '设备离线'] },
  { name: '冬至', date: '2026-12-22', season: 'winter', theme: '年末复盘', cropStage: '休整蓄势期', workItems: ['复盘年度生产', '制定来年轮作', '维护仓储环境'], riskTips: ['持续低温', '库存损耗', '人员排班不足'] },
]

function toLocalDate(value: string) {
  return new Date(`${value}T00:00:00`)
}

function diffDays(from: Date, to: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.max(0, Math.round((end - start) / dayMs))
}

export function formatSolarTermDate(value: string) {
  const date = toLocalDate(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function getSolarTermPlan(now = new Date()): SolarTermPlan {
  const terms = solarTerms2026
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const nextIndex = terms.findIndex((term) => toLocalDate(term.date) > today)
  const currentIndex = nextIndex === -1 ? terms.length - 1 : Math.max(0, nextIndex - 1)
  const next = terms[nextIndex === -1 ? 0 : nextIndex]
  const upcoming = Array.from({ length: 3 }, (_, offset) => terms[(currentIndex + offset + 1) % terms.length])

  return {
    current: terms[currentIndex],
    next,
    upcoming,
    daysToNext: nextIndex === -1 ? diffDays(today, new Date('2027-01-05T00:00:00')) : diffDays(today, toLocalDate(next.date)),
  }
}
