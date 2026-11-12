/**
 * 抓取模块：栏目列表 + 文章正文
 *
 * 目标站点是高校常见的博达站群（例如 https://spxy.zjgsu.edu.cn/?tzgg.html）
 * 特点：列表页全是 /YYYY/MMDD/c数字a数字/page.htm 形式的链接，日期就藏在 URL 里
 */

const cheerio = require('cheerio');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

const NOTICE_HINT = /通知|公告|公示|安排|报名|征集|竞赛|比赛|讲座|沙龙|招聘|宣讲|招募|评选|申请|公示|调整|提醒|须知|办法|方案/;
const NAV_JUNK = /^(首页|学院概况|学院简介|现任领导|组织机构|师资队伍|人才培养|科学研究|党建工作|学生工作|招生就业|下载专区|English|English Version|联系我们|友情链接|更多|查看更多|上一页|下一页|尾页|首页\s*$)/;

// 文章页的 URL 形态：不同站群各不相同，按形态识别比按文本猜更可靠
const ARTICLE_URL = [
  /\?news\/\d+\.html$/,            // 学院站：?news/7134.html
  /\/view_\d+\.html$/,             // 校级新闻站：/18/view_23894.html
  /\/20\d{2}\/\d{4}\/c\d+a\d+\/page\.htm$/, // 教务处/学生处：/2026/1109/c1331a234407/page.htm
  /\/\d+\/c\d+a\d+\/page\.htm$/,   // 同上，无年份
];

// 微信公众号：正文容器固定是 #js_content，发布时间写在 var createTime = "YYYY-MM-DD HH:MM"
const WX_URL = /mp\.weixin\.qq\.com|weixin\.qq\.com/i;
const WX_BLOCKED = /环境异常|请在微信客户端打开|访问过于频繁|操作频繁|该内容已被发布者删除/;

/* ==================== 基础请求 ==================== */

async function fetchHtml(url, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      return new TextDecoder('utf-8').decode(buf);
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr || new Error('抓取失败');
}

/* ==================== 列表解析 ==================== */

function dateFromUrl(url) {
  const m = String(url).match(/(20\d{2})\/(\d{2})(\d{2})\/c\d+a\d+/)
    || String(url).match(/(20\d{2})\/(\d{2})(\d{2})\//);
  if (!m) return '';
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function cleanListTitle(raw) {
  let t = String(raw || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  // 去掉「[xxx]」「2026-11-09」「06 2026-11」这类前缀
  t = t.replace(/^\[[^\]]{1,20}\]\s*/, '')
    .replace(/^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?\s*/, '')
    .replace(/^\d{1,2}\s+\d{4}[-/]\d{1,2}\s*[/／]\s*/, '')
    .replace(/^【[^】]{1,20}】\s*/, '');
  return t.trim();
}

/**
 * 解析栏目列表页
 * @returns {Array<{title:string,url:string,date:string}>}
 */
function parseList(html, baseUrl) {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const map = new Map();

  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    if (/^(javascript:|#|mailto:|tel:)/i.test(href)) return;

    let abs;
    try { abs = new URL(href, base).toString(); } catch { return; }
    if (!abs.startsWith(base.origin)) return;
    if (/\.(pdf|docx?|xlsx?|zip|jpg|jpeg|png|gif|mp4)$/i.test(abs)) return;
    // 只认文章页，导航栏、栏目页、分页链接一律不要
    if (!ARTICLE_URL.some((re) => re.test(abs))) return;

    // 列表项标题：优先取 a 自身的文本，其次取父级 li 的文本
    let title = cleanListTitle($(el).text());
    if (!title || title.length < 8) {
      const liText = cleanListTitle($(el).closest('li').text());
      if (liText) title = liText;
    }
    title = title.replace(/\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}\s*$/, '').trim();

    if (title.length < 8 || title.length > 90) return;
    if ((title.match(/[\u4e00-\u9fa5]/g) || []).length < 6) return;
    if (NAV_JUNK.test(title)) return;
    if (!NOTICE_HINT.test(title)) return;

    const date = dateFromUrl(abs) || dateFromListText($(el).closest('li').text());
    if (map.has(abs)) {
      const old = map.get(abs);
      if (!old.date && date) old.date = date;
      return;
    }
    map.set(abs, { title, url: abs, date });
  });

  return Array.from(map.values());
}

function dateFromListText(text) {
  const s = String(text || '');
  const m = s.match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})/)
    || s.match(/\b(\d{1,2})[-/](\d{1,2})\b/);
  if (!m) return '';
  if (m.length === 4) {
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }
  return '';
}

/* ==================== 正文解析 ==================== */

function looksLikeCode(text) {
  return /function\s+\w+\s*\(|var\s+\w+\s*=|document\.|<\s*script|window\.|@media|font-family:/i.test(text);
}

function cleanLines(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0)
    .join('\n');
}

/**
 * 解析详情页：标题、正文、发布时间
 */
function parseDetail(html, url) {
  const $ = cheerio.load(html);
  const isWx = WX_URL.test(String(url));

  // 微信对机房 IP 有风控，被拦时拿到的是约 1.8 万字节的提示页，正文里几乎没有中文
  if (isWx && WX_BLOCKED.test(html)) {
    throw new Error('微信拦了这台服务器（环境异常提示页），这条只能在你自己网络下打开');
  }

  // 先把脚本、样式、导航这些干扰整块拆掉
  $('script, style, noscript').remove();
  $('.nav, ._menu, .layout, ._header, .toplink, .lyear-layout-sidebar-scroll, .wrap.hide').remove();

  // 标题：公众号优先用 og:title（微信 <title> 常常带后缀），其余站点用 <title>
  let title = '';
  if (isWx) {
    title = ($('meta[property="og:title"]').attr('content') || '').trim()
      || $('#activity-name').text().trim();
  }
  if (!title) {
    title = $('title').text().trim()
      .replace(/[|｜].*$/, '')
      .replace(/[-_]\s*(浙江工商大学|食品与生物工程学院).*$/, '')
      .trim();
  }
  if (!title) title = $('h1').first().text().trim();

  // 正文容器：按常见结构依次尝试，取中文最多的那个
  const selectors = [
    '#js_content',             // 微信公众号
    '.wp_articlecontent',      // 教务处 / 学生处
    '.Article_content',        // 部分校级站
    '.article',                // 教务处
    '.col-info',               // 学院站
    '.col-mainbox',
    '.content',
    '.warp',
    '#vsb_content',
    '.v_news_content',
    '.article-content',
  ];
  let body = '';
  for (const sel of selectors) {
    const node = $(sel).first();
    if (!node.length) continue;
    const text = tidyBody(nodeText(node), title);
    if ((text.match(/[\u4e00-\u9fa5]/g) || []).length > (body.match(/[\u4e00-\u9fa5]/g) || []).length) {
      body = text;
    }
  }

  // 发布时间：公众号读页面里的 createTime，其余站点从正文头部或 URL 找
  let published = '';
  if (isWx) {
    const cm = html.match(/createTime\s*=\s*[^\d]{0,3}(20\d{2}-\d{2}-\d{2})/);
    if (cm) published = cm[1];
  }
  const pageHead = cleanLines($('title').text() + '\n' + body).slice(0, 400);
  const dm = pageHead.match(/(20\d{2})-(\d{2})-(\d{2})/)
    || pageHead.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  if (dm) published = `${dm[1]}-${String(dm[2]).padStart(2, '0')}-${String(dm[3]).padStart(2, '0')}`;
  if (!published) published = dateFromUrl(url);

  if (looksLikeCode(body)) throw new Error('这个页面没抓到真正的正文');
  const cn = (body.match(/[\u4e00-\u9fa5]/g) || []).length;
  if (cn < 40) throw new Error('正文太短，可能抓错了页面');

  return { title: title || '', content: body, published_at: published };
}

/**
 * 把节点的 HTML 转成带换行的纯文本（cheerio 的 .text() 会丢掉 <br> 的换行）
 */
function nodeText(node) {
  let html = node.html() || '';
  html = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  html = html
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”');
  return cleanLines(html);
}

/**
 * 正文清洗：从整段里剥掉标题串、日期+阅读数、落款，再按行去掉面包屑等
 */
function tidyBody(rawText, title) {
  let t = cleanLines(rawText);

  // 1) 标题常常被复制粘贴进正文，整段去掉（容忍中间有空格）
  if (title) {
    const pattern = String(title).split('')
      .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*');
    try { t = t.replace(new RegExp(pattern, 'g'), ' '); } catch { /* 忽略 */ }
  }

  // 2) 「2026-11-09 45」这种日期 + 阅读数
  t = t.replace(/20\d{2}-\d{2}-\d{2}\s*\d{0,6}/g, ' ');

  // 3) 落款「教学管理科 2026年11月9日」
  t = t.replace(/(管理科|办公室|学院团委|学院|中心|处)\s*20\d{2}年\d{1,2}月\d{1,2}日/g, ' ');
  t = t.replace(/20\d{2}年\d{1,2}月\d{1,2}日\s*$/gm, ' ');

  const cleanTitle = String(title || '').replace(/\s+/g, '');
  return t
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => {
      if (!l) return false;
      if (/^当前位置/.test(l)) return false;
      if (/^首页\s*>/.test(l)) return false;
      if (/^(来源|作者|发布时间|浏览次数|阅读数)\s*[：:]/.test(l)) return false;
      if (/^(供稿|撰稿|摄影|编辑|审核)\s*[：:]/.test(l)) return false;
      if (cleanTitle && l.replace(/\s+/g, '') === cleanTitle) return false;
      if (/^\d{4}-\d{2}-\d{2}(\s+\d+)?$/.test(l)) return false;
      if (/^(上一篇|下一篇|返回|打印|关闭|分享到)/.test(l)) return false;
      if (l.length < 4) return false;
      return true;
    })
    .join('\n');
}

module.exports = {
  fetchHtml,
  parseList,
  parseDetail,
  dateFromUrl,
  cleanListTitle,
  NOTICE_HINT,
};
