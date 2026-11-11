/**
 * AI 提炼（智谱 GLM-4-Flash）
 *
 * 只负责「要不要留 + 分类 + 星级 + 要点 + 摘要」这几件需要语义理解的事。
 * 时间字段刻意不由 AI 输出：它的格式不稳定，会破坏已经定稿的
 * 「报名 xx — xx；初赛 xx；决赛 xx」并列格式，因此时间仍由规则抽取。
 *
 * 任何失败（没密钥、超时、限流、返回格式不对）都返回 ok=false，
 * 由调用方退回规则判定，不会让这条通知凭空消失。
 */

// 分类枚举不在这里另写一份，直接取自判定引擎，避免两处定义漂移
const { CATEGORIES } = require('./screener');

const ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const DEFAULT_MODEL = 'glm-4-flash';
const MAX_CHARS = 3000;
const RETRY = 2;
const TIMEOUT_MS = 25000;

function buildPrompt(title, content) {
  return [
    '你是浙江工商大学食品与生物工程学院的校园通知筛选助手，服务对象是本科学生。',
    '',
    '判断总原则：是否需要学生采取行动、是否影响学业进度或资格身份或安全、是否有明确的时间节点。',
    '三条任一为「是」就保留，全部为「否」就判为不相关。',
    '',
    '必须忽略的内容：社团招新、日常活动宣传、节日问候、纯获奖喜报、活动总结、新闻稿、报道稿、',
    '已过期通知、与学业无关的商业广告、校外培训推销、发给教职工的通知。',
    '',
    'category 只能从下列词中选一个，不得自造：',
    CATEGORIES.join('、') + '。',
    '',
    'score 取 1 到 5 的整数：5=必须立刻行动或截止在七天内或影响资格安全；4=直接影响学业进度或机会；',
    '3=值得知道；2=信息价值低；1=几乎无行动价值。',
    '',
    'key_points 给 1 到 6 条，每条是读者能直接照着做的一句话，写成「字段：值」的形式更好，',
    '例如「报名方式：填写附件一报名表发至邮箱」「地点：B331」。不要写空话。',
    '',
    'summary 写一句话，必须说明要做什么或为什么重要，不超过 40 字。',
    '',
    'time_hint 填原文里出现的时间片段原样，最多 60 字；没有就给空字符串。不要自己推断年份以外的东西。',
    '',
    'custom_tags 给 2 到 3 个短标签，帮读者一眼扫出主题，不要带井号，每个不超过 6 个字，',
    '用大家熟悉的口语简称，例如「四六级」「缓考」「大创」「三方协议」「实验室准入」「推免」。',
    'is_relevant 为 false 时这一项给空数组。',
    '',
    '只输出 JSON，不要任何解释文字，不要 markdown 代码块。格式：',
    '{"is_relevant": true 或 false, "category": "上面某个类别", "custom_tags": ["标签1","标签2"], "score": 1到5, "summary": "一句话", "key_points": ["要点1","要点2"], "time_hint": "时间片段或空字符串"}',
    '',
    '标题：' + title,
    '正文：' + String(content || '').slice(0, MAX_CHARS),
  ].join('\n');
}

/** 从可能夹带解释的文字里抠出 JSON 对象 */
function extractJson(text) {
  if (!text) return null;
  const raw = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(raw);
  } catch (e) { /* 继续尝试抠花括号 */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch (e) {
    return null;
  }
}

/** 模型输出不一定守规矩，这里做一次校验与归一 */
function normalize(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.is_relevant !== 'boolean') return null;

  const score = Number(data.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) return null;

  const summary = String(data.summary || '').trim();
  if (!summary) return null;

  const points = Array.isArray(data.key_points)
    ? data.key_points.map((p) => String(p).trim()).filter((p) => p && p.length > 1).slice(0, 6)
    : [];

  // 判为相关却没有要点，等价于没说清要做什么，视为不合格退回规则
  if (data.is_relevant && points.length === 0) return null;

  let category = String(data.category || '').trim();
  if (data.is_relevant && CATEGORIES.indexOf(category) < 0) {
    // 类别写错但内容相关：不整条作废，按「其他重要」收下，避免误丢
    category = '其他重要';
  }

  // 自由标签：模型可能带井号或过长，统一去掉井号、限长、最多三个
  let tags = [];
  if (Array.isArray(data.custom_tags)) {
    tags = data.custom_tags
      .map((t) => String(t).trim().replace(/^#+/, '').trim())
      .filter((t) => t && t.length <= 8)
      .slice(0, 3);
  }

  return {
    is_relevant: data.is_relevant,
    category: data.is_relevant ? category : '',
    tags: data.is_relevant ? tags : [],
    score,
    summary,
    key_points: points,
    time_hint: String(data.time_hint || '').trim().slice(0, 60),
  };
}

async function callOnce(key, model, prompt) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + (body ? '：' + body.slice(0, 120) : ''));
    }
    const json = await res.json();
    const text = json && json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content
      : '';
    return extractJson(text);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 调用 AI。返回 { ok, data, reason }
 * ok=false 时调用方应退回规则判定。
 */
async function askAI({ title, content }, options) {
  const opts = options || {};
  const key = process.env.ZHIPU_KEY || opts.key || '';
  if (!key) return { ok: false, reason: '没有配置 ZHIPU_KEY' };
  if (!title && !content) return { ok: false, reason: '标题与正文都为空' };

  const model = opts.model || DEFAULT_MODEL;
  const prompt = buildPrompt(title, content);
  let lastErr = '';

  for (let attempt = 0; attempt <= RETRY; attempt += 1) {
    try {
      const data = normalize(await callOnce(key, model, prompt));
      if (!data) {
        lastErr = '返回内容不是合格的 JSON';
        continue;
      }
      return { ok: true, data, model, attempts: attempt + 1 };
    } catch (e) {
      lastErr = e.message;
      // 401/403 是密钥问题，重试没有意义
      if (/HTTP 40[13]/.test(e.message)) break;
      if (attempt < RETRY) await new Promise((r) => setTimeout(r, 3000));
    }
  }

  return { ok: false, reason: lastErr };
}

module.exports = { askAI, buildPrompt, normalize, extractJson };
