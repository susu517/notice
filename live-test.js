/**
 * 端到端实测：抓一条真通知 → AI 提炼 → 真发一封邮件
 *
 * 用法（不要把密钥写进这个文件）：
 *   ZHIPU_KEY=xxx SMTP_HOST=smtp.qq.com SMTP_PORT=465 \
 *   SMTP_USER=xxx SMTP_PASS=xxx MAIL_TO=xxx node live-test.js
 *
 * 它做四件事：
 *   1. 检查 6 个钥匙是否齐全
 *   2. 抓学院通知公告列表，取真实链接
 *   3. 跑一遍和定时任务完全相同的判定（AI 优先、规则兜底）
 *   4. 把留下来的一条真发到你邮箱，验证发信链
 */
const fs = require('fs');
const crawler = require('./crawler');
const monitor = require('./monitor');

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

const NEED = [
  ['ZHIPU_KEY', '智谱密钥'],
  ['SMTP_HOST', 'smtp.qq.com'],
  ['SMTP_PORT', '465'],
  ['SMTP_USER', '你的 QQ 邮箱'],
  ['SMTP_PASS', '16 位授权码'],
  ['MAIL_TO', '收件邮箱'],
];

function say(s) { console.log(s); }

(async () => {
  say('');
  say('=== 第 1 步：钥匙是否齐全 ===');
  const miss = NEED.filter(([k]) => !process.env[k]);
  if (miss.length) {
    miss.forEach(([k, d]) => say(`  ✗ ${k} 没填（应为：${d}）`));
    say('');
    say('缺上面这些，先补齐再跑。');
    process.exitCode = 1;
    return;
  }
  NEED.forEach(([k, d]) => say(`  ✓ ${k} 已填（${d}）`));

  say('');
  say('=== 第 2 步：抓真实通知列表 ===');
  const site = config.sites.find((s) => s.enabled && /tzgg/.test(s.url))
    || config.sites.find((s) => s.enabled);
  let html;
  try {
    html = await crawler.fetchHtml(site.url);
  } catch (e) {
    say(`  ✗ 打不开 ${site.url}：${e.message}`);
    process.exitCode = 1;
    return;
  }
  const list = crawler.parseList(html, site.url);
  say(`  ${site.name} 列表页解析出 ${list.length} 条`);
  if (!list.length) {
    say('  ✗ 一条都没解析出来。先别测 AI，得先修列表解析。');
    process.exitCode = 1;
    return;
  }

  say('');
  say('=== 第 3 步：跑一遍完整判定（和定时任务同一套）===');
  const picked = list.slice(0, 2);
  const kept = [];
  const engines = [];

  for (const it of picked) {
    say('');
    say(`  处理：${String(it.title).slice(0, 42)}`);
    say(`    链接：${it.url}`);
    let r;
    try {
      r = await monitor.processOne(it);
    } catch (e) {
      say(`    ✗ 出错：${e.message}`);
      continue;
    }
    engines.push(r.engine);
    const flag = r.retry ? '（进重试队列，下轮再来）' : (r.skipped ? '（判定为不相关，跳过）' : '');
    say(`    引擎：${r.engine}${flag}`);
    if (r.aiFail) say(`    AI 这条没成功：${r.aiFail}`);
    if (r.result) {
      say(`    分类：${r.result.category} ｜ 星级：${r.result.score}`);
      say(`    时间：${r.result.event_time || '（没抽到时间）'}`);
      say(`    摘要：${r.result.summary}`);
      (r.result.key_points || []).forEach((p, i) => say(`    要点${i + 1}：${p}`));
      kept.push(Object.assign({}, r.result, {
        site: site.name,
        content: (r.detail && r.detail.content) || '',
      }));
    }
  }

  say('');
  say('=== 第 4 步：真发一封邮件 ===');
  if (!kept.length) {
    say('  这两条都没有留下来，换一批再测（邮件没发）。');
    process.exitCode = 1;
    return;
  }
  try {
    await monitor.sendMail(kept);
    say(`  ✓ 邮件已发出 → ${process.env.MAIL_TO}`);
    say('  去收件箱看：标题是「需要处理 N 条」或「发现 N 条新动态」，正文应有分类、星级、时间、要点、原文链接。');
  } catch (e) {
    say(`  ✗ 发信失败：${e.message}`);
    if (/535|auth|Invalid login/i.test(e.message)) {
      say('  → 授权码不对，或复制时带了空格/漏了字符。回 QQ 邮箱重新生成一次，只复制那 16 位。');
    } else if (/ETIMEDOUT|ECONNECTION|ECONNREFUSED/i.test(e.message)) {
      say('  → 端口不通。SMTP_PORT 从 465 换成 587 再试一次。');
    }
    process.exitCode = 1;
    return;
  }

  say('');
  say('=== 结论 ===');
  const aiHit = engines.includes('ai');
  say(`  AI 通道：${aiHit ? '通了（引擎显示 ai）' : '没走通（这次全部走规则）'}`);
  say(`  邮件通道：通了`);
  say(`  实际入库候选：${kept.length} 条 / 处理 ${picked.length} 条`);
  if (!aiHit) {
    say('  如果 ZHIPU_KEY 明明填了却还走规则，多半是密钥无效或模型名不对，去 bigmodel.cn 控制台核对。');
  }
})();
