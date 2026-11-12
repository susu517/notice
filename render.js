/**
 * 页面生成：把留档数据渲染成一个静态网页（GitHub Pages 直接托管）+ 邮件 HTML
 *
 * 网页结构对齐原 D 盘版本，五个页签：
 *   添加提取 / 学院筛选 / 留档库 / 回收站 / 推送与设置
 */

const fs = require('fs');
const path = require('path');

/**
 * 把 screener.js（零依赖、CommonJS）转成浏览器能直接跑的版本，
 * 这样网页上的「手动输入并提炼」和定时抓取用的是同一套判定规则，不会两套标准。
 */
function browserScreener() {
  const src = fs.readFileSync(path.join(__dirname, 'screener.js'), 'utf8');
  const idx = src.indexOf('module.exports');
  if (idx < 0) throw new Error('screener.js 里找不到 module.exports');
  const body = src.slice(0, idx);
  const tail = src.slice(idx).replace('module.exports', 'window.SCREENER');
  return (body + '\n' + tail).replace(/<\/script>/gi, '<\\/script>');
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stars(n) {
  const v = Math.max(1, Math.min(5, Number(n) || 1));
  return '★'.repeat(v) + '☆'.repeat(5 - v);
}

const SITE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#f0f3f8;color:#1a2332;line-height:1.65;-webkit-text-size-adjust:100%}
.wrap{max-width:860px;margin:0 auto;padding:0 16px 82px}
header{margin:0 -16px;padding:26px 20px 22px;background:linear-gradient(135deg,#0a1628 0%,#122a52 55%,#1b356b 100%);border-radius:0 0 20px 20px;box-shadow:0 6px 20px rgba(10,22,40,.18);position:relative;overflow:hidden}
header:after{content:"";position:absolute;right:-60px;top:-60px;width:180px;height:180px;background:radial-gradient(circle,rgba(120,170,255,.16),transparent 70%);border-radius:50%}
h1{font-size:22px;letter-spacing:.4px;margin-bottom:7px;color:#fff;font-weight:700}
.meta{color:#a8c0e8;font-size:12.5px}
.tabs{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;background:rgba(255,255,255,.97);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-top:1px solid #e3e9f2;box-shadow:0 -3px 16px rgba(10,22,40,.07);padding:6px 0 calc(6px + env(safe-area-inset-bottom))}
.tab{flex:1 1 0;min-width:0;position:relative;padding:8px 1px 7px;background:none;border:0;font-size:12px;font-weight:600;color:#7d8899;text-align:center;white-space:nowrap;cursor:pointer;transition:color .16s ease;font-family:inherit}
.tab.on{color:#12295c;background:none;box-shadow:none}
.tab.on:before{content:"";position:absolute;top:0;left:50%;transform:translateX(-50%);width:22px;height:2.5px;border-radius:2px;background:linear-gradient(90deg,#0a1628,#1b356b)}
.badge{display:inline-block;min-width:15px;padding:0 4px;margin-left:2px;background:#e8effc;color:#12295c;border-radius:8px;font-size:10px;line-height:15px;text-align:center;vertical-align:1px}
.tab.on .badge{background:#12295c;color:#fff}
.morelist{display:flex;flex-direction:column;gap:10px}
.mrow{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;background:#fff;border:0;border-radius:12px;box-shadow:0 2px 10px rgba(10,22,40,.07);padding:14px 16px;cursor:pointer;font-family:inherit}
.mrow:active{background:#f6f9fe}
.mt{font-size:14.5px;font-weight:700;color:#0f2a63}
.md{font-size:12px;color:#8a95a8}
.backbar{margin-bottom:10px}
.back{background:#fff;border:1px solid #d5ddea;color:#45536b;font-size:13px;font-weight:600;padding:7px 14px;border-radius:9px;cursor:pointer;font-family:inherit}
.back:active{background:#eef3ff}
.pane{display:none}
.pane.on{display:block}
.filters{display:flex;gap:8px;overflow-x:auto;padding:4px 0 12px;-webkit-overflow-scrolling:touch}
.chip{flex:0 0 auto;padding:7px 13px;border-radius:999px;background:#fff;border:1px solid #d5ddea;color:#45536b;font-size:13px;cursor:pointer;white-space:nowrap}
.chip.on{background:linear-gradient(135deg,#122a52,#1b356b);border-color:#1b356b;color:#fff}
.card{position:relative;background:#fff;border-radius:12px;box-shadow:0 2px 10px rgba(10,22,40,.07),0 1px 2px rgba(10,22,40,.04);padding:15px 15px 13px 20px;margin-bottom:13px;overflow:hidden;cursor:pointer;transition:box-shadow .18s ease}
.card.open{box-shadow:0 4px 18px rgba(10,22,40,.12)}
.chint{font-size:11.5px;color:#9aa4b5;margin-top:9px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.prepts{margin-top:8px}
.presum{margin-top:7px;font-size:12.8px;color:#5f6b80;line-height:1.66;background:#f8faff;border-left:3px solid #4a78c8;padding:7px 10px;border-radius:6px}
.prep{font-size:12.5px;color:#43506a;line-height:1.62;margin:0 0 5px;padding-left:9px;border-left:2px solid #dbe6f8}
.preptip{font-size:11px;color:#a6b0c2;margin-top:2px}
.prep.muted{color:#9aa4b5;border-left-color:#e7ecf5}
.push.mini{font-size:11px;padding:4px 11px;margin:0;border-radius:7px}
.nofull{margin-top:8px;font-size:12px;color:#98a3b6;background:#fafbfd;border:1px dashed #dfe6f2;border-radius:8px;padding:9px 12px;text-align:center}
.chint .t-close{display:none}
.card.open .chint .t-open{display:none}
.card.open .chint .t-close{display:inline}
.cbody{display:none}
.card.open .cbody{display:block}
.sum{margin-top:12px}
.card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:linear-gradient(180deg,#0a1628,#1b356b)}
.tagrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:9px}
.cat{background:#e8effc;color:#12295c;font-size:12px;padding:3px 9px;border-radius:6px;font-weight:600;letter-spacing:.3px}
.score{color:#1b356b;font-size:14px;letter-spacing:1.5px;margin-left:auto}
.card.s5 .score{color:#b42318}
.free{font-size:11.5px;color:#12295c;background:#eef3ff;border:1px solid #cbd9f5;border-radius:10px;padding:1px 7px;line-height:1.6}
.eng{color:#12295c}
.src{color:#9aa4b5;font-size:11.5px;margin-left:auto}
h2{font-size:15.5px;line-height:1.5;font-weight:700;color:#0f2a63;margin-bottom:9px}
.sum{background:#f5f7fb;border-left:3px solid #4a78c8;border-radius:0 7px 7px 0;padding:9px 11px;font-size:13px;color:#4a566d;margin-bottom:9px;line-height:1.6}
.meta2{font-size:11.5px;color:#8a95a8;margin-bottom:10px;line-height:1.7}
.meta2 .time{display:inline;background:none;border:0;padding:0;margin:0;color:#5b6b85;font-weight:600;font-size:11.5px}
.time{display:inline-block;background:#e6eeff;color:#0a2158;border:1px solid #b8cdf5;font-size:13px;padding:5px 10px;border-radius:8px;margin-bottom:10px;line-height:1.5}
ul.points{list-style:none;padding:0}
ul.points li{position:relative;padding-left:15px;margin-bottom:5px;font-size:13px;color:#374151;line-height:1.75}
ul.points li:before{content:"";position:absolute;left:3px;top:9px;width:5px;height:5px;background:#4a78c8;border-radius:50%}
ul.points li.muted{color:#9aa4b5}
ul.points li.muted:before{background:#d1d5db}
details.full{margin-top:4px}
details.full summary{display:block;cursor:pointer;list-style:none;text-align:center;font-size:12.5px;font-weight:600;color:#12295c;background:#f2f6fd;border:1px solid #dbe6f8;border-radius:8px;padding:8px 0}
details.full summary::-webkit-details-marker{display:none}
details.full .t-close{display:none}
details.full[open] .t-open{display:none}
details.full[open] .t-close{display:inline}
details.full p{margin-top:8px;font-size:13px;color:#4b5563;line-height:1.75;white-space:pre-wrap;background:#f8fafd;border-radius:8px;padding:10px 12px}
.acts{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid #eff2f7}
.fetched{font-size:11px;color:#9aa4b5;white-space:nowrap}
.btn-link{display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg,#122a52,#1b356b);color:#fff;font-size:11.5px;font-weight:600;padding:5px 11px;border-radius:8px;text-decoration:none;box-shadow:0 3px 9px rgba(27,53,107,.22);white-space:nowrap}
.btn-link:hover{opacity:.92}
.link{display:inline-block;margin-top:10px;font-size:13px;color:#0f2a63;text-decoration:none}
.rawurl{display:block;margin-top:6px;font-size:11px;color:#b0b8c6;word-break:break-all;line-height:1.5;text-decoration:none}
.arcbar{font-size:12px;color:#8a95a8;line-height:1.6}
.arcbar b{color:#12295c;font-size:14px;margin:0 2px}
.qinput{width:100%;padding:9px 12px;border:1px solid #d5ddea;border-radius:9px;font-size:13.5px;outline:none;background:#fff;color:#333}
.link:hover{text-decoration:underline}
.row{display:flex;gap:12px;align-items:flex-start;background:#fff;border-radius:10px;box-shadow:0 1px 6px rgba(10,22,40,.06);padding:12px 14px;margin-bottom:9px}
.rowmain{flex:1;min-width:0}
.rowdate{font-size:12px;color:#9aa4b5}
.rowtitle{font-size:14.5px;font-weight:600;line-height:1.5;color:#0f2a63;margin:2px 0 4px;word-break:break-word}
.rowmeta{font-size:12px;color:#8a95a8}
.rowact{margin-top:12px;border-top:1px dashed #e6ebf3;padding-top:10px;text-align:right}
.del,.rest{flex:0 0 auto;font-size:11.5px;padding:5px 9px;border-radius:8px;border:1px solid #d5ddea;background:#fff;color:#6b7280;cursor:pointer;white-space:nowrap}
.del:hover{border-color:#fca5a5;color:#dc2626}
.push{flex:0 0 auto;font-size:11.5px;padding:5px 9px;border-radius:8px;border:1px solid #b8cdf5;background:#fff;color:#12295c;cursor:pointer;white-space:nowrap;margin-right:8px}
.push:hover{background:#eef3ff}
.push:disabled{opacity:.55;cursor:default}
.purge{flex:0 0 auto;font-size:11.5px;padding:5px 9px;border-radius:8px;border:1px solid #fca5a5;background:#fff;color:#dc2626;cursor:pointer;white-space:nowrap;margin-left:8px}
.purge:hover{background:#fef2f2}
.toast{position:fixed;left:50%;bottom:78px;transform:translateX(-50%);max-width:88%;background:#0a1628;color:#fff;font-size:13.5px;line-height:1.6;padding:11px 16px;border-radius:10px;z-index:99;display:none;box-shadow:0 6px 20px rgba(0,0,0,.18)}
.toast.on{display:block}
.toast.err{background:#b91c1c}
.toast.ok{background:#047857}
.rest:hover{border-color:#86efac;color:#059669}
.box{background:#fff;border-radius:12px;box-shadow:0 2px 10px rgba(10,22,40,.07);padding:16px 18px;margin-bottom:13px}
.box h3{font-size:15px;color:#0f2a63;margin-bottom:8px}
.box p{font-size:13.5px;color:#4b5563;margin-bottom:6px}
input[type=password],input[type=number],input[type=text]{border:1px solid #d5ddea;border-radius:9px;padding:9px 11px;font-size:14px;font-family:inherit;background:#f8fafd;color:#1a2332}
textarea{width:100%;min-height:92px;border:1px solid #d5ddea;border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;line-height:1.6;resize:vertical;background:#f8fafd;color:#1a2332}
.btn{display:inline-block;margin-top:10px;padding:9px 16px;background:linear-gradient(135deg,#122a52,#1b356b);color:#fff;border:none;border-radius:9px;font-size:13.5px;cursor:pointer;font-family:inherit}
.btn.ghost{background:#fff;color:#45536b;border:1px solid #d5ddea}
.hint{font-size:12.5px;color:#8a95a8;line-height:1.75;margin-top:8px}
table.site{width:100%;border-collapse:collapse;font-size:13px}
table.site th,table.site td{text-align:left;padding:7px 8px;border-bottom:1px solid #eff2f7}
table.site th{color:#8a95a8;font-weight:500}
.empty{text-align:center;color:#9aa4b5;padding:50px 20px;font-size:14px}
footer{text-align:center;color:#9aa4b5;font-size:12px;margin-top:30px}
@media(max-width:480px){.wrap{padding:0 10px 86px}header{margin:0 -10px;padding:22px 16px 20px}h1{font-size:20px}h2{font-size:15px}ul.points li{font-size:12.8px}.rowtitle{font-size:14px}}
`;

function stampText(n){
  const t = (n && n.found_at) || '';
  if (!t) return n && n.published_at ? ('发布于 ' + n.published_at) : '';
  const d = new Date(t);
  if (isNaN(d.getTime())) return '';
  const p = (x) => String(x).length < 2 ? '0' + x : String(x);
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ' 抓取';
}

function card(n, action) {
  const short = (p) => { const t = String(p || ''); return t.length > 50 ? (t.slice(0, 48) + '…') : t; };
  const prep = (n.key_points || []).map((p) => `<div class="prep">· ${esc(short(p))}</div>`).join('')
    || '<div class="prep muted">· 正文没抓到（内容可能在附件里），展开点原文看要求</div>';
  const pts = (n.key_points || []).map((p) => `<li>${esc(p)}</li>`).join('')
    || '<li class="muted">这条通知正文很短（内容可能在附件里），请点开原文查看具体要求</li>';
  const full = n.content
    ? `<details class="full"><summary><span class="t-open">展开原文内容（${n.content.length} 字）▼</span><span class="t-close">收起原文内容 ▲</span></summary><p>${esc(n.content)}</p></details>`
    : '<div class="nofull">这条没抓到正文（内容可能在附件里），请点开原文查看</div>';
  const acts = action === 'del'
    ? `<button class="push mini" data-u="${esc(n.url || '')}">推送</button><button class="del" data-k="${esc(n.url || n.title)}">删除</button>`
    : action === 'rest'
      ? `<button class="rest" data-k="${esc(n.url || n.title)}">恢复</button><button class="purge" data-k="${esc(n.url || n.title)}">彻底删除</button>`
      : '';
  return `<article class="card s${n.score || 1}" data-cat="${esc(n.category)}">
  <div class="tagrow">
    <span class="cat">[${esc(n.category)}]</span>
    ${(n.tags || []).map((t) => `<span class="free">#${esc(t)}</span>`).join('')}
    <span class="score">${stars(n.score)}</span>
  </div>
  <h2>${esc(n.title)}</h2>
  ${n.summary ? `<div class="presum">${esc(n.summary)}</div>` : ''}
  ${prep ? `<div class="prepts">${prep}</div>` : ''}
  ${full}
  <div class="meta2">来源：${esc(n.site || '')}${n.published_at ? ' · 发布 ' + esc(n.published_at) : ''}${n.event_time ? ' | 时间：<span class="time">' + esc(n.event_time) + '</span>' : ''}${n.engine === 'ai' ? ' · <b class="eng">AI 提炼</b>' : (n.engine === 'rule' ? ' · 规则提炼' : '')}</div>
  <div class="foot"><span class="fetched">${esc(stampText(n))}</span><div class="acts">${acts}${n.url ? `<a class="btn-link" href="${esc(n.url)}" rel="noopener" onclick="event.stopPropagation();location.href=this.href;return false;">原文 →</a>` : ''}</div></div>
  ${n.url ? `<a class="rawurl" href="${esc(n.url)}" rel="noopener" onclick="event.stopPropagation();location.href=this.href;return false;">${esc(n.url)}</a>` : ''}
</article>`;
}

/**
 * 生成完整网页（五个页签）
 */
function page(notices, config) {
  const updated = new Date().toLocaleString('zh-CN', { hour12: false });
  const screener = browserScreener();
  const data = JSON.stringify(notices).replace(/<\/script>/gi, '<\\/script>');
  const cfg = JSON.stringify({
    title: (config && config.site_title) || '学院信息筛选助手',
    college: (config && config.college) || '',
    sites: ((config && config.sites) || []).map((s) => ({ name: s.name, url: s.url, enabled: s.enabled !== false })),
    maxNew: (config && config.max_new_per_site) || 6,
    supabase: (config && config.supabase && config.supabase.url && config.supabase.key)
      ? { url: config.supabase.url, key: config.supabase.key }
      : null,
    repo: (config && config.repo && config.repo.owner && config.repo.name)
      ? { owner: config.repo.owner, name: config.repo.name }
      : null,
  }).replace(/<\/script>/gi, '<\\/script>');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc((config && config.site_title) || '学院信息筛选助手')}</title>
<style>${SITE_CSS}</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>${esc((config && config.site_title) || '学院信息筛选助手')}</h1>
    <div class="meta">${esc((config && config.college) || '')} · 最后更新 ${esc(updated)}</div>
  </header>

  <nav class="tabs" id="tabs">
    <div class="tab on" data-tab="screen">学院<span class="badge" id="bScreen">0</span></div>
    <div class="tab" data-tab="contest">竞赛<span class="badge" id="bContest">0</span></div>
    <div class="tab" data-tab="exam">考试<span class="badge" id="bExam">0</span></div>
    <div class="tab" data-tab="lecture">讲座<span class="badge" id="bLecture">0</span></div>
    <div class="tab" data-tab="important">重要<span class="badge" id="bImportant">0</span></div>
    <div class="tab" data-tab="add">提取</div>
    <div class="tab" data-tab="archive">留档<span class="badge" id="bArchive">0</span></div>
  </nav>

  <div class="pane" id="pane-add">
    <div class="backbar"><button class="back" onclick="switchTab('archive')">← 返回</button></div>
    <div class="box">
      <h3>识别图片里的通知</h3>
      <p>通知截图、公众号长图、群消息截图，选图后在本机识别成文字，自动填进下面的正文框，再点提炼。</p>
      <input type="file" id="ocrFile" accept="image/*" multiple style="display:none">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn" id="ocrPick" style="margin:0">选择图片识别</button>
        <button class="btn ghost" id="ocrClear" style="display:none;margin:0">清空识别结果</button>
      </div>
      <div style="margin-top:10px;font-size:13px;color:#5b6472">
        准确度：<a href="javascript:;" data-lv="80" class="ocrLv" style="color:#c0392b;font-weight:700;text-decoration:none">严格 80</a>
        <a href="javascript:;" data-lv="55" class="ocrLv" style="color:#7a8699;text-decoration:none;margin-left:8px">平衡 55</a>
        <a href="javascript:;" data-lv="40" class="ocrLv" style="color:#7a8699;text-decoration:none;margin-left:8px">宽松 40</a>
        <span style="color:#9aa4b2;margin-left:6px">严格档只留把握很高的字，认不出会提示你换档</span>
      </div>
      <div class="hint" id="ocrOut">图片只在你自己的设备上识别，不会上传到服务器。</div>
    </div>
    <div class="box">
      <h3>手动输入内容并提炼</h3>
      <p>把通知文字整段贴进来，在本机按同一套规则现场提炼分类、星级、时间、要点。这一步不联网、不上传你的文字；后台定时抓取那条链路才会调 AI。</p>
      <input type="text" id="manTitle" placeholder="标题（可留空，会取正文第一行）" style="width:100%;margin-bottom:8px">
      <textarea id="manBody" placeholder="正文内容贴在这里…"></textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">
        <button class="btn" id="manRun" style="margin:0">提炼</button>
        <button class="btn ghost" id="manCopy" style="display:none;margin:0">复制提炼结果</button>
      </div>
    </div>
    <div id="manResult"></div>
    <div class="box">
      <h3>识别网址</h3>
      <p>贴一个通知文章链接，自动抓正文并按同一套口径提炼。走 GitHub 抓取，大约等 1 分钟。</p>
      <input type="text" id="urlInput" placeholder="https://spxy.zjgsu.edu.cn/?news/7134.html" style="width:100%">
      <div style="margin-top:10px"><button class="btn" id="urlRun" style="margin:0">识别这个网址</button></div>
      <div class="hint" id="urlStatus">抓不到正文时会显示抓到了多少字，方便判断是链接不对还是正文在附件里。</div>
    </div>
    <div id="urlResult"></div>
    <div class="box">
      <h3>粘贴公众号文章链接</h3>
      <p>把公众号文章的链接贴进来，一行一条。可以先识别一下这些链接分别是什么、能不能自动抓，再存成待处理清单。</p>
      <textarea id="draftInput" placeholder="https://mp.weixin.qq.com/s/..."></textarea>
      <button class="btn" id="draftSave">存进待处理清单</button>
      <button class="btn ghost" id="draftCopy">复制全部链接</button>
      <button class="btn ghost" id="draftCheck">识别这些链接</button>
      <div class="hint" id="draftCheckOut" style="display:none"></div>
      <div class="hint">
        说明：微信不允许任何服务器直接抓取公众号正文（实测带微信 UA、浏览器 UA、Referer 模拟，都会被转到「环境异常」验证页），
        搜狗微信搜索与第三方 RSS 通道同样失效。所以公众号这里只留链接，正文需要你从微信复制后，粘贴到上方「正文内容」里提炼。
      </div>
    </div>
    <div class="box">
      <h3>待处理清单<span class="badge" id="bDraft">0</span></h3>
      <div id="draftList"></div>
    </div>
  </div>

  <div class="pane on" id="pane-screen">
    <div class="box" style="padding:10px 12px"><input class="qinput" id="q" type="search" placeholder="搜索标题、摘要、时间、要点" autocomplete="off"></div>
    <div class="filters" id="filters"></div>
    <div id="list"></div>
  </div>

  <div class="pane" id="pane-contest">
    <div class="box" style="padding:12px 14px">
      <div class="hint" style="margin:0">竞赛类：竞赛报名、选拔、赛程、组队、培训、获奖公示，以及大创、科研训练、创新创业项目。</div>
    </div>
    <div id="contestList"></div>
  </div>

  <div class="pane" id="pane-exam">
    <div class="box" style="padding:12px 14px">
      <div class="hint" style="margin:0">考试类：课程考试安排、缓考补考重修、成绩复核，以及四六级、计算机、普通话、教资等证件考试报名。</div>
    </div>
    <div id="examList"></div>
  </div>

  <div class="pane" id="pane-lecture">
    <div class="box" style="padding:12px 14px">
      <div class="hint" style="margin:0">讲座类：学术报告、实务导师进课堂、经验分享会的时间、地点、主讲人与参加方式。</div>
    </div>
    <div id="lectureList"></div>
  </div>

  <div class="pane" id="pane-important">
    <div class="box" style="padding:12px 14px">
      <div class="hint" style="margin:0">重要类：能加分、有奖金、评优评先的事（竞赛类另有专门页签）。包括奖学金助学金、评奖评优、困难认定、勤工助学、综合素质测评加分认定。</div>
    </div>
    <div id="importantList"></div>
  </div>

  <div class="pane" id="pane-sites">
    <div class="backbar"><button class="back" onclick="switchTab('archive')">← 返回</button></div>
    <div class="box">
      <h3>加入常用网址</h3>
      <p>加进来的栏目会进定时抓取清单，从下一轮检查开始生效。</p>
      <input type="text" id="siteName" placeholder="栏目名，比如「学院科研」" style="width:100%;margin-bottom:8px">
      <input type="text" id="siteUrl" placeholder="栏目列表页地址 https://..." style="width:100%">
      <div style="margin-top:10px"><button class="btn" id="siteAdd" style="margin:0">加入常用网址</button></div>
      <div class="hint" id="siteStatus">网址要填栏目的列表页（能看到一排通知标题的那一页），不是某一篇文章。</div>
    </div>
    <div class="box">
      <h3>正在监控的网址<span class="badge" id="bSites2">0</span></h3>
      <table class="site" id="siteTable"></table>
      <div class="hint">推送里的每条通知都来自上面这些网址之一，卡片上的「来源」标注的就是栏目名。</div>
    </div>
  </div>

  <div class="pane" id="pane-archive">
    <div class="box" style="padding:12px 14px">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ghost" style="margin:0;flex:1;padding:8px 6px;font-size:12.5px" onclick="switchTab('sites')">常用网址<span class="badge" id="bSites">0</span></button>
        <button class="btn ghost" style="margin:0;flex:1;padding:8px 6px;font-size:12.5px" onclick="switchTab('trash')">回收站<span class="badge" id="bTrash">0</span></button>
        <button class="btn ghost" style="margin:0;flex:1;padding:8px 6px;font-size:12.5px" onclick="switchTab('settings')">设置</button>
      </div>
    </div>
    <div class="box" style="padding:12px 14px">
      <div class="arcbar" id="arcbar"></div>
      <div class="hint" style="margin:6px 0 0">留档按发布时间从新到旧排列。删除会先移到回收站，可以再恢复。</div>
    </div>
    <div id="archiveList"></div>
  </div>

  <div class="pane" id="pane-trash">
    <div class="backbar"><button class="back" onclick="switchTab('archive')">← 返回</button></div>
    <div class="box" style="padding:12px 14px">
      <div class="hint" style="margin:0">这里的记录从留档库删掉了，点恢复可以放回去。</div>
    </div>
    <div id="trashList"></div>
  </div>

  <div class="pane" id="pane-settings">
    <div class="backbar"><button class="back" onclick="switchTab('archive')">← 返回</button></div>
    <div class="box">
      <h3>推送邮箱</h3>
      <p>填一次就行。之后点每条通知右上角的「推送」，手机会直接打开邮件 App，标题和内容都已经填好，按发送即可。不需要申请 GitHub Token。</p>
      <div><input type="email" id="pushMail" placeholder="你的邮箱，例如 123456@qq.com" style="width:100%"></div>
      <div class="hint">只存在这台手机里，不会写进网页。</div>
    </div>
    <div class="box">
      <h3>推送</h3>
      <p>邮件推送：每 30 分钟检查一次，有新的重要通知才发信，没有新通知不发。</p>
      <p>收件邮箱和发件邮箱在 GitHub 仓库的 Settings → Secrets 里配置（SMTP_USER / SMTP_PASS / MAIL_TO）。</p>
    </div>
    <div class="box">
      <h3>云端同步</h3>
      <p>填一次 Supabase 的地址和 anon key。连上以后，收藏和自加的常用网址会存到云端，清缓存、换手机、换电脑都自动回来。</p>
      <input type="text" id="sbUrl" placeholder="https://xxxx.supabase.co" style="width:100%;margin-bottom:8px">
      <input type="text" id="sbKey" placeholder="anon public key（eyJ 开头那一长串）" style="width:100%;margin-bottom:8px">
      <button class="btn" id="sbSave" style="margin:0">连接云端</button>
      <div class="hint" id="sbState"></div>
    </div>
    <div class="box">
      <h3>备份与恢复</h3>
      <p>把留档、本机存的收藏、自己加的常用网址一起存成一个 JSON 文件。换手机、清浏览器数据、手滑清空之后，导入这个文件就能全部找回来。</p>
      <button class="btn" onclick="exportBackup()">导出备份</button>
      <button class="btn ghost" id="importBtn" style="margin-left:8px">导入备份</button>
      <input type="file" id="importFile" accept=".json,application/json" style="display:none">
      <div class="hint">导出后文件在手机的「下载」目录；恢复时点「导入备份」，选那个 JSON 文件即可。</div>
    </div>
    <div class="box">
      <h3>监视范围</h3>
      <p>正在监控的网址在「常用网址」板块，那里也能直接加新栏目。</p>
      <p>新加的栏目第一次检查只登记已有通知，不推送历史，从第二次才开始推新的。</p>
    </div>
    <div class="box">
      <h3>留档与删除</h3>
      <p>数据存在仓库的 data/notices.json 里，每次抓完自动提交，不会丢。</p>
      <p>留档库的「删除」只是移进回收站（本地记录）；回收站的「彻底删除」会同时把这条从仓库的 data/notices.json 里删掉，之后不会再出现。</p>
      <p>彻底删除需要 Token 勾上 <b>Contents: Read and write</b> 权限；没填 Token 时只在本机隐藏。</p>
    </div>
  </div>

  <div class="toast" id="toast"></div>
  <footer>每 2 小时自动检查官网栏目 · 数据存在自己的仓库里</footer>
</div>
<script>${screener}</script>
<script>
const DATA = ${data};
const CFG = ${cfg};
const ALL = '全部';
const KEY_DEL = 'nc_deleted';
const KEY_DRAFT = 'nc_drafts';
const KEY_PURGE = 'nc_purged';
let cur = ALL;
let QS = '';
function hit(n){
  if (!QS) return true;
  const t = [n.title, n.summary, n.event_time, n.category, (n.key_points || []).join(' ')].join(' ').toLowerCase();
  return t.indexOf(QS.toLowerCase()) >= 0;
}

function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function stars(n){ const v=Math.max(1,Math.min(5,Number(n)||1)); return '★'.repeat(v)+'☆'.repeat(5-v); }
let MEM = {};
let STORAGE_OK = true;
try { localStorage.setItem('nc_probe','1'); localStorage.removeItem('nc_probe'); } catch(e){ STORAGE_OK = false; }

function ld(k){
  try {
    const raw = localStorage.getItem(k);
    return JSON.parse(raw || '[]');
  } catch(e){
    return MEM[k] || [];
  }
}
function sv(k,v){
  MEM[k] = v.slice();
  try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){ STORAGE_OK = false; }
}
function keyOf(n){ return n.url || n.title; }
// 卡片底部的抓取时间，形如「11-10 18:55 抓取」
// 点卡片身子展开/收起；点里面的按钮、链接、正文快照都不动卡片
function cardToggle(el, e){
  if (e && e.target && e.target.closest && e.target.closest('.push,.del,.rest,.purge,.btn-link,.rawurl,a,details,summary')) return;
  el.classList.toggle('open');
}
function fetchtxt(n){
  const t = n.found_at || '';
  if (!t) return n.published_at ? ('发布于 ' + n.published_at) : '';
  const d = new Date(t);
  if (isNaN(d.getTime())) return '';
  const p = function(x){ return String(x).length < 2 ? '0' + x : String(x); };
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ' 抓取';
}
function tokenGet(){ try{ return localStorage.getItem('nc_gh_token')||''; }catch(e){ return MEM['nc_gh_token']||''; } }
function tokenSet(v){ MEM['nc_gh_token']=v; try{ localStorage.setItem('nc_gh_token', v); }catch(e){} }

const KEY_MAN = 'nc_manual';
// 本机存进去的条目 + 仓库同步下来的条目一起参与筛选；同一条不会重复出现
function alive(){
  const d = ld(KEY_DEL), p = ld(KEY_PURGE);
  const base = DATA.filter(function(n){ return d.indexOf(keyOf(n))<0 && p.indexOf(keyOf(n))<0; });
  const local = (ld(KEY_MAN) || []).filter(function(n){
    const k = keyOf(n);
    return d.indexOf(k) < 0 && !base.some(function(x){ return keyOf(x) === k; });
  });
  return local.concat(base);
}
function dead(){ const d=ld(KEY_DEL), p=ld(KEY_PURGE); return DATA.filter(function(n){ return d.indexOf(keyOf(n))>=0 && p.indexOf(keyOf(n))<0; }); }

function card(n, action){
  const short = function(p){ const t = String(p||''); return t.length > 50 ? (t.slice(0,48)+'…') : t; };
  const prep = (n.key_points||[]).map(function(p){ return '<div class="prep">· '+esc(short(p))+'</div>'; }).join('')
    || '<div class="prep muted">· 正文没抓到（内容可能在附件里），展开点原文看要求</div>';
  const pts = (n.key_points||[]).map(function(p){ return '<li>'+esc(p)+'</li>'; }).join('')
    || '<li class="muted">这条通知正文很短（内容可能在附件里），请点开原文查看具体要求</li>';
  const btns = action==='del'
    ? '<button class="push mini" data-u="'+esc(n.url||'')+'">推送</button><button class="del" data-k="'+esc(keyOf(n))+'">删除</button>'
    : action==='rest'
      ? '<button class="rest" data-k="'+esc(keyOf(n))+'">恢复</button><button class="purge" data-k="'+esc(keyOf(n))+'">彻底删除</button>'
      : '';
  return '<article class="card s'+(n.score||1)+'">'
    + '<div class="tagrow"><span class="cat">['+esc(n.category)+']</span>'
    + (n.tags||[]).map(function(t){ return '<span class="free">#'+esc(t)+'</span>'; }).join('')
    + '<span class="score">'+stars(n.score)+'</span></div>'
    + '<h2>'+esc(n.title)+'</h2>'
    + (n.summary ? '<div class="presum">'+esc(n.summary)+'</div>' : '')
    + (prep ? '<div class="prepts">'+prep+'</div>' : '')
    + (n.content ? '<details class="full"><summary><span class="t-open">展开原文内容（'+n.content.length+' 字）▼</span><span class="t-close">收起原文内容 ▲</span></summary><p>'+esc(n.content)+'</p></details>'
      : '<div class="nofull">这条没抓到正文（内容可能在附件里），请点开原文查看</div>')
    + '<div class="meta2">来源：'+esc(n.site||'')+(n.published_at?' · 发布 '+esc(n.published_at):'')
    + (n.event_time?' | 时间：<span class="time">'+esc(n.event_time)+'</span>':'')
    + (n.engine==='ai'?' · <b class="eng">AI 提炼</b>':(n.engine==='rule'?' · 规则提炼':''))+'</div>'
    + '<div class="foot"><span class="fetched">'+fetchtxt(n)+'</span>'
    + '<div class="acts">' + btns
    + (n.url ? '<a class="btn-link" href="'+esc(n.url)+'" rel="noopener" onclick="event.stopPropagation();location.href=this.href;return false;"">原文 →</a>' : '')
    + '</div></div>'
    + (n.url ? '<a class="rawurl" href="'+esc(n.url)+'" rel="noopener" onclick="event.stopPropagation();location.href=this.href;return false;"">'+esc(n.url)+'</a>' : '')
    + '</article>';
}

function row(n, mode){
  const btn = mode==='trash'
    ? '<button class="rest" data-k="'+esc(keyOf(n))+'">恢复</button>'
    : '<button class="del" data-k="'+esc(keyOf(n))+'">删除</button>';
  return '<div class="row"><div class="rowmain">'
    + '<div class="rowdate">'+esc(n.published_at||'')+'</div>'
    + '<div class="rowtitle">'+esc(n.title)+'</div>'
    + '<div class="rowmeta">'+esc(n.category||'')+' · '+esc(n.site||'')+' · '+stars(n.score)+'</div>'
    + '</div>'+btn+'</div>';
}

function buildFilters(){
  const cats = [ALL].concat(Array.from(new Set(alive().map(function(n){ return n.category; }).filter(Boolean))));
  const box = document.getElementById('filters');
  box.innerHTML = cats.map(function(c,i){ return '<div class="chip'+(i===0?' on':'')+'" data-cat="'+esc(c)+'">'+esc(c)+'</div>'; }).join('');
  box.querySelectorAll('.chip').forEach(function(el){
    el.onclick = function(){
      cur = el.getAttribute('data-cat');
      box.querySelectorAll('.chip').forEach(function(x){ x.classList.toggle('on', x===el); });
      renderScreen();
    };
  });
}

function renderScreen(){
  const list = alive().filter(function(n){ return (cur===ALL || n.category===cur) && hit(n); });
  document.getElementById('list').innerHTML = list.length
    ? list.map(function(n){ return card(n, 'del'); }).join('')
    : '<div class="empty">这个分类下还没有记录</div>';
}

function renderContest(){
  const list = alive().filter(function(n){ return (n.category==='竞赛' || n.category==='科研创新') && hit(n); });
  document.getElementById('contestList').innerHTML = list.length
    ? list.map(function(n){ return card(n,'del'); }).join('')
    : '<div class="empty">还没有竞赛类通知<br><span style="font-size:12.5px">学院官网最近没有新的竞赛通知被保留</span></div>';
}

function renderExam(){
  const list = alive().filter(function(n){ return (n.category==='教务考试' || n.category==='证件考试') && hit(n); });
  document.getElementById('examList').innerHTML = list.length
    ? list.map(function(n){ return card(n,'del'); }).join('')
    : '<div class="empty">还没有考试类通知</div>';
}

function renderLecture(){
  const list = alive().filter(function(n){ return n.category==='讲座报告' && hit(n); });
  document.getElementById('lectureList').innerHTML = list.length
    ? list.map(function(n){ return card(n,'del'); }).join('')
    : '<div class="empty">还没有讲座类通知<br><span style="font-size:12.5px">学院官网最近没有新的讲座报告被保留</span></div>';
}

function renderImportant(){
  const list = alive().filter(function(n){ return n.category==='评奖资助' && hit(n); });
  document.getElementById('importantList').innerHTML = list.length
    ? list.map(function(n){ return card(n,'del'); }).join('')
    : '<div class="empty">还没有重要类通知<br><span style="font-size:12.5px">奖学金、评优、困难认定、勤工助学这类会归到这里</span></div>';
}

function exportBackup(){
  const data = {
    site: CFG.title || '学院信息筛选助手',
    exported_at: new Date().toISOString(),
    total: alive().length,
    notices: alive(),
    trash: (typeof dead === 'function' ? dead() : []),
    // 下面这些只存在本机，清缓存会丢，所以一起打进备份文件
    manual: ld(KEY_MAN) || [],
    sites: ld(KEY_SITES) || [],
    deleted: ld(KEY_DEL) || [],
    draft: ld(KEY_DRAFT) || [],
    pushmail: ld('nc_pushmail') || ''
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '留档备份_' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1500);
  toast('已导出：留档 ' + data.total + ' 条 · 本机收藏 ' + data.manual.length + ' 条 · 自加网址 ' + data.sites.length + ' 个');
}

function importBackup(file){
  if (!file) return;
  const fr = new FileReader();
  fr.onload = function(){
    let j = null;
    try { j = JSON.parse(String(fr.result)); } catch(e){ toast('这个文件不是备份文件', 'err'); return; }
    if (!j || typeof j !== 'object'){ toast('备份文件是空的', 'err'); return; }

    let n = 0;
    if (Array.isArray(j.manual)){ sv(KEY_MAN, j.manual); n = j.manual.length; }
    if (Array.isArray(j.sites)){ sv(KEY_SITES, j.sites); }
    if (Array.isArray(j.deleted)){ sv(KEY_DEL, j.deleted); }
    if (Array.isArray(j.draft)){ sv(KEY_DRAFT, j.draft); }
    if (j.pushmail) sv('nc_pushmail', j.pushmail);

    try { renderSites(); renderScreen(); renderArchive(); renderDrafts(); counts(); } catch(e){}
    toast('已恢复：本机收藏 ' + n + ' 条 · 自加网址 ' + ((j.sites || []).length) + ' 个');
  };
  fr.onerror = function(){ toast('文件读取失败', 'err'); };
  fr.readAsText(file);
}

function renderArchive(){
  const list = alive().filter(hit);
  const bar = document.getElementById('arcbar');
  if (bar){
    const imp = list.filter(function(n){ return n.category==='评奖资助'; }).length;
    const man = list.filter(function(n){ return n.engine==='extract' || n.site==='手动提取' || n.manual; }).length;
    const old = list.length ? (list[list.length-1].published_at || '') : '';
    bar.innerHTML = '共 <b>'+list.length+'</b> 条 · 重要 <b>'+imp+'</b> · 手动提取 <b>'+man+'</b>'
      + (old ? ' · 最早 <b>'+esc(old)+'</b>' : '');
  }
  document.getElementById('archiveList').innerHTML = list.length
    ? list.map(function(n){ return card(n,'del'); }).join('')
    : '<div class="empty">留档库是空的</div>';
}

function renderTrash(){
  const list = dead();
  document.getElementById('trashList').innerHTML = list.length
    ? list.map(function(n){ return card(n,'rest'); }).join('')
    : '<div class="empty">回收站是空的</div>';
}

function renderDrafts(){
  const list = ld(KEY_DRAFT);
  document.getElementById('draftList').innerHTML = list.length
    ? list.map(function(u,i){
        return '<div class="row"><div class="rowmain"><div class="rowtitle" style="font-size:13px;font-weight:400;word-break:break-all">'+esc(u)+'</div></div>'
          + '<button class="del" data-i="'+i+'">删除</button></div>';
      }).join('')
    : '<div class="empty" style="padding:30px 20px">还没有待处理链接</div>';
  document.getElementById('draftList').querySelectorAll('.del').forEach(function(b){
    b.onclick = function(){ const i=Number(b.getAttribute('data-i')); const l=ld(KEY_DRAFT); l.splice(i,1); sv(KEY_DRAFT,l); renderDrafts(); };
  });
}

// ---------- 云端同步（Supabase）----------
// 没配置就是 null，一切照旧只存本机；配了就从云端拉、把本机独有的推上去
const SB = (function(){
  try {
    if (CFG.supabase && CFG.supabase.url && CFG.supabase.key) return CFG.supabase;
  } catch(e){}
  const u = ld('nc_sb_url'), k = ld('nc_sb_key');
  if (u && k) return { url: u, key: k };
  return null;
})();

function sbBase(){
  let s = String(SB.url);
  while (s.length && s.charAt(s.length - 1) === '/') s = s.slice(0, -1);
  const cut = s.indexOf('/rest/v1');
  if (cut > 0) s = s.slice(0, cut);
  return s;
}
function sbHead(){
  return { 'apikey': SB.key, 'Authorization': 'Bearer ' + SB.key, 'Content-Type': 'application/json' };
}

async function sbPull(){
  if (!SB) return null;
  try {
    const res = await fetch(sbBase() + '/rest/v1/nc_items?select=kind,key,payload&order=created_at.asc', { headers: sbHead() });
    if (!res.ok) return null;
    const rows = await res.json();
    const notes = [], sites = [];
    (rows || []).forEach(function(r){
      if (r.kind === 'note') notes.push(r.payload);
      else if (r.kind === 'site') sites.push(r.payload);
    });
    return { notes: notes, sites: sites };
  } catch(e){ return null; }
}

async function sbPush(kind, key, payload){
  if (!SB) return false;
  try {
    const res = await fetch(sbBase() + '/rest/v1/nc_items', {
      method: 'POST',
      headers: Object.assign(sbHead(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([{ kind: kind, key: key, payload: payload }])
    });
    return res.ok;
  } catch(e){ return false; }
}

async function sbDel(kind, key){
  if (!SB) return false;
  try {
    const res = await fetch(sbBase() + '/rest/v1/nc_items?kind=eq.' + encodeURIComponent(kind) + '&key=eq.' + encodeURIComponent(key), { method: 'DELETE', headers: sbHead() });
    return res.ok;
  } catch(e){ return false; }
}

// 打开页面就对一次账：云端有的拉回来，本机独有的推上去（原有的数据也一并带上）
async function syncCloud(){
  if (!SB) return;
  const cloud = await sbPull();
  if (!cloud) return;

  const cloudNotes = cloud.notes || [];
  const cloudSites = cloud.sites || [];
  const localNotes = ld(KEY_MAN) || [];
  const localSites = ld(KEY_SITES) || [];

  if (cloudNotes.length){
    const merged = cloudNotes.slice();
    localNotes.forEach(function(n){
      if (!merged.some(function(x){ return keyOf(x) === keyOf(n); })) merged.push(n);
    });
    sv(KEY_MAN, merged.slice(0, 300));
  }
  if (cloudSites.length){
    const merged2 = cloudSites.slice();
    localSites.forEach(function(s){
      if (!merged2.some(function(x){ return x.url === s.url; })) merged2.push(s);
    });
    sv(KEY_SITES, merged2);
  }

  for (const n of localNotes){
    if (!cloudNotes.some(function(x){ return keyOf(x) === keyOf(n); })) await sbPush('note', keyOf(n), n);
  }
  for (const s of localSites){
    if (!cloudSites.some(function(x){ return x.url === s.url; })) await sbPush('site', s.url, s);
  }

  try { renderSites(); renderScreen(); renderArchive(); counts(); } catch(e){}
}

const KEY_SITES = 'nc_sites';
// 仓库里的栏目 + 本机自己加的栏目（同一网址只出现一次）
function allSites(){
  const base = (CFG.sites || []).slice();
  const local = ld(KEY_SITES) || [];
  return base.concat(local.filter(function(s){
    return !base.some(function(b){ return b.url === s.url; });
  }));
}

function renderSites(){
  const list = allSites();
  const localUrls = (ld(KEY_SITES) || []).map(function(s){ return s.url; });
  const rows = list.map(function(s){
    const isLocal = localUrls.indexOf(s.url) >= 0;
    return '<tr><td>'+esc(s.name)+'</td>'
      + '<td style="word-break:break-all;color:#6b7280">'+esc(s.url)+'</td>'
      + '<td>'+(s.enabled===false?'已停用':'监控中')+'</td>'
      + '<td>'+(isLocal
        ? '<button class="del" style="padding:3px 10px;font-size:12px" data-delsite="'+esc(s.url)+'">删除</button>'
        : '<span style="color:#9ca3af;font-size:12px">仓库自带</span>')
      + '</td></tr>';
  }).join('');
  document.getElementById('siteTable').innerHTML = '<tr><th>栏目</th><th>地址</th><th>状态</th><th>操作</th></tr>'+rows;

  document.querySelectorAll('#siteTable [data-delsite]').forEach(function(b){
    b.onclick = function(){
      const u = b.getAttribute('data-delsite');
      const cur = (ld(KEY_SITES) || []).filter(function(x){ return x.url !== u; });
      sv(KEY_SITES, cur);
      sbDel('site', u);
      renderSites();
      toast('已删除这个收藏', 'ok');
    };
  });

  const on = list.filter(function(s){ return s.enabled!==false; }).length;
  document.getElementById('bSites').textContent = on;
  document.getElementById('bSites2').textContent = on;
}

function counts(){
  document.getElementById('bScreen').textContent = alive().length;
  document.getElementById('bContest').textContent = alive().filter(function(n){ return n.category==='竞赛' || n.category==='科研创新'; }).length;
  document.getElementById('bExam').textContent = alive().filter(function(n){ return n.category==='教务考试' || n.category==='证件考试'; }).length;
  document.getElementById('bLecture').textContent = alive().filter(function(n){ return n.category==='讲座报告'; }).length;
  document.getElementById('bImportant').textContent = alive().filter(function(n){ return n.category==='评奖资助'; }).length;
  document.getElementById('bArchive').textContent = alive().length;
  document.getElementById('bTrash').textContent = dead().length;
  document.getElementById('bDraft').textContent = ld(KEY_DRAFT).length;
}

// 事件委托：容器只绑一次，之后无论怎么重渲染，按钮都还有效
function onRows(containerId, handle){
  const box = document.getElementById(containerId);
  if (!box) return;
  box.addEventListener('click', function(e){
    const btn = e.target.closest('.del,.rest,.push,.purge');
    if (btn && box.contains(btn)){ handle(btn); return; }
    // 正文快照（原生 details）自己负责展开，不折叠整卡
    if (e.target.closest('details.full')) return;
    // 原文链接：正常跳转，不折叠
    if (e.target.closest('.btn-link') || e.target.closest('.rawurl')) return;
    // 正文快照按钮：只切自己，不折叠整卡
    const snapBtn = e.target.closest('.foldbtn');
    if (snapBtn){
      const sid = snapBtn.getAttribute('data-snap');
      const sbox = document.getElementById(sid);
      if (sbox){
        const opened = sbox.classList.toggle('on');
        snapBtn.textContent = opened ? '收起原文内容 ▲' : '展开原文内容 ▼';
      }
      return;
    }
    // 其余点到卡片任何位置 → 展开 / 收起
    const card = e.target.closest('.card');
    if (card && box.contains(card)) card.classList.toggle('open');
  });
}

function setDeleted(key, del){
  const d = ld(KEY_DEL);
  if (del){
    if (d.indexOf(key) < 0) d.push(key);
  } else {
    const i = d.indexOf(key);
    if (i >= 0) d.splice(i, 1);
  }
  sv(KEY_DEL, d);
  renderArchive(); renderScreen(); renderContest(); renderExam(); renderLecture(); renderImportant(); renderTrash(); counts();
}

function unb64(b){
  const bin = atob(String(b).replace(/\\n/g,''));
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function b64(str){
  const bytes = new TextEncoder().encode(str);
  let s = '';
  for (let i=0;i<bytes.length;i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

// 彻底删除：同时从仓库的 data/notices.json 里删掉，抓取时不会再回来
async function purgeOne(key){
  const token = tokenGet();
  const repo = ghRepo();
  if (!token || !repo || !repo.repo){
    const p = ld(KEY_PURGE);
    if (p.indexOf(key) < 0) p.push(key);
    sv(KEY_PURGE, p);
    renderArchive(); renderScreen(); renderContest(); renderExam(); renderLecture(); renderImportant(); renderTrash(); counts();
    toast('已在本机彻底删除（未连仓库：换设备还会看到）', 'err');
    return;
  }

  toast('正在从仓库数据里删除…');
  try {
    const api = 'https://api.github.com/repos/' + repo.owner + '/' + repo.repo + '/contents/data/notices.json';
    const head = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' };
    const g = await fetch(api + '?ref=main', { headers: head });
    if (!g.ok) throw new Error('读不到 data/notices.json（HTTP ' + g.status + '）');
    const j = await g.json();
    const arr = JSON.parse(unb64(j.content));
    const keep = arr.filter(function(n){ return (n.url || n.title) !== key; });
    if (keep.length === arr.length) throw new Error('仓库里找不到这条记录');

    const put = await fetch(api, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, head),
      body: JSON.stringify({
        message: '彻底删除 1 条留档',
        content: b64(JSON.stringify(keep, null, 2)),
        sha: j.sha,
        branch: 'main'
      })
    });
    if (!put.ok) throw new Error('写入失败（HTTP ' + put.status + '）');

    const p = ld(KEY_PURGE);
    if (p.indexOf(key) < 0) p.push(key);
    sv(KEY_PURGE, p);
    renderArchive(); renderScreen(); renderContest(); renderExam(); renderLecture(); renderImportant(); renderTrash(); counts();
    toast('已彻底删除，仓库数据里也删掉了', 'ok');
  } catch (e) {
    toast('彻底删除失败：' + e.message, 'err');
  }
}

function bindRows(){
  onRows('list', function(btn){
    if (btn.classList.contains('push')){ handlePush(btn); return; }
    const k = btn.getAttribute('data-k');
    if (!k) return;
    setDeleted(k, true);
    toast('已移入回收站');
  });
  onRows('archiveList', function(btn){
    if (btn.classList.contains('push')){ handlePush(btn); return; }
    const k = btn.getAttribute('data-k');
    if (!k) return;
    setDeleted(k, true);
    toast('已移入回收站');
  });
  [ 'contestList', 'examList', 'lectureList', 'importantList' ].forEach(function(id){
    onRows(id, function(btn){
      if (btn.classList.contains('push')){ handlePush(btn); return; }
      const k = btn.getAttribute('data-k');
      if (!k) return;
      setDeleted(k, true);
      toast('已移入回收站');
    });
  });
  onRows('trashList', function(btn){
    const k = btn.getAttribute('data-k');
    if (!k) return;
    if (btn.classList.contains('purge')){
      if (!confirm('彻底删除后不能再恢复，确定删掉这一条？')) return;
      purgeOne(k);
      return;
    }
    setDeleted(k, false);
    toast('已恢复到留档库');
  });
}

function ghRepo(){
  if (CFG.repo && CFG.repo.owner && CFG.repo.name) return { owner: CFG.repo.owner, repo: CFG.repo.name };
  const h = location.hostname || '';
  if (h.slice(-10) !== '.github.io') return null;
  const seg = (location.pathname || '/').split('/').filter(Boolean);
  return { owner: h.slice(0, -10), repo: seg[0] || '' };
}

function setStatus(msg, color){
  const el = document.getElementById('pushStatus');
  el.textContent = msg;
  el.style.color = color || '#9ca3af';
}

let toastTimer = null;
function toast(msg, kind){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast on' + (kind ? ' ' + kind : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ el.className = 'toast'; }, 4200);
}

// 通用：触发某个 workflow。返回 Promise<boolean>
function runWorkflow(file, inputs, onOk, onFail){
  const token = tokenGet();
  if (!token){ toast('推送凭证已移除，这条发不出去', 'err'); if(onFail) onFail('no-token'); return Promise.resolve(false); }
  const repo = ghRepo();
  if (!repo || !repo.repo){ toast('这个页面不是从 GitHub Pages 打开的，按钮用不了', 'err'); if(onFail) onFail('no-repo'); return Promise.resolve(false); }

  return fetch('https://api.github.com/repos/' + repo.owner + '/' + repo.repo + '/actions/workflows/' + file + '/dispatches', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ref: 'main', inputs: inputs })
  }).then(function(res){
    if (res.status === 204){ if(onOk) onOk(); return true; }
    if (res.status === 401 || res.status === 403) toast('Token 不对或权限不够（要勾 Actions: Read and write）', 'err');
    else if (res.status === 404) toast('找不到 workflow ' + file + '，检查是否已上传到 .github/workflows', 'err');
    else toast('触发失败（HTTP ' + res.status + '）', 'err');
    if(onFail) onFail('http-' + res.status);
    return false;
  }).catch(function(){
    toast('网络请求失败，浏览器可能拦截了跨域请求', 'err');
    if(onFail) onFail('network');
    return false;
  });
}

// 推送：触发 push.yml
function pushClip(s, n){
  s = String(s || '').trim();
  return s.length > n ? (s.slice(0, n) + '…') : s;
}

function pushViaMail(n){
  const to = String(ld('nc_pushmail') || '').trim();
  const subject = '【' + (n.category || '通知') + '】' + pushClip(n.title, 50);
  const head = [];
  if (n.summary) head.push(pushClip(n.summary, 110));
  if (n.event_time) head.push('时间：' + pushClip(n.event_time, 100));
  const pts = (n.key_points || []).slice(0, 4).map(function(p){ return '· ' + pushClip(p, 90); });
  const tail = n.url ? ['原文：' + n.url] : [];
  let body = '';
  for (let i = 0; i < 6; i++){
    body = head.concat(pts, tail).join('\\n');
    if (encodeURIComponent(body).length <= 1500) break;
    if (pts.length > 1) pts.pop(); else break;
  }
  window.location.href = 'mailto:' + encodeURIComponent(to)
    + '?subject=' + encodeURIComponent(subject)
    + '&body=' + encodeURIComponent(body);
  toast('已打开邮件，按发送即可');
}

function handlePush(btn){
  const u = btn.getAttribute('data-u') || '';
  if (!u) return;
  const el = document.getElementById('pushMail');
  if (el && el.value.trim()) sv('nc_pushmail', el.value.trim());
  const n = DATA.filter(function(x){ return x.url === u; })[0]
    || { url: u, title: '通知', category: '', score: 0 };
  pushViaMail(n);
}

function triggerPush(inputs, okMsg){
  toast('正在通知 GitHub 发信…');
  runWorkflow('push.yml', inputs, function(){ toast(okMsg, 'ok'); });
}



// ---------- 识别图片 → 文字（本机 OCR，图片不上传） ----------
let ocrLevel = 80;   // 逐行置信度门槛：80 = 只留把握很高的字

const OCR_CDN = [
  'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  'https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js',
  'https://lib.baomitu.com/tesseract.js/5.1.1/tesseract.min.js'
];
let ocrPending = null;

function loadOcr(){
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (ocrPending) return ocrPending;
  ocrPending = new Promise(function(resolve, reject){
    let i = 0;
    function next(){
      if (i >= OCR_CDN.length){
        reject(new Error('识别引擎加载失败，网络不好时可以先跳过图片，直接把文字粘贴进去'));
        return;
      }
      const s = document.createElement('script');
      s.src = OCR_CDN[i++];
      s.onload = function(){ window.Tesseract ? resolve(window.Tesseract) : next(); };
      s.onerror = next;
      document.head.appendChild(s);
    }
    next();
  });
  return ocrPending;
}

function isCnChar(ch){
  const c = ch.charCodeAt(0);
  return c >= 19968 && c <= 40959;
}

// 识别结果里每个汉字之间都会插空格（"浙江 工商 大 学"），压掉汉字之间的空格，
// 汉字与数字、字母之间保留，避免把"报名 11月20日"粘成一串。
function squeezeCn(s){
  let out = '';
  for (let i = 0; i < s.length; i++){
    const ch = s.charAt(i);
    if (ch === ' ' || ch.charCodeAt(0) === 12288){
      const prev = out.charAt(out.length - 1);
      const nxt = s.charAt(i + 1);
      if (prev && nxt && isCnChar(prev) && isCnChar(nxt)) continue;
    }
    out += ch;
  }
  return out;
}

function ocrSlice(img, sy, sh){
  // 实测：这张公众号长图放大两倍后置信度从 60 提到 67，错字也少一些。
  // 原图本来就很宽时不再放大，免得 canvas 太大拖慢浏览器。
  const up = img.naturalWidth > 1600 ? 1 : 2;
  const w = Math.round(img.naturalWidth * up);
  const h = Math.round(sh * up);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, sy, img.naturalWidth, sh, 0, 0, w, h);
  return cv;
}

function ocrRunFile(file, onProgress){
  return loadOcr().then(function(T){
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    const loaded = new Promise(function(res, rej){
      img.onload = function(){ res(img); };
      img.onerror = function(){ rej(new Error('这张图打不开')); };
    });
    img.src = objUrl;
    return loaded.then(function(){
      return T.createWorker('chi_sim', 1, {
        logger: function(m){
          if (m.status === 'recognizing text' && onProgress){
            onProgress(Math.round((m.progress || 0) * 100));
          }
        }
      }).then(function(worker){
        const total = img.naturalHeight;
        const step = 1600;
        const overlap = 80;
        const parts = [];
        let y = 0;
        function stepOnce(){
          if (y >= total){
            URL.revokeObjectURL(objUrl);
            return worker.terminate().then(function(){ return parts.join(String.fromCharCode(10)); });
          }
          const sh = Math.min(step + overlap, total - y);
          const cv = ocrSlice(img, y, sh);
          return worker.recognize(cv, {}, { blocks: true }).then(function(r){
            // 逐行按置信度过滤：图片区、装饰字这些噪声行普遍在 35 以下，
            // 正文一般在 60 以上，卡 45 既挡得住噪声又不容易误删真内容。
            const lines = [];
            const blocks = (r.data && r.data.blocks) || [];
            blocks.forEach(function(b){
              (b.paragraphs || []).forEach(function(p){
                (p.lines || []).forEach(function(L){ lines.push(L); });
              });
            });
            let out = '';
            if (lines.length){
              const kept = lines.filter(function(L){
                return (L.confidence || 0) >= ocrLevel && String(L.text || '').trim().length > 1;
              });
              out = kept.map(function(L){ return squeezeCn(String(L.text).trim()); }).join(String.fromCharCode(10));
              // 严格档不兜底：宁可空着，也不把没把握的字塞给用户
              if (!kept.length && ocrLevel < 80) out = squeezeCn(String((r.data && r.data.text) || '').trim());
            } else {
              out = squeezeCn(String((r.data && r.data.text) || '').trim());
            }
            if (out) parts.push(out);
            y += step;
            return stepOnce();
          });
        }
        return stepOnce().catch(function(e){
          URL.revokeObjectURL(objUrl);
          try { worker.terminate(); } catch (x) {}
          throw e;
        });
      });
    }, function(e){
      URL.revokeObjectURL(objUrl);
      throw e;
    });
  });
}

document.getElementById('ocrPick').onclick = function(){
  document.getElementById('ocrFile').click();
};

document.getElementById('ocrFile').onchange = function(){
  const files = Array.prototype.slice.call(this.files || []);
  if (!files.length) return;
  const out = document.getElementById('ocrOut');
  const pickBtn = document.getElementById('ocrPick');
  pickBtn.disabled = true;
  out.style.color = '#0f172a';
  let k = 0;
  const pieces = [];
  function nextFile(){
    if (k >= files.length){
      const all = pieces.join(String.fromCharCode(10) + String.fromCharCode(10));
      const body = document.getElementById('manBody');
      if (all){
        body.value = all;
        out.textContent = '识别完成，共 ' + all.length + ' 字，已填进下面的正文框。公众号长图常是艺术字体，容易认错字，先扫一遍改掉再点提炼。';
        document.getElementById('ocrClear').style.display = 'inline-block';
        if (body.scrollIntoView) body.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        out.textContent = '严格档（' + ocrLevel + '）没识别出可信的文字。这类公众号长图多是艺术字体，点上面的「平衡 55」再识别一次。';
      }
      pickBtn.disabled = false;
      document.getElementById('ocrFile').value = '';
      return;
    }
    const one = files[k];
    out.textContent = '正在识别第 ' + (k + 1) + '/' + files.length + ' 张…首次使用要下载中文语言包，大约 15MB，只下这一次。';
    ocrRunFile(one, function(pct){
      out.textContent = '第 ' + (k + 1) + '/' + files.length + ' 张识别中 ' + pct + '%';
    }).then(function(text){
      if (text) pieces.push(text);
      k++;
      nextFile();
    }).catch(function(e){
      out.textContent = '识别失败：' + (e && e.message ? e.message : e);
      pickBtn.disabled = false;
      document.getElementById('ocrFile').value = '';
    });
  }
  nextFile();
};

document.getElementById('ocrClear').onclick = function(){
  document.getElementById('manBody').value = '';
  document.getElementById('ocrClear').style.display = 'none';
  document.getElementById('ocrOut').textContent = '图片只在你自己的设备上识别，不会上传到服务器。';
};

Array.prototype.forEach.call(document.querySelectorAll('.ocrLv'), function(a){
  a.onclick = function(){
    ocrLevel = parseInt(a.getAttribute('data-lv'), 10);
    Array.prototype.forEach.call(document.querySelectorAll('.ocrLv'), function(x){
      x.style.color = '#7a8699';
      x.style.fontWeight = '400';
    });
    a.style.color = '#c0392b';
    a.style.fontWeight = '700';
    document.getElementById('ocrOut').textContent = '准确度已设为 ' + ocrLevel + '，再点「选择图片识别」重新识别一次。';
  };
});

// ---------- 手动输入内容并提炼（用页面里同一套 screener 引擎） ----------
let lastPick = null;

document.getElementById('manRun').onclick = function(){
  const t = document.getElementById('manTitle').value.trim();
  const b = document.getElementById('manBody').value.trim();
  const box = document.getElementById('manResult');
  if (!t && !b){
    toast('先贴标题或正文', 'err');
    return;
  }
  let title = t;
  if (!title){
    const lines = b.split('\\n').map(function(x){ return x.trim(); }).filter(function(x){ return x.length > 4; });
    title = (lines[0] || '').slice(0, 80);
  }
  const today = (function(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();

  let r = null;
  try {
    r = window.SCREENER.screenOne({ title: title, url: '', content: b, published_at: today });
  } catch(e){
    box.innerHTML = '<div class="box"><h3>提炼出错</h3><p>' + esc(e.message) + '</p></div>';
    return;
  }

  if (!r){
    lastPick = null;
    document.getElementById('manCopy').style.display = 'none';
    box.innerHTML = '<div class="box"><h3>判定：这条不用管</h3>'
      + '<p>按现在的口径，这条属于社团招新、日常活动宣传、节日问候、纯喜报、活动总结、报道稿或已过期通知一类的，不保留。</p>'
      + '<div class="hint">想让它留下来，可以改标题再试一次；也可以直接点下面的按钮跳过这条判定，自己决定留不留。</div>'
      + '<div style="margin-top:10px"><button class="btn ghost" id="manForce" style="margin:0">还是保留这条</button></div></div>';
    document.getElementById('manForce').onclick = function(){
      const forced = window.SCREENER.screenOne({ title: title, url: '', content: b, published_at: today }, { force: true });
      if (!forced){ toast('内容太少，提不出东西，再多贴一点', 'err'); return; }
      showManResult(forced, b, title, today);
    };
    return;
  }

  showManResult(r, b, title, today);
};

function starPickHtml(score){
  let s = '';
  const cur = Number(score) || 0;
  for (let n = 1; n <= 5; n++){
    s += '<span data-star="' + n + '" style="cursor:pointer;font-size:26px;line-height:1;color:'
      + (n <= cur ? '#e8a020' : '#c9ced8') + '">★</span>';
  }
  return s;
}

function catOptions(cur){
  let s = '';
  const list = (window.SCREENER && window.SCREENER.CATEGORIES) || [];
  let has = false;
  list.forEach(function(c){
    if (c === cur) has = true;
    s += '<option value="' + esc(c) + '"' + (c === cur ? ' selected' : '') + '>' + esc(c) + '</option>';
  });
  if (!has && cur) s += '<option value="' + esc(cur) + '" selected>' + esc(cur) + '</option>';
  return s;
}

// 把编辑框里的内容收回 item，点在星星上、点应用修改之前都先走这一步
function readManEdit(item){
  const tEl = document.getElementById('manTitleEdit');
  if (!tEl) return;
  const t2 = tEl.value.trim();
  if (t2) item.title = t2;
  const c2 = document.getElementById('manCatEdit').value;
  if (c2) item.category = c2;
  item.event_time = document.getElementById('manTimeEdit').value.trim();
  const pts = document.getElementById('manPointsEdit').value.split(String.fromCharCode(10))
    .map(function(x){ return x.trim(); })
    .filter(function(x){ return x.length > 0; });
  item.key_points = pts;
}

function renderManCard(item, b, title, today){
  const box = document.getElementById('manResult');
  box.innerHTML = card(item, 'del')
    + '<div style="margin-top:12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
    + '<span style="font-size:13px;color:#5b6472">这条几星，自己点：</span>'
    + starPickHtml(item.score)
    + '</div>'
    + '<div style="margin-top:12px;border-top:1px dashed #d8dde5;padding-top:10px">'
    + '<div style="font-size:13px;color:#5b6472;margin-bottom:8px">提炼得不对？这里直接改：</div>'
    + '<input id="manTitleEdit" value="' + esc(item.title) + '" placeholder="标题" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #d8dde5;border-radius:8px;font-size:14px;margin-bottom:8px">'
    + '<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">'
    + '<select id="manCatEdit" style="flex:1;min-width:110px;padding:8px;border:1px solid #d8dde5;border-radius:8px;font-size:14px">' + catOptions(item.category) + '</select>'
    + '<input id="manTimeEdit" value="' + esc(item.event_time || '') + '" placeholder="时间，如 11月20日截止" style="flex:1;min-width:150px;padding:8px;border:1px solid #d8dde5;border-radius:8px;font-size:14px">'
    + '</div>'
    + '<textarea id="manPointsEdit" rows="7" placeholder="要点，一条一行" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #d8dde5;border-radius:8px;font-size:14px;line-height:1.7">' + esc((item.key_points || []).join(String.fromCharCode(10))) + '</textarea>'
    + '<div style="margin-top:8px"><button class="btn ghost" id="manApply" style="margin:0">应用修改</button>'
    + '<span style="font-size:12px;color:#9aa4b2;margin-left:8px">改完点这里，卡片会跟着变</span></div>'
    + '</div>'
    + '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">'
    + '<button class="btn" id="manSave" style="margin:0">存入留档</button>'
    + '<button class="btn" id="manDrop" style="margin:0">删除这条</button>'
    + '</div>';
  document.getElementById('manCopy').style.display = 'inline-block';

  Array.prototype.forEach.call(box.querySelectorAll('[data-star]'), function(el){
    el.onclick = function(){
      readManEdit(item);
      item.score = parseInt(el.getAttribute('data-star'), 10);
      lastPick = item;
      renderManCard(item, b, title, today);
      toast('星级改成 ' + item.score + ' 星', 'ok');
    };
  });

  document.getElementById('manApply').onclick = function(){
    readManEdit(item);
    lastPick = item;
    renderManCard(item, b, title, today);
    toast('已按你的改法更新卡片', 'ok');
  };

  document.getElementById('manSave').onclick = function(){
    readManEdit(item);
    const cur = ld(KEY_MAN) || [];
    if (!cur.some(function(n){ return keyOf(n) === keyOf(item); })) cur.unshift(item);
    sv(KEY_MAN, cur.slice(0, 300));
    sbPush('note', keyOf(item), item);
    toast(SB ? '已存入留档：云端和本机都存了' : '已存入留档（保存在这台设备的浏览器里）', 'ok');
    renderScreen(); renderArchive(); counts();
  };
  document.getElementById('manDrop').onclick = function(){
    const cur = (ld(KEY_MAN) || []).filter(function(n){ return keyOf(n) !== keyOf(item); });
    sv(KEY_MAN, cur);
    sbDel('note', keyOf(item));
    box.innerHTML = '';
    document.getElementById('manCopy').style.display = 'none';
    toast('已删除', 'ok');
    renderScreen(); renderArchive(); counts();
  };
}

function showManResult(r, b, title, today){
  const item = Object.assign({}, r, {
    title: title,
    site: '手动输入',
    published_at: today,
    url: 'local:' + Date.now(),
    content: String(b).slice(0, 1600),
    engine: 'extract',
  });
  lastPick = item;
  renderManCard(item, b, title, today);
  toast('提炼完成：' + item.category + '，星级可以自己点', 'ok');
}

document.getElementById('manCopy').onclick = function(){
  if (!lastPick) return;
  const n = lastPick;
  const text = [n.title, '', '分类：' + (n.category||''), '星级：' + stars(n.score), (n.event_time ? '时间：' + n.event_time : '')]
    .concat((n.key_points||[]).map(function(p){ return '· ' + p; }))
    .join('\\n');
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(function(){ toast('已复制提炼结果', 'ok'); });
  else toast('这个浏览器不支持复制，手动选中吧', 'err');
};

// ---------- 常用网址：直接写回仓库里的 config.json ----------
async function addSite(name, url){
  const token = tokenGet();
  const repo = ghRepo();
  const st = document.getElementById('siteStatus');

  const setMsg = function(msg, color){ st.textContent = msg; st.style.color = color || '#9ca3af'; };

  if (!name || !url){ setMsg('栏目名和网址都要填', '#dc2626'); return; }
  if (!/^https?:\\/\\//i.test(url)){ setMsg('网址要 http:// 或 https:// 开头', '#dc2626'); return; }
  if (allSites().some(function(x){ return x.url === url; })){ setMsg('这个网址已经在清单里了', '#dc2626'); return; }

  // 没有令牌（或页面不是从 GitHub Pages 打开）：存下来，立刻生效
  if (!token || !repo || !repo.repo){
    const obj = { name: name, url: url, enabled: true };
    const cur = ld(KEY_SITES) || [];
    cur.push(obj);
    sv(KEY_SITES, cur.slice(0, 100));
    sbPush('site', url, obj);
    renderSites();
    setMsg(SB ? '已添加，云端已经同步' : '已加到本机收藏，这台设备上立刻生效', '#047857');
    toast('已添加：' + name, 'ok');
    return;
  }

  setMsg('正在写入仓库 config.json…', '#6b7280');
  try {
    const api = 'https://api.github.com/repos/' + repo.owner + '/' + repo.repo + '/contents/config.json';
    const head = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' };
    const g = await fetch(api + '?ref=main', { headers: head });
    if (!g.ok) throw new Error('读不到 config.json（HTTP ' + g.status + '）');
    const j = await g.json();
    const cfg = JSON.parse(unb64(j.content));
    cfg.sites = cfg.sites || [];
    cfg.sites.push({ name: name, url: url, enabled: true });

    const put = await fetch(api, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, head),
      body: JSON.stringify({
        message: '加入常用网址：' + name,
        content: b64(JSON.stringify(cfg, null, 2)),
        sha: j.sha,
        branch: 'main'
      })
    });
    if (!put.ok) throw new Error('写入失败（HTTP ' + put.status + '）');

    CFG.sites.push({ name: name, url: url, enabled: true });
    renderSites();
    document.getElementById('siteName').value = '';
    document.getElementById('siteUrl').value = '';
    setMsg('已加入：' + name + '（下一轮抓取开始生效）', '#047857');
    toast('已加入常用网址：' + name, 'ok');
  } catch(e){
    setMsg('加入失败：' + e.message, '#dc2626');
  }
}

document.getElementById('importBtn').onclick = function(){
  document.getElementById('importFile').click();
};

// 云端同步：设置页填地址与 key，填完立刻重连
(function(){
  const u = document.getElementById('sbUrl'), k = document.getElementById('sbKey'), st = document.getElementById('sbState');
  if (!u || !k) return;
  const su = ld('nc_sb_url'), sk = ld('nc_sb_key');
  if (su) u.value = su;
  if (sk) k.value = sk;
  if (st) st.textContent = SB ? '已连接：收藏和常用网址会同步到云端' : '还没配置，目前只存在这台设备里';
  document.getElementById('sbSave').onclick = function(){
    const a = u.value.trim(), b = k.value.trim();
    if (!a || !b){ toast('地址和 key 都要填', 'err'); return; }
    if (!/^https?:\\/\\//i.test(a)){ toast('地址要以 https:// 开头', 'err'); return; }
    sv('nc_sb_url', a); sv('nc_sb_key', b);
    toast('已保存，正在连云端…', 'ok');
    setTimeout(function(){ location.reload(); }, 900);
  };
})();
document.getElementById('importFile').onchange = function(){
  importBackup(this.files && this.files[0]);
  this.value = '';
};

document.getElementById('siteAdd').onclick = function(){
  addSite(document.getElementById('siteName').value.trim(), document.getElementById('siteUrl').value.trim());
};

// ---------- 识别网址：触发 extract.yml，然后等 docs/extract.json 更新 ----------
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

async function waitExtract(sinceISO){
  for (let i = 0; i < 24; i++){
    await sleep(5000);
    try {
      const res = await fetch('./extract.json?_=' + Date.now());
      if (!res.ok) continue;
      const j = await res.json();
      if (j.at && j.at >= sinceISO) return j;
    } catch(e){}
  }
  return null;
}

// 识别结果只在本页显示一次，不自动入库；用户点「存入留档」才留下来
function showExtractResult(raw){
  const box = document.getElementById('urlResult');
  const item = Object.assign({}, raw);
  if (!item.url) item.url = 'local:' + Date.now();
  box.innerHTML = card(item, 'del')
    + '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
    + '<button class="btn" id="extSave" style="margin:0">存入留档</button>'
    + '<button class="btn" id="extDrop" style="margin:0">删除这条</button>'
    + '<span class="hint" style="margin:0">不存的话，关掉页面就没了</span>'
    + '</div>';
  document.getElementById('extSave').onclick = function(){
    const cur = ld(KEY_MAN) || [];
    if (!cur.some(function(n){ return keyOf(n) === keyOf(item); })) cur.unshift(item);
    sv(KEY_MAN, cur.slice(0, 300));
    sbPush('note', keyOf(item), item);
    toast(SB ? '已存入留档：云端和本机都存了' : '已存入留档（保存在这台设备的浏览器里）', 'ok');
    renderScreen(); renderArchive(); counts();
  };
  document.getElementById('extDrop').onclick = function(){
    const cur = (ld(KEY_MAN) || []).filter(function(n){ return keyOf(n) !== keyOf(item); });
    sv(KEY_MAN, cur);
    sbDel('note', keyOf(item));
    box.innerHTML = '';
    toast('已删除，这条不再显示', 'ok');
    renderScreen(); renderArchive(); counts();
  };
}

document.getElementById('urlRun').onclick = function(){
  const url = document.getElementById('urlInput').value.trim();
  const st = document.getElementById('urlStatus');
  const box = document.getElementById('urlResult');
  const setMsg = function(msg, color){ st.textContent = msg; st.style.color = color || '#9ca3af'; };

  if (!url || !/^https?:\\/\\//i.test(url)){ setMsg('先贴一个 http:// 或 https:// 开头的链接', '#dc2626'); return; }
  const repo = ghRepo();
  if (!repo || !repo.repo){ setMsg('这个页面不是从 GitHub Pages 打开的，识别功能用不了', '#dc2626'); return; }

  // 有令牌：直接触发（自动路径）
  if (tokenGet()){
    const since = new Date().toISOString();
    box.innerHTML = '';
    setMsg('已提交，GitHub 正在抓取…大约等 1 分钟', '#6b7280');
    runWorkflow('extract.yml', { url: url }, async function(){
      const j = await waitExtract(since);
      if (!j){ setMsg('等了 2 分钟还没结果，去仓库 Actions 页面看看「识别网址」任务有没有报错', '#dc2626'); return; }
      if (j.ok && j.item){
        showExtractResult(j.item);
        setMsg('识别成功：' + j.item.category + ' · 星' + j.item.score + '（只在本次显示，想留就点「存入留档」）', '#047857');
      } else {
        let html = '<div class="box"><h3>这条没有保留</h3><p>' + esc(j.error || '判定为不需要处理') + '</p>';
        if (j.preview && j.preview.head){
          html += '<div class="hint">抓到 ' + j.preview.chars + ' 字，开头是：<br>' + esc(j.preview.head) + '</div>';
        }
        html += '</div>';
        box.innerHTML = html;
        setMsg('抓到了内容，但按口径不保留', '#dc2626');
      }
    }, function(reason){ setMsg('触发失败：' + reason, '#dc2626'); });
    return;
  }

  // 没有令牌：复制链接 + 去 GitHub 点一下（不需要令牌）
  const since = new Date().toISOString();
  if (navigator.clipboard) { navigator.clipboard.writeText(url).catch(function(){}); }
  const actionsUrl = 'https://github.com/' + repo.owner + '/' + repo.repo + '/actions/workflows/extract.yml';
  box.innerHTML = '<div class="box"><h3>还差一步：去 GitHub 点一下「运行」</h3>'
    + '<p>链接已经帮你复制好了。点下面按钮打开 GitHub → 在页面右侧点 <b>Run workflow</b> → 把链接粘到 <b>url</b> 框里 → 再点绿色 <b>Run workflow</b>。</p>'
    + '<p style="margin-top:8px">大约 1 分钟跑完，结果会显示在下面，<b>不会自动进留档</b>；要留就点「存入留档」。这个流程<b>不需要任何令牌</b>。</p>'
    + '<div style="margin-top:12px"><a class="btn" style="margin:0;display:inline-block" href="' + actionsUrl + '" target="_blank" rel="noopener">打开 GitHub 运行识别 →</a></div>'
    + '<div class="hint" style="margin-top:10px">公众号文章有时会被拦，如果提示抓到 0 字，把正文复制到下面「手动输入内容并提炼」也能用。</div></div>';
  setMsg('链接已复制，正在等 GitHub 跑完…', '#6b7280');

  (async function(){
    const j = await waitExtract(since);
    if (!j) { setMsg('没等到结果：确认 GitHub 上那个任务真的跑完了（绿色的勾）', '#dc2626'); return; }
    if (j.ok && j.item){
      showExtractResult(j.item);
      setMsg('识别成功：' + j.item.category + ' · 星' + j.item.score + '（只在本次显示，想留就点「存入留档」）', '#047857');
    } else {
      let html = '<div class="box"><h3>这条没有保留</h3><p>' + esc(j.error || '判定为不需要处理') + '</p>';
      if (j.preview && j.preview.head){
        html += '<div class="hint">抓到 ' + j.preview.chars + ' 字，开头是：<br>' + esc(j.preview.head) + '</div>';
      }
      html += '</div>';
      box.innerHTML = html;
      setMsg('抓到了内容，但按口径不保留', '#dc2626');
    }
  })();
};

var MORE_PANES = [ 'sites', 'trash', 'settings' ];
function switchTab(name){
  var tabName = MORE_PANES.indexOf(name) >= 0 ? 'archive' : name;
  document.querySelectorAll('#tabs .tab').forEach(function(el){ el.classList.toggle('on', el.getAttribute('data-tab')===tabName); });
  document.querySelectorAll('.pane').forEach(function(el){ el.classList.toggle('on', el.id==='pane-'+name); });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('tabs').querySelectorAll('.tab').forEach(function(el){
  el.onclick = function(){ switchTab(el.getAttribute('data-tab')); };
});

document.getElementById('draftSave').onclick = function(){
  const box = document.getElementById('draftInput');
  const lines = box.value.split('\\n').map(function(s){ return s.trim(); }).filter(function(s){ return s; });
  if (!lines.length) return;
  const cur = ld(KEY_DRAFT);
  lines.forEach(function(u){ if (cur.indexOf(u)<0) cur.push(u); });
  sv(KEY_DRAFT, cur);
  box.value = '';
  renderDrafts(); counts();
};

document.getElementById('draftCopy').onclick = function(){
  const text = ld(KEY_DRAFT).join('\\n');
  if (!text) return;
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(function(){ alert('已复制 '+ld(KEY_DRAFT).length+' 条链接'); });
  else alert(text);
};

document.getElementById('draftCheck').onclick = function(){
  const out = document.getElementById('draftCheckOut');
  const raw = (document.getElementById('draftInput').value || '');
  const lines = raw.split(String.fromCharCode(10)).map(function(s){ return s.split(String.fromCharCode(13)).join('').trim(); }).filter(function(s){ return s; });
  out.style.display = 'block';
  if (!lines.length){ out.innerHTML = '先贴一条链接，再点识别。'; return; }
  const wx = [];
  const web = [];
  const bad = [];
  lines.forEach(function(u, i){
    const http = u.slice(0, 7) === 'http://' || u.slice(0, 8) === 'https://';
    if (!http){ bad.push(i + 1); return; }
    if (u.indexOf('mp.weixin.qq.com') > -1) wx.push([i + 1, u]);
    else web.push([i + 1, u]);
  });
  let html = '<div style="margin-bottom:6px">共 ' + lines.length + ' 条：公众号 ' + wx.length + ' 条，普通网页 ' + web.length + ' 条' + (bad.length ? '，格式不对 ' + bad.length + ' 条' : '') + '。</div>';
  wx.forEach(function(r){
    html += '<div style="margin-top:6px">第 ' + r[0] + ' 条：<b>公众号文章</b> · 微信不允许服务器抓正文，需要打开后手动复制正文。<a href="' + esc(r[1]) + '" target="_blank" rel="noopener">打开原文</a></div>';
  });
  web.forEach(function(r){
    html += '<div style="margin-top:6px">第 ' + r[0] + ' 条：<b>普通网页</b> · 可以自动抓取，复制到上方「识别网址」里用。<a href="' + esc(r[1]) + '" target="_blank" rel="noopener">打开</a></div>';
  });
  if (bad.length) html += '<div style="margin-top:6px">第 ' + bad.join('、') + ' 条：不是 http:// 或 https:// 开头的网址，先补全或删掉。</div>';
  html += '<div style="margin-top:8px;color:#64748b">公众号那条的用法：点「打开原文」→ 在微信里全选复制正文 → 粘贴到上方「正文内容」框 → 点「提炼」。</div>';
  out.innerHTML = html;
};

buildFilters();
const qEl = document.getElementById('q');
if (qEl){
  qEl.oninput = function(){
    QS = this.value.trim();
    renderScreen();
  };
}
renderScreen();
renderContest();
renderExam();
renderLecture();
renderImportant();
renderArchive();
renderTrash();
renderDrafts();
renderSites();
// 有云端配置就和云端对一次账（没配置就是空操作）
syncCloud();
bindRows();
counts();
if (!STORAGE_OK){
  setTimeout(function(){ toast('这个浏览器不让存本地数据，删除只在本次打开有效', 'err'); }, 800);
}
var saved = tokenGet();
const pe = document.getElementById('pushMail'); if (pe) pe.value = ld('nc_pushmail') || '';
</script>
</body>
</html>`;
}

/**
 * 邮件 HTML：内容与网页一致，做成适合邮箱阅读的卡片
 */
function mailHtml(items, config) {
  const body = items.map((n, i) => {
    const pts = (n.key_points || []).map((p) => `<li style="margin:0 0 4px 0">${esc(p)}</li>`).join('');
    return `<div style="background:#fff;border:1px solid #e6e8eb;border-left:4px solid #0f2a63;border-radius:10px;padding:14px 16px;margin-bottom:12px">
  <div style="font-size:12px;color:#6b7280;margin-bottom:6px">第 ${i + 1} 条 · ${esc(n.category)}${(n.tags || []).length ? ' · ' + (n.tags || []).map((t) => '#' + esc(t)).join(' ') : ''} · <span style="color:#0f2a63">${stars(n.score)}</span></div>
  <div style="font-size:16px;font-weight:600;line-height:1.5;margin-bottom:8px">${esc(n.title)}</div>
  ${n.event_time ? `<div style="background:#e6eeff;border:1px solid #b8cdf5;color:#0a2158;font-size:13px;padding:5px 10px;border-radius:8px;display:inline-block;margin-bottom:10px">时间：${esc(n.event_time)}</div>` : ''}
  <ul style="margin:0 0 10px 0;padding-left:18px;font-size:14px;color:#374151">${pts}</ul>
  <a href="${esc(n.url)}" style="font-size:13px;color:#0f2a63">打开原文 →</a>
  <div style="font-size:11px;color:#9ca3af;word-break:break-all;margin-top:4px">${esc(n.url)}</div>
</div>`;
  }).join('');

  return `<div style="background:#f6f7f9;padding:16px;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
  <div style="max-width:640px;margin:0 auto">
    <div style="font-size:18px;font-weight:600;margin-bottom:4px">${esc((config && config.site_title) || '学院信息筛选助手')}</div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:14px">${esc((config && config.college) || '')} · 新通知 ${items.length} 条</div>
    ${body}
  </div>
</div>`;
}

module.exports = { page, mailHtml, card, esc, stars };
