/**
 * 学院信息筛选引擎（零依赖，可在 GitHub Actions 里直接跑）
 *
 * 判断口径（用户定稿）：
 *   总原则 —— 是否需要学生采取行动、是否影响学业进度/资格身份/安全、是否有明确时间点
 *   保留 18 类；忽略社团招新、日常活动宣传、节日问候、纯获奖喜报、活动总结、新闻稿、
 *   已过期通知、与学业无关的商业广告、校外培训推销
 *
 * 时间显示口径（用户定稿）：
 *   有区间就写区间；报名时间也保留；一条里多个时间段时并列展示，每段标出它是什么时间
 *   例：报名 11月1日—11月10日；初赛 11月15日；决赛 11月25日
 */

const CATEGORIES = [
  '竞赛', '教务考试', '选课学籍', '评奖资助', '缴费注册', '实习就业', '保研考研',
  '交流交换', '科研创新', '论文答辩', '实验安全', '讲座报告', '党团实践', '安全后勤',
  '健康医保', '证件考试', '毕业离校', '其他重要',
];

// 分类关键词：标题命中权重 10，正文命中权重 2
const CATEGORY_RULES = [
  ['竞赛', ['竞赛', '大赛', '比赛', '杯赛', '挑战赛', '选拔赛', '创新创业大赛', '创新创业项目', '揭榜挂帅', '作品征集', '初赛', '决赛']],
  ['教务考试', ['考试', '期末考试', '监考', '补考', '缓考', '重修', '成绩', '阅卷', '答题卡']],
  ['选课学籍', ['选课', '退课', '补选', '学籍', '转专业', '辅修', '双学位', '注册', '学分', '培养方案']],
  ['评奖资助', ['奖学金', '助学金', '评奖', '评优', '三好学生', '困难认定', '勤工助学', '助学贷款', '励志']],
  ['缴费注册', ['学费', '住宿费', '缴费', '收费', '缴纳', '报到', '注册']],
  ['实习就业', ['招聘', '就业', '实习', '宣讲', '双选', '三方协议', '就业推荐', '岗位', '校企', 'offer']],
  ['保研考研', ['推免', '保研', '夏令营', '考研', '研究生招生', '复试', '初试', '调剂']],
  ['交流交换', ['交换', '交流', '联合培养', '出国', '留学', '访学', '境外']],
  ['科研创新', ['大创', '科研', '创新项目', '课题', '立项', '结题', '创新创业项目', '基金', '实验项目']],
  ['论文答辩', ['开题', '中期检查', '查重', '送审', '答辩', '论文', '毕设', '课程报告']],
  ['实验安全', ['实验室', '实验课', '试剂', '危化品', '安全培训', '准入', '设备使用', '实验教学']],
  ['讲座报告', ['讲座', '报告会', '沙龙', '论坛', '学术报告', '分享会', '实务导师进班级', '实务精英进课堂']],
  ['党团实践', ['入党', '入团', '党课', '团课', '团校', '志愿服务', '社会实践', '团员', '党员', '推优']],
  ['安全后勤', ['消防', '演练', '停水', '停电', '施工', '宿舍', '食堂', '校车', '门禁', '安全隐患', '安全检查', '安全专项']],
  ['健康医保', ['医保', '体检', '疫苗', '传染病', '心理健康', '就医', '门诊']],
  ['证件考试', ['学生证', '四六级', '英语四级', '六级', '计算机等级', '普通话', '教师资格', '征兵', '档案', '户口']],
  ['毕业离校', ['毕业', '离校', '学位', '毕业审核', '就业报到', '档案转递', '毕业典礼']],
];

// 直接忽略的类型：标题命中即丢弃（喜报、活动总结、新闻稿这类从标题就能看出来）
const SKIP_TITLE = [
  /社团招新|社团纳新|招新公告|纳新啦/,
  /节日快乐|佳节|除夕|中秋快|新春|教师节快乐/,
  /喜报|热烈祝贺|再获佳绩|斩获|荣获|获奖情况通报|再创佳绩/,
  /圆满结束|顺利结束|成功举办|顺利举办|圆满举办|总结大会|活动总结|侧记|纪实|回顾/,
  /新闻稿|通讯员报道|接受采访/,
  /开展.?(?:专题)?宣讲|专题宣讲|宣讲活动|走进|面对面|暖心|护航/,
  /校外培训|培训班招生|速成班|包就业|学历提升|兼职招聘/,
];

// 正文命中即丢弃（只放确实是宣传稿、推销稿的表达，避免误杀正文里顺带提一句的通知）
const SKIP_BODY = [
  /社团招新|社团纳新/,
  /校外培训|培训班招生|速成班|包就业|学历提升|兼职招聘/,
  /圆满结束|顺利结束|成功举办|顺利举办|圆满举办|活动总结|侧记|纪实/,
  /取得优异成绩|展现.{0,8}风貌|圆满落幕|精彩瞬间|再获佳绩|获得.{0,6}(?:一等奖|二等奖|三等奖|金奖|银奖)/,
];

// 教职工事务，学生无关
const STAFF_RULES = [
  /教职工|全体教师|专任教师|教师大会|师德|师资培训|教学能力比赛|教代会/,
  /党委会|党政联席|院长办公会|中层干部|教代会|工会委员会/,
  /各位老师：|全体老师：/,
];

/* ==================== 分类 ==================== */

function pickCategory(title, body) {
  const t = String(title || '');
  const b = String(body || '').slice(0, 3000);
  const scores = new Map();

  for (const [cat, words] of CATEGORY_RULES) {
    let s = 0;
    for (const w of words) {
      if (t.includes(w)) s += 10;
      else if (b.includes(w)) s += 2;
    }
    if (s > 0) scores.set(cat, s);
  }
  if (!scores.size) return '其他重要';

  let best = '其他重要';
  let bestScore = 0;
  for (const [cat, s] of scores) {
    if (s > bestScore) { best = cat; bestScore = s; }
  }
  return bestScore >= 4 ? best : '其他重要';
}

/* ==================== 时间抽取 ==================== */

// 月份、日期都用捕获组，方便直接取数值
const MON = '(1[0-2]|0?[1-9])';
const DAY = '(3[01]|[12]\\d|0?[1-9])';
const YR = '(?:(20\\d{2})年)?';

// 区间：11月1日—11月10日 / 11月1日至10日 / 2026年11月1日-2026年11月10日
const RANGE_RE = new RegExp(
  `${YR}${MON}\\s*月\\s*${DAY}\\s*日?` +
  `(?:\\s*[（(][^）)]{0,8}[）)])?\\s*` +
  `(?:—|–|-|~|～|至|到)\\s*` +
  `${YR}${MON}\\s*月\\s*${DAY}\\s*日`,
  'g'
);

// 单点：11月15日 上午8:05 / 2026年11月20日17:00
const POINT_RE = new RegExp(
  `${YR}${MON}\\s*月\\s*${DAY}\\s*日` +
  `(?:\\s*[（(][^）)]{0,10}[）)])?` +
  `(?:\\s*(?:上午|下午|中午|晚上|傍晚)?\\s*\\d{1,2}\\s*[:：]\\s*\\d{2})?`,
  'g'
);

// 前面的时间属于什么
const LABEL_RULES = [
  ['报名', /报名|申请|网上填报|提交报名/],
  ['截止', /截止|截至|之前|以前|前完成|前提交/],
  ['公示', /公示/],
  ['初赛', /初赛|预赛|选拔赛/],
  ['复赛', /复赛/],
  ['决赛', /决赛|总决赛/],
  ['笔试', /笔试/],
  ['面试', /面试/],
  ['答辩', /答辩/],
  ['开题', /开题/],
  ['培训', /培训|辅导|集训/],
  ['讲座', /讲座|报告会|沙龙|论坛/],
  ['活动', /活动|举行|举办|开展/],
  ['检查', /检查|核查|清查|自查/],
  ['报到', /报到|注册/],
];

function labelOf(text, index) {
  // 只看日期前面一小段，并且取「离日期最近」的关键词
  const before = text.slice(Math.max(0, index - 24), index);
  let best = '';
  let bestPos = -1;
  for (const [label, re] of LABEL_RULES) {
    const g = new RegExp(re.source, 'g');
    let m;
    while ((m = g.exec(before)) !== null) {
      if (m.index > bestPos) { bestPos = m.index; best = label; }
      if (m.index === g.lastIndex) g.lastIndex++;
    }
  }
  if (best) return best;
  // 「11月20日前报送」这类，日期后面紧跟「前」就是截止
  const after = text.slice(index, index + 22);
  if (/^[^。]{0,10}(?:之前|以前|前完成|前提交|前报送|前交|前报)/.test(after)) return '截止';
  return '';
}

function normDate(raw, fallbackYear) {
  // 统一成「11月15日」，同年省掉年份
  const m = raw.match(new RegExp(`${YR}${MON}\\s*月\\s*${DAY}\\s*日?(?:\\s*[（(][^）)]{0,10}[）)])?` +
    `(?:\\s*(?:上午|下午|中午|晚上|傍晚)?\\s*\\d{1,2}\\s*[:：]\\s*\\d{2})?`));
  if (!m) return raw.replace(/\s+/g, '');

  const year = m[1] || fallbackYear;
  const month = String(m[2]).replace(/^0/, '');
  const day = String(m[3]).replace(/^0/, '');
  const tail = (m[0].match(/[（(][^）)]{0,10}[）)]/) || [''])[0]
    + (m[0].match(/(?:上午|下午|中午|晚上|傍晚)?\s*\d{1,2}\s*[:：]\s*\d{2}/) || [''])[0];

  const prefix = year ? `${year}年` : '';
  return prefix + `${month}月${day}日` + tail.replace(/\s+/g, '');
}

/**
 * 抽出所有时间段，返回 [{ label, text, index }]
 * label 是「这段属于什么时间」（报名 / 初赛 / 决赛 / 公示 …），没有就留空
 */
function extractTimes(rawText) {
  const text = String(rawText || '').replace(/\u00a0/g, ' ');
  const items = [];
  const covered = [];

  // 1) 先抓区间
  RANGE_RE.lastIndex = 0;
  let m;
  while ((m = RANGE_RE.exec(text)) !== null) {
    const startPart = normDate(m[0].split(/—|–|-|~|～|至|到/)[0], m[1]);
    const endPart = normDate(m[0].split(/—|–|-|~|～|至|到/).slice(1).join(''), m[4] || m[1]);
    const label = labelOf(text, m.index);
    items.push({ label, text: `${startPart} — ${endPart}`, index: m.index });
    covered.push([m.index, m.index + m[0].length]);
  }

  // 2) 再抓单点（跳过已被区间覆盖的位置，以及和区间端点重复的日期）
  POINT_RE.lastIndex = 0;
  while ((m = POINT_RE.exec(text)) !== null) {
    const inRange = covered.some(([a, b]) => m.index >= a && m.index < b);
    if (inRange) continue;
    const label = labelOf(text, m.index);
    const norm = normDate(m[0], m[1]);
    // 区间里已经写过的同一天，不再重复列
    const dup = items.some((it) => it.text.includes(norm));
    if (dup) continue;
    items.push({ label, text: norm, index: m.index });
  }

  // 3) 按原文顺序排列，同一标签只留第一个
  items.sort((a, b) => a.index - b.index);
  const seen = new Map();
  const out = [];
  for (const it of items) {
    const key = it.label || it.text;
    if (seen.has(key)) continue;
    seen.set(key, true);
    out.push(it);
  }
  return out.slice(0, 4);
}

/**
 * 生成展示用的时间字符串：多段并列，报名区间保留
 * 例：报名 11月1日 — 11月10日；初赛 11月15日；决赛 11月25日
 */
function formatTimes(rawText) {
  const times = extractTimes(rawText);
  if (!times.length) return '';
  return times
    .map((t) => (t.label ? `${t.label} ${t.text}` : t.text))
    .join('；');
}

/**
 * 原文只写「1月5日」没写年份时推断是哪一年。
 * 跨年最容易出事：12 月发的通知写「1月5日」，指的一定是明年。
 * 若按今年算就成了已过去的日期，寒假注册、开学报到这类通知会被判过期直接丢掉。
 * 做法：比当前月份早半年以上的，算明年。
 */
function inferYear(month, day, today) {
  const nowMonth = today.getMonth() + 1;
  if (month <= nowMonth - 6) return today.getFullYear() + 1;
  return today.getFullYear();
}

/**
 * 最晚的日期（用来判断是否已过期）
 */
function latestDate(rawText, now) {
  const text = String(rawText || '');
  const re = new RegExp(`${YR}${MON}\\s*月\\s*${DAY}\\s*日`, 'g');
  const today = now || new Date();
  let latest = null;
  let m;
  while ((m = re.exec(text)) !== null) {
    const month = Number(m[2]);
    const day = Number(m[3]);
    const year = m[1] ? Number(m[1]) : inferYear(month, day, today);
    const d = new Date(year, month - 1, day);
    if (!latest || d > latest) latest = d;
  }
  return latest;
}

// 活动全部过去 20 天以上，视为过期
function isExpired(rawText, now) {
  const latest = latestDate(rawText, now);
  if (!latest) return false;
  const today = now || new Date();
  const days = (today - latest) / 86400000;
  // 早于 3 年的日期一律当解析错误处理：OCR 常把 2026 认成 2006，正文里也常出现标题年份，
  // 不能因为一个错字就把整条通知判死。
  if (days > 1095) return false;
  return days > 20;
}

/* ==================== 要点抽取 ==================== */

const POINT_RULES = [
  ['条件', /面向|对象|资格|条件|要求|限.*(年级|专业|学院)|在校|全日制|本科生|研究生|名额|年龄|须|必须|具备|优先/],
  ['组队', /组队|团队|每队|队伍|队长|成员|人数|指导教师|指导老师|领队/],
  ['内容', /讲座题目|主题|主讲人|主讲|嘉宾|专家|报告人|实务导师|实务精英|分享内容|内容简介|简介/],
  ['材料', /材料|附件|报名表|申请表|推荐表|提交|报送|上传|发送至|盖章|签字|纸质|电子版|扫描件|身份证|成绩单/],
  ['流程', /初赛|复赛|决赛|赛程|环节|阶段|流程|评审|答辩|公示|初选|终评|材料审核|面试|笔试/],
  ['时间地点', /时间|地点|举行|举办|在.*(楼|室|厅|馆)|会议室|报告厅|线上|腾讯会议|钉钉|线下/],
  ['报名', /报名|申请|联系|咨询|渠道|链接|二维码|邮箱|电话|QQ群|微信群|负责人|联系人/],
];

const POINT_QUOTA = { 条件: 2, 组队: 1, 内容: 2, 材料: 2, 流程: 2, 时间地点: 2, 报名: 2 };

function splitSentences(text) {
  const base = String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split(/(?<=[。！？])|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
    // 「地点：B331」这类字段行只有两三个汉字，但信息很关键，单独放行
    .filter((s) => {
      const cn = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
      if (cn >= 6) return true;
      return cn >= 2 && /^[\u4e00-\u9fa5A-Za-z]{2,8}[：:]/.test(s);
    });

  // 通知正文经常一整段只用一个句号，按逗号做二次切分，否则只能抽出 1 条要点
  const out = [];
  base.forEach((s) => {
    if (s.length <= 60) { out.push(s); return; }
    const parts = s.split(/(?<=[，,；;])/).map((x) => x.trim()).filter(Boolean);
    let buf = '';
    parts.forEach((p) => {
      if (buf && (buf + p).length > 55) { out.push(buf); buf = p; }
      else buf += p;
    });
    if (buf) out.push(buf);
  });
  return out;
}

function isNoisePoint(out) {
  if (/^附件\s*[\d一二三四五六七八九十]/.test(out) && out.length < 30) return true;
  if (/^关于.{2,40}(的通知|的公告|的公示|的函|的说明)[。.]?$/.test(out)) return true;
  if (/(供稿|责编|编辑|审核|摄影|排版|校对)/.test(out) && out.length < 24) return true;
  if (/^[〇零一二三四五六七八九十]{2,4}年.{0,4}月.{0,4}日$/.test(out)) return true;
  // 正文里的小标题，单独抽出来没有任何信息量
  if (out.length <= 12 && /(要求|安排|说明|如下|内容|标准|办法|规定|程序|流程|条件|范围|对象|时间|地点|方式)[。.]?$/.test(out)) return true;
  return false;
}

function tidyPoint(s) {
  let out = s.replace(/^[\s　]*(?:[（(][一二三四五六七八九十\d]+[）)]|\d+[.、．]|[一二三四五六七八九十]+[、.])\s*/, '');
  out = out.replace(/\s+/g, ' ').trim().replace(/[，,、；;]+$/, '');
  if (out.length > 50) {
    const cut = out.slice(0, 48);
    const pos = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf('、'), cut.lastIndexOf('；'), cut.lastIndexOf('：'), cut.lastIndexOf('。'));
    out = (pos >= 20 ? cut.slice(0, pos) : cut) + '…';
  }
  return out;
}

/**
 * 按六个维度抽要点：先保证每个维度都有覆盖，再按原文顺序排列，背景句沉到最后
 */
function pickKeyPoints(rawText, limit) {
  const max = limit || 10;
  const sentences = splitSentences(rawText);
  const cands = [];
  const seenSig = new Set();

  sentences.forEach((raw, idx) => {
    const out = tidyPoint(raw);
    if (!out) return;
    if (isNoisePoint(out)) return;

    // 打分：命中维度的句子优先
    let bestTag = '';
    let bestW = 0;
    for (const [tag, re] of POINT_RULES) {
      const hits = (out.match(re) || []).length;
      if (!hits) continue;
      const w = hits * 10 + (POINT_QUOTA[tag] ? 2 : 0);
      if (w > bestW) { bestW = w; bestTag = tag; }
    }
    if (!bestTag) return;

    // 背景交代句（政策依据、目的说明）不是「要做什么」
    let w = bestW;
    let isBg = false;
    if (/^(根据|依据|按照|为了|为[\u4e00-\u9fa5]{1,3}|响应|结合|旨在|进一步|认真|切实|本次|经|现将)/.test(out)) {
      w -= 4;
      isBg = true;
    }
    if (/(详见附件|见附件|见附表)/.test(out) && out.length < 24) w -= 3;

    const sig = out.slice(0, 10);
    if (seenSig.has(sig)) return;
    seenSig.add(sig);

    cands.push({ idx, tag: bestTag, w, text: out, bg: isBg });
  });

  if (!cands.length) {
    // 一条都没抽到，退化成「取最长的几句」
    return sentences.slice(0, 3).map(tidyPoint);
  }

  const chosen = [];
  const used = new Set();
  const quota = { ...POINT_QUOTA };

  // 第一轮：按配额保证每个维度都有覆盖
  const ranked = [...cands].sort((a, b) => b.w - a.w || a.idx - b.idx);
  for (const c of ranked) {
    if (chosen.length >= max) break;
    if (quota[c.tag] <= 0) continue;
    if (chosen.some((x) => x.text === c.text)) continue;
    quota[c.tag] -= 1;
    chosen.push(c);
    used.add(c.idx);
  }

  // 第二轮：配额有剩，就从正文里所有还没选中的句子补，不再只看命中维度的
  if (chosen.length < max) {
    sentences.forEach((raw, idx) => {
      if (chosen.length >= max) return;
      if (used.has(idx)) return;
      const out = tidyPoint(raw);
      if (!out) return;
      if (isNoisePoint(out)) return;
      const cn = (out.match(/[\u4e00-\u9fa5]/g) || []).length;
      if (out.length < 14 || cn < 8) return;
      const bg = /^(根据|依据|按照|为了|为[\u4e00-\u9fa5]{1,3}|响应|结合|旨在|进一步|认真|切实|本次|经|现将)/.test(out);
      chosen.push({ idx, tag: '', w: 0, text: out, bg });
      used.add(idx);
    });
  }

  // 回到原文顺序，但背景句沉到最后
  chosen.sort((a, b) => (a.bg === b.bg ? a.idx - b.idx : a.bg ? 1 : -1));
  return chosen.map((c) => c.text);
}

/* ==================== 评分 ==================== */

function pickScore(title, body, times) {
  const t = String(title || '');
  const b = String(body || '');
  const today = new Date();
  let score = 2;

  // 有明确时间点且在未来 7 天内 → 最高优先级
  const list = extractTimes(b);
  for (const it of list) {
    const d = latestDate(it.text, today);
    if (!d) continue;
    const gap = (d - today) / 86400000;
    if (gap >= 0 && gap <= 7) { score = Math.max(score, 5); break; }
    if (gap >= 0 && gap <= 21) score = Math.max(score, 4);
  }

  if (/截止|报名|申请|提交|报送|选课|退课|补选|缴费|注册|确认/.test(t + b)) score = Math.max(score, 3);
  if (/竞赛|大赛|比赛|招聘|实习|推免|保研|交换|奖学金|助学金/.test(t)) score = Math.max(score, 4);
  if (/安全|危化|消防|演练|停水|停电|预警|事故/.test(t + b)) score = Math.max(score, 4);
  if (/讲座|沙龙|报告会|分享会/.test(t)) score = Math.min(score + 1, 4);

  return Math.min(Math.max(score, 1), 5);
}

/* ==================== 摘要 ==================== */

function pickSummary(title, body) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  const first = splitSentences(text).find((s) => !/^(关于|根据|为了)/.test(s) && s.length >= 12);
  if (first) return tidyPoint(first).slice(0, 120);
  return text.slice(0, 100) || String(title || '');
}

/* ==================== 主入口 ==================== */

/**
 * 判断一条通知，保留则返回结构化结果，不保留返回 null
 * @param {{title:string, url:string, content:string, published_at?:string}} notice
 */
function screenOne(notice, opts) {
  // opts.force = true 时跳过所有「丢弃」判断，让用户自己决定留不留（规则判死之后的兜底入口）
  const force = !!(opts && opts.force);
  const title = String(notice.title || '').trim();
  // 只压空格，保留换行——通知正文常是「字段：值」逐行结构，换行是切要点的重要依据
  const body = String(notice.content || '').replace(/[^\S\n]+/g, ' ').trim();
  if (!title && !body) return null;

  if (!force) {
    // 忽略类：标题命中最严格，正文只对明确的宣传稿表达式生效
    for (const re of SKIP_TITLE) {
      if (re.test(title)) return null;
    }
    if (SKIP_BODY.some((re) => re.test(body.slice(0, 300)))) return null;

    // 教职工事务
    for (const re of STAFF_RULES) {
      if (re.test(title) || re.test(body.slice(0, 30))) return null;
    }
    // 已过期
    if (isExpired(body, new Date())) return null;
  }

  const category = pickCategory(title, body);
  const eventTime = formatTimes(body);
  const keyPoints = pickKeyPoints(body, 10);
  const score = pickScore(title, body, eventTime);
  const summary = pickSummary(title, body);

  // 什么都不像学生要办的事，丢掉（用户明确要求保留时除外）
  if (!force && !keyPoints.length && score <= 2) return null;

  return {
    title,
    url: notice.url || '',
    published_at: notice.published_at || '',
    category,
    score,
    event_time: eventTime,
    key_points: keyPoints,
    summary,
  };
}

module.exports = {
  CATEGORIES,
  screenOne,
  pickCategory,
  extractTimes,
  formatTimes,
  pickKeyPoints,
  pickScore,
  isExpired,
  latestDate,
};
