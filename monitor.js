import fs from 'fs';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import nodemailer from 'nodemailer';

const AI_KEY = process.env.ZHIPU_KEY;
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

let state = { initialized: false, seen: {} };
let notices = [];
let retryQueue = [];

try { if (fs.existsSync('./data/state.json')) state = JSON.parse(fs.readFileSync('./data/state.json', 'utf8')); } catch(e){}
if (!state.seen || typeof state.seen !== 'object' || Array.isArray(state.seen)) state.seen = {};
if (!state.initialized) state.initialized = false;

try { if (fs.existsSync('./data/notices.json')) notices = JSON.parse(fs.readFileSync('./data/notices.json', 'utf8')); } catch(e){}
try { if (fs.existsSync('./data/retry_queue.json')) retryQueue = JSON.parse(fs.readFileSync('./data/retry_queue.json', 'utf8')); } catch(e){}

async function sendMail(subject, html) {
    try {
        let transporter = nodemailer.createTransport({ 
            host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT), secure: true, 
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } 
        });
        await transporter.sendMail({ from: `"AI校园助手" <${process.env.SMTP_USER}>`, to: process.env.MAIL_TO, subject, html });
        console.log(`✅ 邮件发送: ${subject}`);
    } catch (err) { console.error("❌ 发邮件失败:", err.message); }
}

async function askAI(title, content) {
    if (!AI_KEY) return null;
    
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    // 新 Prompt：让 AI 自己决定要不要发邮件提醒 (should_alert)
    const prompt = `你是一个严谨的校园通知提取助手。今天是 ${dateStr}。请阅读以下通知，严格按 JSON 返回：
{
  "is_relevant": true或false (如果是获奖喜报、社团招新、活动总结等纯宣传内容填false),
  "is_expired": true或false (判断报名或活动时间是否已经早于今天。找不到时间填false),
  "should_alert": true或false (⭐核心字段：如果这件事需要学生立刻采取行动/有明确的近期截止日期/关乎评奖评优或考试，必须填true，以便发邮件提醒；如果是长期讲座、非紧急的背景说明，填false),
  "category": "类别",
  "custom_tags": ["标签"],
  "summary": "一句话摘要",
  "event_time": "时间",
  "key_points": ["要点1", "要点2"],
  "score": 1到5的整数 (5代表极紧急)
}
标题：${title}
正文：${content.substring(0, 3000)}`;

    try {
        const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_KEY}` },
            body: JSON.stringify({ model: "glm-4-flash", messages: [{ role: "user", content: prompt }], temperature: 0.1 })
        });
        if (!res.ok) return null;
        const data = await res.json();
        const match = data.choices[0].message.content.match(/\\{[\\s\\S]*\\}/);
        if (!match) return null;
        const parsed = JSON.parse(match[0]);
        
        if (typeof parsed.is_relevant !== 'boolean') return null;
        
        // 兜底防崩溃
        parsed.custom_tags = Array.isArray(parsed.custom_tags) ? parsed.custom_tags : [];
        parsed.key_points = Array.isArray(parsed.key_points) ? parsed.key_points : ['查看原文'];
        parsed.summary = parsed.summary || title;
        parsed.event_time = parsed.event_time || '详见原文';
        parsed.score = parseInt(parsed.score) || 3;
        parsed.is_expired = typeof parsed.is_expired === 'boolean' ? parsed.is_expired : false;
        // 如果 AI 忘了给 should_alert，默认若星级>=4就发
        parsed.should_alert = typeof parsed.should_alert === 'boolean' ? parsed.should_alert : (parsed.score >= 4);
        
        return parsed;
    } catch (e) { return null; }
}

function ruleEngine(title) {
    const ignoreList = ['社团招新', '喜报', '总结', '圆满结束', '顺利举办', '讲座回顾', '成功举办', '新闻稿', '侧记'];
    if (ignoreList.some(w => title.includes(w))) return { is_relevant: false, skip: true };
    
    if (title.includes('竞赛') || title.includes('考试') || title.includes('报名') || title.includes('评奖') || title.includes('选课')) {
        return { is_relevant: true, is_expired: false, should_alert: true, category: '重要', summary: title, score: 4, key_points: ['请查看原文详情'], custom_tags: [] };
    }
    return null;
}

async function fetchNewLinks(isBaseline) {
    let links = [];
    let allFailed = true;
    
    for (const site of config.sites) {
        if (!site.enabled) continue;
        try {
            const res = await fetch(site.url);
            const html = await res.text();
            const $ = cheerio.load(html);
            const elements = $('a').toArray();
            const siteSeen = state.seen[site.url] || [];
            if (!state.seen[site.url]) state.seen[site.url] = [];

            for (let el of elements) {
                const href = $(el).attr('href');
                if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href === '#') continue;
                const title = $(el).text().trim();
                if (title.length < 5) continue;

                let fullUrl;
                try { fullUrl = new URL(href, site.url).href; } catch { continue; }

                if (state.seen[site.url].includes(fullUrl)) continue;

                let content = "";
                try {
                    const detailRes = await fetch(fullUrl);
                    const detail$ = cheerio.load(await detailRes.text());
                    detail$('script, style').remove();
                    content = detail$('body').text().replace(/\\s+/g, ' ').trim();
                } catch (e) { content = ""; }

                links.push({ title, url: fullUrl, content, site: site.name });

                if (!isBaseline && links.length >= config.max_new_per_site) break;
                if (isBaseline && links.length >= 200) break;
            }
            allFailed = false;
        } catch (e) { console.log(`❌ 抓取失败: ${site.name}`); }
        if (!isBaseline && links.length >= config.max_new_per_site) break;
    }
    return { links, allFailed };
}

async function main() {
    const isBaseline = !state.initialized;
    const { links, allFailed } = await fetchNewLinks(isBaseline);

    if (isBaseline && allFailed) {
        await sendMail("【系统告警】首次抓取失败", "<p>所有栏目均不可达，请检查网址或网络。</p>");
        return;
    }

    const toProcess = [...retryQueue, ...links];
    let nextRetry = [], emailList = [];

    for (const item of toProcess) {
        let aiData = await askAI(item.title, item.content);
        let engine = 'ai';
        
        if (!aiData) { 
            aiData = ruleEngine(item.title); 
            engine = 'rule'; 
        }

        if (!aiData || !item.content || item.content.length < 50) {
            item.retry_count = (item.retry_count || 0) + 1;
            if (item.retry_count <= 3) nextRetry.push(item);
            continue;
        }

        // 明确不要的（跳过）
        if (aiData.skip || aiData.is_relevant === false) {
            const siteUrl = config.sites.find(s => item.url.includes(new URL(s.url).hostname))?.url;
            if (siteUrl && !state.seen[siteUrl].includes(item.url)) state.seen[siteUrl].push(item.url);
            continue;
        }

        // 留档
        const siteUrl = config.sites.find(s => item.url.includes(new URL(s.url).hostname))?.url;
        if (siteUrl && !state.seen[siteUrl].includes(item.url)) state.seen[siteUrl].push(item.url);

        const record = { ...item, ...aiData, engine, published_at: new Date().toLocaleDateString('zh-CN') };
        notices.unshift(record);

        // ⭐️ 核心判断：AI说需要发提醒(should_alert) 且 没过期(!is_expired)，才进邮箱！
        if (record.should_alert && !record.is_expired) {
            emailList.push(record);
        }
    }

    if (isBaseline) {
        state.initialized = true;
        console.log(`✅ 基线建立成功，共登记 ${links.length} 条。`);
    }

    fs.mkdirSync('./data', { recursive: true });
    fs.writeFileSync('./data/notices.json', JSON.stringify(notices, null, 2));
    fs.writeFileSync('./data/state.json', JSON.stringify(state, null, 2));
    fs.writeFileSync('./data/retry_queue.json', JSON.stringify(nextRetry, null, 2));
    
    fs.mkdirSync('./docs', { recursive: true });
    fs.writeFileSync('./docs/notices.json', JSON.stringify(notices, null, 2));

    // 邮件发送
    if (emailList.length > 0) {
        let html = emailList.map(n => `<h3>[${n.score}星] ${n.title}</h3><p><b>时间：</b>${n.event_time}</p><p>${n.summary}</p>`).join('<hr>');
        const prefix = isBaseline ? "【历史重要通知补发】" : "【重要新通知】";
        await sendMail(`${prefix}共${emailList.length}条`, html);
    }
    
    if (nextRetry.length > 5) {
        await sendMail("【系统告警】重试队列积压", `<p>当前有 ${nextRetry.length} 条解析失败。</p>`);
    }
}

main();
