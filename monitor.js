/**
 * 主流程：检查常用官网栏目 → 发现新通知 → 提炼 → 存留档 → 生成网页 → 邮件推送
 *
 * 首次运行只登记基线（把现有通知的链接记下来），不推送历史通知；
 * 从第二次开始，只有新出现的链接才会被抓取、提炼、推送。
 */

const fs = require('fs');
const path = require('path');

const crawler = require('./crawler');
const screener = require('./screener');
const render = require('./render');
const ai = require('./ai');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const NOTICE_FILE = path.join(DATA_DIR, 'notices.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const RETRY_FILE = path.join(DATA_DIR, 'retry_queue.json');
const RETRY_MAX = 30;          // 队列上限，超过就丢最旧的，防止无限膨胀
const RETRY_EXPIRE_MS = 24 * 3600 * 1000; // 超过一天还重试不成的，放弃
const DOCS_DIR = path.join(ROOT, 'docs');

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

const notices = readJson(NOTICE_FILE, []);
let retryQueue = readJson(RETRY_FILE, []);
const state = readJson(STATE_FILE, {});

// 手工建仓库时 state.json 常被填成 {}。缺字段会让按栏目记录直接抛错，
// 这里一律补齐；旧版把 seen 写成全局数组的，按「从没登记过」处理，重新建基线。
if (!state.seen || typeof state.seen !== 'object' || Array.isArray(state.seen)) state.seen = {};
if (!state.site_checked || typeof state.site_checked !== 'object' || Array.isArray(state.site_checked)) state.site_checked = {};
if (typeof state.seeded !== 'boolean') state.seeded = false;
if (typeof state.last_alert !== 'string') state.last_alert = '';

/**
 * 检查一个栏目，返回新条目
 */
async function checkSite(site) {
  const html = await crawler.fetchHtml(site.url);
  const list = crawler.parseList(html, site.url);
  const seen = new Set(state.seen[site.url] || []);
  const fresh = list.filter((it) => !seen.has(it.url));
  // 这个栏目此前从未检查过：本次只登记，不当作「新通知」处理
  const isNewSite = !Array.isArray(state.seen[site.url]);

  state.site_checked[site.url] = new Date().toISOString();
  // 这里只记「检查时间」，不把所有链接记为已读。
  // 每轮处理条数有上限，若把本轮没轮到的也标记已读，那些通知下一轮就不再算新，会永久跳过。
  // 只有真正处理过的才标记（见 markSeen）。

  return { list, fresh, isNewSite };
}

function markSeen(site, urls) {
  if (!urls.length) return;
  state.seen[site.url] = Array.from(new Set([...(state.seen[site.url] || []), ...urls]));
}

/**
 * 抓正文 + 判定 + 提炼
 */
async function processOne(item) {
  let detail;
  let grabbed = true;
  try {
    const html = await crawler.fetchHtml(item.url);
    detail = crawler.parseDetail(html, item.url);
  } catch (e) {
    // 有些通知正文极短（内容全在附件里），抓不到正文不代表这条不重要：
    // 退化成「只用标题和列表页日期判定」，留档里给出原文链接让人自己去看
    detail = { title: item.title, content: '', published_at: item.date || '', short: true };
    grabbed = false;
  }
  // 发布日期优先用列表页的日期（正文里的日期可能是活动日期，不是发布时间）
  const published = item.date || detail.published_at || '';
  const title = detail.title || item.title;
  const content = detail.content || '';

  const aiOn = !!(config.ai && config.ai.enabled);
  let aiOut = null;
  let aiFail = '';

  // 第一道：AI 读语义。正文为空时不用试，模型只能看到标题，结论不可信
  if (aiOn && content) {
    const r = await ai.askAI({ title, content }, { model: config.ai.model });
    if (r.ok) aiOut = r.data;
    else aiFail = r.reason;
  } else if (aiOn) {
    aiFail = '正文没抓到';
  }

  // AI 判为不相关：直接跳过，不再走规则（模型看懂语义后的否定比正则更可靠）
  if (aiOut && !aiOut.is_relevant) {
    return { detail, published, result: null, engine: 'ai', skipped: 'ai', reason: aiOut.summary };
  }

  // 第二道：AI 有结论就用它，时间仍由规则算（AI 给的格式不稳定，会破坏并列口径）
  if (aiOut && aiOut.is_relevant) {
    const times = screener.formatTimes(content);
    return {
      detail,
      published,
      engine: 'ai',
      result: {
        title,
        url: item.url,
        published_at: published,
        category: aiOut.category,
        tags: aiOut.tags || [],
        score: aiOut.score,
        event_time: times || aiOut.time_hint || '',
        key_points: aiOut.key_points,
        summary: aiOut.summary,
      },
    };
  }

  // 第三道：规则兜底
  const result = screener.screenOne({
    title,
    url: item.url,
    content,
    published_at: published,
  });

  // 正文没抓到、AI 也失败、规则又判不出东西：这一条不能当已处理，进重试队列
  if (!result && !grabbed) {
    return { detail, published, result: null, engine: 'none', retry: true, reason: aiFail || '正文抓取失败' };
  }

  return { detail, published, result, engine: 'rule', aiFail };
}

/**
 * 并发执行，限制同时进行的数量
 */
async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch (e) {
        out[idx] = { error: e.message };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  const report = {
    sites: [], added: [], scanned: 0, errors: [],
    aiUsed: 0, ruleUsed: 0, aiRejected: 0, retried: 0, aiFails: [], deferred: 0,
  };
  const maxNew = config.max_new_per_site || 6;

  for (const site of config.sites) {
    if (!site.enabled) continue;
    const stat = { name: site.name, url: site.url, listed: 0, fresh: 0, kept: 0, first: !state.seeded };

    try {
      const { list, fresh, isNewSite } = await checkSite(site);
      stat.listed = list.length;
      stat.fresh = fresh.length;
      report.scanned += list.length;

      if (!state.seeded || isNewSite) {
        // 首次运行，或这个栏目第一次被检查：只登记基线，不抓正文、不入库、不推送
        markSeen(site, list.map((i) => i.url));
        stat.first = true;
        report.sites.push(stat);
        continue;
      }

      // 只取最新的若干条，避免一次抓太多把任务拖超时。
      // 没轮到的保持未读，下一轮接着处理，不会丢。
      const sorted = fresh.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const target = sorted.slice(0, maxNew);
      const deferred = sorted.length - target.length;
      if (deferred > 0) {
        stat.deferred = deferred;
        report.deferred += deferred;
      }

      // 上一轮没处理成的先补，再处理本轮新发现的
      const carry = retryQueue.filter((r) => r.site === site.name);
      const batch = carry.concat(target);

      const outcomes = await mapLimit(batch, 3, processOne);
      const doneUrls = [];
      outcomes.forEach((o, idx) => {
        const src = batch[idx];
        if (!o || o.error) {
          report.errors.push(`${site.name}：${String(src.title).slice(0, 20)} → ${o ? o.error : '未知错误'}`);
          return;
        }
        doneUrls.push(src.url);

        // 该重试的：留在队列里，下一轮再来，同时不把它当成已处理
        if (o.retry) {
          const keep = retryQueue.find((r) => r.url === src.url);
          if (!keep) {
            retryQueue.push({
              url: src.url,
              title: src.title,
              date: src.date || '',
              site: site.name,
              tries: (src.tries || 0) + 1,
              first_at: src.first_at || new Date().toISOString(),
              last_reason: o.reason || '',
            });
          } else {
            keep.tries = (keep.tries || 0) + 1;
            keep.last_reason = o.reason || '';
          }
          report.retried += 1;
          return;
        }

        // 判定完成（保留或跳过），从队列里摘掉
        retryQueue = retryQueue.filter((r) => r.url !== src.url);

        if (!o.result) {
          if (o.skipped === 'ai') {
            report.aiRejected += 1;
            console.log(`  AI 判为不保留：${String(src.title).slice(0, 28)}（${o.reason || ''}）`);
          }
          return;
        }

        const notice = {
          ...o.result,
          published_at: o.published,
          site: site.name,
          engine: o.engine,
          found_at: new Date().toISOString(),
          // 正文快照：官网链接以后失效或改版，内容仍在自己的留档里
          content: String(o.detail.content || '').slice(0, 1600),
        };
        // 同链接、同标题都去重
        if (notices.some((n) => n.url === notice.url || n.title === notice.title)) return;
        notices.push(notice);
        report.added.push(notice);
        stat.kept += 1;
        if (o.engine === 'ai') report.aiUsed += 1;
        else report.ruleUsed += 1;
        if (o.aiFail) report.aiFails.push(`${String(src.title).slice(0, 20)}：${o.aiFail}`);
      });
      markSeen(site, doneUrls);
    } catch (e) {
      stat.failed = true;
      stat.reason = e.message;
      report.errors.push(`${site.name}：${e.message}`);
    }
    report.sites.push(stat);
  }

  // 留档排序：发布时间从新到旧，没有日期的沉底
  notices.sort((a, b) => {
    const da = a.published_at || '0';
    const db = b.published_at || '0';
    return db.localeCompare(da);
  });
  writeJson(NOTICE_FILE, notices);

  // 只有至少一个栏目真抓到列表，才认为基线建成。
  // 首轮全部抓取失败（网络抖动、被墙、栏目改版）时保持 seeded=false，
  // 下一轮重新登记；否则第二轮会把整个历史列表当成新通知一次性推给用户。
  const sitesOk = report.sites.filter((x) => !x.failed && x.listed > 0).length;
  if (!state.seeded) {
    if (sitesOk > 0) state.seeded = true;
    else report.errors.push('本轮所有栏目都没抓到内容，基线未建立，下一轮重新登记');
  }
  writeJson(STATE_FILE, state);

  // 重试队列：超过一天的重试仍失败就放弃并记日志，避免永远卡着
  const nowMs = Date.now();
  const dropped = retryQueue.filter((r) => nowMs - new Date(r.first_at || 0).getTime() > RETRY_EXPIRE_MS);
  retryQueue = retryQueue.filter((r) => nowMs - new Date(r.first_at || 0).getTime() <= RETRY_EXPIRE_MS);
  if (retryQueue.length > RETRY_MAX) retryQueue = retryQueue.slice(-RETRY_MAX);
  if (dropped.length) {
    dropped.forEach((r) => report.errors.push(`重试超时放弃：${String(r.title).slice(0, 20)}（${r.last_reason || ''}）`));
  }
  writeJson(RETRY_FILE, retryQueue);

  // 生成网页
  try {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
    fs.writeFileSync(path.join(DOCS_DIR, 'index.html'), render.page(notices, config), 'utf8');
    fs.writeFileSync(path.join(DOCS_DIR, '.nojekyll'), '', 'utf8');
  } catch (e) {
    report.errors.push(`生成网页失败：${e.message}`);
  }

  // 邮件推送：只有真正新增且保留下来的才推
  if (report.added.length && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      await sendMail(report.added);
      console.log(`邮件已发送：${report.added.length} 条`);
    } catch (e) {
      report.errors.push(`邮件发送失败：${e.message}`);
    }
  }

  // ---------- 运行异常告警 ----------
  // 原则：只在「用户需要动手」时发，同类问题一天最多发一次，避免变成骚扰
  const alerts = [];
  const dead = report.sites.filter((x) => x.failed);
  const alive = report.sites.length - dead.length;
  if (report.sites.length && alive === 0) {
    alerts.push('所有栏目本轮都抓取失败，一条通知也没拿到。多半是站点打不开或栏目地址改版。');
    dead.forEach((x) => alerts.push(`　${x.name}：${x.reason || '未知原因'}`));
  } else if (dead.length) {
    alerts.push(`以下栏目本轮抓取失败：${dead.map((x) => x.name + '（' + (x.reason || '') + '）').join('；')}`);
  }
  if (retryQueue.length > 10) {
    alerts.push(`重试队列积压 ${retryQueue.length} 条，说明有通知反复处理不成功。`);
    const reasons = [...new Set(retryQueue.map((r) => r.last_reason).filter(Boolean))].slice(0, 3);
    if (reasons.length) alerts.push(`最近的原因：${reasons.join('；')}`);
  }
  const keyErr = report.aiFails.find((r) => /401|403|没有配置|密钥|令牌/i.test(r));
  if (keyErr && report.aiUsed === 0) {
    alerts.push(`AI 密钥问题：${keyErr}　当前所有通知都在用规则判定，功能可用但精度下降。`);
  }

  if (alerts.length) {
    const todayKey = new Date().toLocaleDateString('zh-CN');
    const blocked = state.last_alert === todayKey;
    if (blocked) {
      console.log('今天已发过一次异常告警，本轮不重复发送。');
    } else {
      try {
        const sent = await sendAlert('通知助手自检未通过', alerts);
        state.last_alert = todayKey;
        writeJson(STATE_FILE, state);
        console.log(sent ? '已发送异常告警邮件' : '检测到异常，但没有配置邮箱，只写入日志');
      } catch (e) {
        report.errors.push(`告警邮件发送失败：${e.message}`);
      }
    }
    alerts.forEach((a) => console.log('异常：' + a));
  }

  // 控制台汇总（GitHub Actions 日志里能直接看到）
  if (report.deferred > 0) {
    console.log(`本轮有条数上限，${report.deferred} 条顺延到下一轮（保持未读，不会丢）。`);
  }

  const firstRun = report.sites.every((s) => s.first);
  if (firstRun) {
    console.log('首次运行：只登记基线，不推送历史通知。');
    console.log(`已登记 ${Object.values(state.seen).reduce((n, arr) => n + arr.length, 0)} 个链接。`);
  } else {
    console.log(`新增保留 ${report.added.length} 条`);
  }
  report.sites.forEach((s) => {
    console.log(`  ${s.name}：列出 ${s.listed} 条，新发现 ${s.fresh} 条，保留 ${s.kept} 条`);
  });
  const aiOn = !!(config.ai && config.ai.enabled);
  if (aiOn) {
    console.log(`AI 提炼 ${report.aiUsed} 条，规则兜底 ${report.ruleUsed} 条，AI 判为不保留 ${report.aiRejected} 条`);
    if (report.aiFails.length) {
      console.log('AI 调用异常（已自动退回规则）：');
      report.aiFails.slice(0, 5).forEach((e) => console.log('  - ' + e));
      if (report.aiFails.length > 5) console.log(`  - 其余 ${report.aiFails.length - 5} 条同类，不再列出`);
    }
  } else {
    console.log('未启用 AI，全部按规则判定。');
  }
  if (report.retried) console.log(`本轮有 ${report.retried} 条没处理成，已放入重试队列，下一轮优先重试。`);
  if (retryQueue.length) console.log(`重试队列现有 ${retryQueue.length} 条。`);

  if (report.errors.length) {
    console.log('异常：');
    report.errors.forEach((e) => console.log('  - ' + e));
  }

  return report;
}

function createTransport() {
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/**
 * 运行异常告警：用户不会去看 Actions 日志，出问题必须推到手机上
 */
async function sendAlert(subject, lines) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return false;
  const transporter = createTransport();
  const to = process.env.MAIL_TO || process.env.SMTP_USER;
  const html = `<div style="background:#f6f7f9;padding:16px;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
  <div style="max-width:640px;margin:0 auto">
    <div style="background:#fff;border:1px solid #e6e8eb;border-left:4px solid #b42318;border-radius:10px;padding:14px 16px">
      <div style="font-size:16px;font-weight:600;color:#b42318;margin-bottom:8px">${render.esc(subject)}</div>
      <ul style="margin:0;padding-left:18px;font-size:14px;color:#374151;line-height:1.9">
        ${lines.map((l) => `<li>${render.esc(l)}</li>`).join('')}
      </ul>
      <div style="font-size:12px;color:#6b7280;margin-top:10px">这条是系统自检报告，不是新通知。修好前每轮都会再检查一次。</div>
    </div>
  </div>
</div>`;
  await transporter.sendMail({ from: process.env.SMTP_USER, to, subject: `【运行异常】${subject}`, html });
  return true;
}

async function sendMail(items) {
  const transporter = createTransport();
  const to = process.env.MAIL_TO || process.env.SMTP_USER;
  const html = render.mailHtml(items, config);
  const today = new Date().toLocaleDateString('zh-CN');
  // 有 4 星及以上的，标题前缀换成需要处理，手机通知栏一眼能看出轻重
  const urgent = items.filter((n) => Number(n.score) >= 4).length;
  const prefix = urgent ? `【需要处理 ${urgent} 条】` : '【学院信息】';
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: `${prefix}${today} 新通知 ${items.length} 条`,
    html,
  });
}

if (require.main === module) {
  main().catch((e) => {
    console.error('运行失败：', e.message);
    process.exit(1);
  });
}

module.exports = { main, sendMail, processOne };  // processOne 导出仅用于排查单条判定
