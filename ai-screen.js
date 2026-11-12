// AI 提炼队列处理器：读 Supabase 里的待处理任务 → 调智谱 → 写回结果
// 由 .github/workflows/ai-screen.yml 每 5 分钟触发一次

const SB_URL = process.env.SB_URL;
const SB_KEY = process.env.SB_KEY;
const ZP_KEY = process.env.ZHIPU_KEY;

const CATS = [
  '竞赛', '教务考试', '选课学籍', '评奖资助', '缴费注册', '实习就业', '保研考研',
  '交流交换', '科研创新', '论文答辩', '实验安全', '讲座报告', '党团实践', '安全后勤',
  '健康医保', '证件考试', '毕业离校', '其他重要',
];

const SYS = [
  '你是浙江工商大学食品与生物工程学院的校园通知筛选助手，服务对象是本科新生。',
  '只输出一个 JSON 对象，不要解释、不要用代码块包裹。字段：',
  'title：通知标题，25 字以内，说清楚是什么事；原文标题残缺时按正文概括。',
  'category：必须从这些里选一个：' + CATS.join('、') + '。',
  'score：1-5 整数。5=必须马上办且有截止日期；4=该办但不紧急；3=值得看一眼；2=可看可不看；1=基本不用管。',
  'event_time：通知里真实出现的时间或截止日，如「11月20日 截止」；没有就留空，不许编。',
  'key_points：字符串数组，最多 50 条，每条不超过 50 字。只写通知里真实存在的信息，按「对象/时间/地点/要交什么/怎么交/注意事项」排，宁少勿编。',
  '原文没写的内容一律不要写：不要输出「地点：无」「时间：不详」「对象：全体学生」这类占位或推测条目，也不要补原文没有的对象、地点、要求。',
  'reason：一句话说明为什么给这个星级，20 字以内。',
  '正文里的 OCR 错字（如「革门专业课」→「除门专业课」、「币电脑」→「电子版」）按上下文纠正后再写进要点，但不得因此编造原文没有的内容。',
].join('\n');

const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

async function sbGet(path) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, { headers: H });
  if (!r.ok) throw new Error('查询失败 ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

async function sbPatch(kind, key, payload) {
  const url =
    SB_URL + '/rest/v1/nc_items?kind=eq.' + encodeURIComponent(kind) + '&key=eq.' + encodeURIComponent(key);
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ payload }),
  });
  if (!r.ok) throw new Error('写回失败 ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

function clampPoints(list) {
  return (Array.isArray(list) ? list : [])
    .map((p) => String(p || '').trim())
    .filter((p) => p.length > 0)
    .slice(0, 50)
    .map((p) => (p.length > 50 ? p.slice(0, 48) + '…' : p));
}

async function aiOne(title, body) {
  const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ZP_KEY },
    body: JSON.stringify({
      model: 'glm-4-flash',
      temperature: 0.2,
      max_tokens: 3000,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: '标题：' + (title || '（无）') + '\n\n正文：\n' + String(body || '').slice(0, 8000) },
      ],
    }),
  });
  if (!resp.ok) throw new Error('智谱 ' + resp.status + ' ' + (await resp.text()).slice(0, 200));
  const data = await resp.json();
  let text = String(data?.choices?.[0]?.message?.content || '').trim();
  text = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('模型没返回 JSON：' + text.slice(0, 120));
  const out = JSON.parse(text.slice(s, e + 1));
  return {
    title: String(out.title || '').slice(0, 60),
    category: CATS.indexOf(out.category) >= 0 ? out.category : '其他重要',
    score: Math.max(1, Math.min(5, parseInt(out.score, 10) || 3)),
    event_time: String(out.event_time || '').slice(0, 40),
    key_points: clampPoints(out.key_points),
    reason: String(out.reason || '').slice(0, 40),
  };
}

(async () => {
  if (!SB_URL || !SB_KEY) throw new Error('缺少 SB_URL / SB_KEY');
  if (!ZP_KEY) throw new Error('缺少 ZHIPU_KEY');

  // PostgREST 的 JSON 路径过滤：payload->>status = pending
  const rows = await sbGet('nc_items?kind=eq.aiq&payload->>status=eq.pending&limit=5&order=created_at.asc');
  console.log('待处理任务：' + rows.length + ' 条');
  if (!rows.length) return;

  for (const row of rows) {
    const payload = row.payload || {};
    try {
      const r = await aiOne(payload.title || '', payload.body || '');
      await sbPatch('aiq', row.key, { ...payload, status: 'done', result: r, engine: 'ai', done_at: new Date().toISOString() });
      console.log('完成 ' + row.key + ' → ' + r.category + ' / ' + r.score + ' 星 / ' + r.key_points.length + ' 条要点');
    } catch (err) {
      const msg = String((err && err.message) || err).slice(0, 200);
      await sbPatch('aiq', row.key, { ...payload, status: 'error', error: msg, engine: 'ai' });
      console.log('失败 ' + row.key + '：' + msg);
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
