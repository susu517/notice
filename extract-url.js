/**
 * 识别网址：给一个通知文章链接，抓正文 → 用同一套口径提炼 → 结果写到 docs/extract.json
 *
 * 用法：node extract-url.js "https://spxy.zjgsu.edu.cn/?news/7134.html"
 *
 * 由网页「识别网址」按钮触发 GitHub Actions 运行本脚本。
 * 结果写到 docs/ 目录，因为 GitHub Pages 只发布 docs，页面才能读回来。
 */

const fs = require('fs');
const path = require('path');

const crawler = require('./crawler');
const screener = require('./screener');
const ai = require('./ai');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'docs');
const OUT_FILE = path.join(OUT_DIR, 'extract.json');

async function main() {
  const url = String(process.argv[2] || '').trim();
  const startedAt = Date.now();
  const result = { url, at: new Date().toISOString(), ok: false, item: null, error: '' };

  if (!url || !/^https?:\/\//i.test(url)) {
    result.error = '链接格式不对，必须是以 http:// 或 https:// 开头';
  } else {
    try {
      const html = await crawler.fetchHtml(url);
      const detail = crawler.parseDetail(html, url);
      const title = detail.title || '';
      const content = detail.content || '';
      const published = detail.published_at || '';

      // 与定时任务同一条链：AI 先读语义，AI 不可用再退回规则
      let aiOut = null;
      let aiFail = '';
      const cfgPath = path.join(ROOT, 'config.json');
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (e) {}
      if (cfg.ai && cfg.ai.enabled && content) {
        const r = await ai.askAI({ title, content }, { model: cfg.ai.model });
        if (r.ok) aiOut = r.data;
        else aiFail = r.reason;
      } else if (cfg.ai && cfg.ai.enabled) {
        aiFail = '正文没抓到';
      }

      const picked = (aiOut && aiOut.is_relevant)
        ? {
          title,
          url,
          published_at: published,
          category: aiOut.category,
          tags: aiOut.tags || [],
          score: aiOut.score,
          event_time: screener.formatTimes(content) || aiOut.time_hint || '',
          key_points: aiOut.key_points,
          summary: aiOut.summary,
          engine: 'ai',
        }
        : screener.screenOne({ title, url, content, published_at: published });

      if (picked) {
        result.ok = true;
        result.item = Object.assign({}, picked, {
          content: String(detail.content || '').slice(0, 1600),
          source: 'url',
          site: '识别网址',
          engine: picked.engine || 'rule',
        });
      } else {
        result.ok = false;
        result.error = aiOut
          ? 'AI 读完后判定这条不需要处理：' + (aiOut.summary || '')
          : '这条按现有口径判定为不需要处理（社团招新、活动宣传、喜报、报道稿或已过期）';
        if (aiFail) result.error += '（AI 未能生效：' + aiFail + '，已退回规则）';
        // 即使不保留，也把抓到的东西带回去，方便判断是不是抓错了
        result.preview = {
          title: detail.title || '',
          chars: String(detail.content || '').length,
          head: String(detail.content || '').slice(0, 300),
        };
      }
    } catch (e) {
      result.error = e.message;
    }
  }

  result.elapsed = Date.now() - startedAt;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), 'utf8');

  if (result.ok) {
    console.log('识别成功（' + (result.item.engine === 'ai' ? 'AI' : '规则') + '）：'
      + result.item.category + ' / 星' + result.item.score + ' / ' + result.item.title);
  } else {
    console.log('未保留：' + result.error);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('运行失败：', e.message);
    try {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(OUT_FILE, JSON.stringify({
        url: process.argv[2] || '', at: new Date().toISOString(), ok: false, item: null, error: e.message,
      }, null, 2), 'utf8');
    } catch {}
    process.exit(1);
  });
}

module.exports = { main };
