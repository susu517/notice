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
    const prompt = `你是一个校园通知提取助手。请严格按JSON返回：{"is_relevant": true或false, "category": "类别", "custom_tags": ["标签"], "summary": "摘要", "event_time": "时间", "key_points": ["要点"], "score": 1到5的整数}\\n标题：${title}\\n正文：${content.substring(0, 3000)}`;
    try {
        const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_KEY}` },
            body: JSON.stringify({ model: "glm-4-flash", messages: [{ role: "user", content: prompt }], temperature: 0.1 })
        });
        if (!res.ok) return null;
        const data = await res.json();
        const match = data.choices[0].message.content.match(/\\{[\\s\\S]*\\}/);
        return match ? JSON.parse(match[0]) : null;
    } catch (e) { return null; }
}

function ruleEngine(title) {
    if (title.includes('社团招新') || title.includes('喜报') || title.includes('总结')) return { is_relevant: false };
    if (title.includes('竞赛') || title.includes('考试')) return { is_relevant: true, category: '教务', summary: title, score: 3, key_points: ['查看原文'], custom_tags: [] };
    return { is_relevant: true, category: '其他', summary: title, score: 2, key_points: ['查看原文'], custom_tags: [] };
}

async function fetchNewLinks() {
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
            for (let el of elements) {
                const url = $(el).attr('href');
                const title = $(el).text().trim();
                if (!url || title.length < 5 || siteSeen.includes(url)) continue;
                const fullUrl = url.startsWith('http') ? url : new URL(url, site.url).href;
                let content = "";
                try {
                    const detailRes = await fetch(fullUrl);
                    const detail$ = cheerio.load(await detailRes.text());
                    detail$('script, style').remove();
                    content = detail$('body').text().replace(/\\s+/g, ' ').trim();
                } catch (e) { content = ""; }
                links.push({ title, url: fullUrl, content, site: site.name });
                if (links.length >= config.max_new_per_site) break;
            }
            allFailed = false;
        } catch (e) { console.log(`❌ 抓取失败: ${site.name}`); }
        if (links.length >= config.max_new_per_site) break;
    }
    return { links, allFailed };
}

async function main() {
    const { links, allFailed } = await fetchNewLinks();
    if (!state.initialized) {
        if (!allFailed) {
            for (const site of config.sites) if (!state.seen[site.url]) state.seen[site.url] = [];
            links.forEach(l => {
                const siteUrl = config.sites.find(s => l.url.includes(new URL(s.url).hostname))?.url;
                if (siteUrl) state.seen[siteUrl].push(l.url);
            });
            state.initialized = true;
            fs.mkdirSync('./data', { recursive: true });
            fs.writeFileSync('./data/state.json', JSON.stringify(state, null, 2));
            console.log(`✅ 基线建立成功，登记 ${links.length} 条。`);
        } else {
            await sendMail("【系统告警】首次抓取失败", "<p>所有栏目均不可达，请检查网址或网络。</p>");
        }
        return;
    }

    const toProcess = [...retryQueue, ...links];
    let nextRetry = [], emailList = [];

    for (const item of toProcess) {
        let aiData = await askAI(item.title, item.content);
        let engine = 'ai';
        if (!aiData) { aiData = ruleEngine(item.title); engine = 'rule'; }
        if (item.content && item.content.length > 50) {
            const siteUrl = config.sites.find(s => item.url.includes(new URL(s.url).hostname))?.url;
            if (siteUrl && !state.seen[siteUrl].includes(item.url)) state.seen[siteUrl].push(item.url);
        } else if (!item.content) {
            item.retry_count = (item.retry_count || 0) + 1;
            if (item.retry_count <= 3) nextRetry.push(item);
            continue; 
        }
        if (aiData && aiData.is_relevant) {
            const record = { ...item, ...aiData, engine, published_at: new Date().toLocaleDateString('zh-CN') };
            notices.unshift(record);
            emailList.push(record);
        }
    }

    fs.mkdirSync('./data', { recursive: true });
    fs.writeFileSync('./data/notices.json', JSON.stringify(notices, null, 2));
    fs.writeFileSync('./data/state.json', JSON.stringify(state, null, 2));
    fs.writeFileSync('./data/retry_queue.json', JSON.stringify(nextRetry, null, 2));

    if (emailList.length > 0) {
        let html = emailList.map(n => `<h3>[${n.score}星] ${n.title}</h3><p>${n.summary}</p>`).join('<hr>');
        const urgentCount = emailList.filter(n => n.score >= 4).length;
        await sendMail(urgentCount > 0 ? `【需要处理${urgentCount}条】新通知` : `【校园通知】发现${emailList.length}条新动态`, html);
    }
    if (allFailed) await sendMail("【系统告警】栏目抓取失败", "<p>请检查网址。</p>");
}

main();
