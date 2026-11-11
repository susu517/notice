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

// 【修复3】：AI 失败时返回 null，不瞎猜
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
        if (!match) return null;
        const parsed = JSON.parse(match[0]);
        // 归一化防崩
        if (typeof parsed.is_relevant !== 'boolean') return null;
        parsed.custom_tags = Array.isArray(parsed.custom_tags) ? parsed.custom_tags : [];
        parsed.key_points = Array.isArray(parsed.key_points) ? parsed.key_points : ['查看原文'];
        parsed.summary = parsed.summary || title;
        parsed.event_time = parsed.event_time || '详见原文';
        parsed.score = parseInt(parsed.score) || 3;
        return parsed;
    } catch (e) { return null; }
}

// 【修复3】：规则引擎改造。明显不要的直接扔掉，明显要的留下，拿不准的返回 null 进重试队列
function ruleEngine(title) {
    const ignoreList = ['社团招新', '喜报', '总结', '圆满结束', '顺利举办', '讲座回顾', '成功举办', '新闻稿', '侧记'];
    if (ignoreList.some(w => title.includes(w))) return { is_relevant: false, skip: true };
    
    if (title.includes('竞赛') || title.includes('考试') || title.includes('报名') || title.includes('评奖') || title.includes('选课')) {
        return { is_relevant: true, category: '重要', summary: title, score: 3, key_points: ['请查看原文详情'], custom_tags: [] };
    }
    // 拿不准的，交给重试队列
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

                // 【修复1】：先用 fullUrl 判重，绝对不漏
                if (state.seen[site.url].includes(fullUrl)) continue;

                let content = "";
                try {
                    const detailRes = await fetch(fullUrl);
                    const detail$ = cheerio.load(await detailRes.text());
                    detail$('script, style').remove();
                    content = detail$('body').text().replace(/\\s+/g, ' ').trim();
                } catch (e) { content = ""; }

                links.push({ title, url: fullUrl, content, site: site.name });

                // 【修复2】：如果是首跑基线，不限制条数（最多抓200条防止超时）；如果是日常轮，限制6条
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
        
        // 如果 AI 失败，用规则兜底
        if (!aiData) { 
            aiData = ruleEngine(item.title); 
            engine = 'rule'; 
        }

        // 【修复3】：AI和规则都判不出，或者正文抓不到，进重试队列，绝不标已读！
        if (!aiData || !item.content || item.content.length < 50) {
            item.retry_count = (item.retry_count || 0) + 1;
            if (item.retry_count <= 3) {
                nextRetry.push(item);
            }
            continue;
        }

        // 明确不要的（喜报等），直接打入冷宫
        if (aiData.skip || aiData.is_relevant === false) {
            if (!state.seen[item.site]?.includes(item.url)) {
                const siteUrl = config.sites.find(s => item.url.includes(new URL(s.url).hostname))?.url;
                if (siteUrl && !state.seen[siteUrl].includes(item.url)) state.seen[siteUrl].push(item.url);
            }
            continue;
        }

        // 明确要的，标记已读，存入数据库
        const siteUrl = config.sites.find(s => item.url.includes(new URL(s.url).hostname))?.url;
        if (siteUrl && !state.seen[siteUrl].includes(item.url)) state.seen[siteUrl].push(item.url);

        const record = { ...item, ...aiData, engine, published_at: new Date().toLocaleDateString('zh-CN') };
        notices.unshift(record);

        // 【修复2】：如果是首跑基线，只入库，绝对不发邮件！
        if (!isBaseline) {
            emailList.push(record);
        }
    }

    if (isBaseline) {
        state.initialized = true;
        console.log(`✅ 基线建立成功，共登记 ${links.length} 条历史通知。`);
    }

    // 保存数据（给网页和机器人）
    fs.mkdirSync('./data', { recursive: true });
    fs.writeFileSync('./data/notices.json', JSON.stringify(notices, null, 2));
    fs.writeFileSync('./data/state.json', JSON.stringify(state, null, 2));
    fs.writeFileSync('./data/retry_queue.json', JSON.stringify(nextRetry, null, 2));
    
    fs.mkdirSync('./docs', { recursive: true });
    fs.writeFileSync('./docs/notices.json', JSON.stringify(notices, null, 2));

    // 发日常邮件
    if (emailList.length > 0) {
        let html = emailList.map(n => `<h3>[${n.score}星] ${n.title}</h3><p>${n.summary}</p>`).join('<hr>');
        const urgentCount = emailList.filter(n => n.score >= 4).length;
        await sendMail(urgentCount > 0 ? `【需要处理${urgentCount}条】新通知` : `【校园通知】发现${emailList.length}条新动态`, html);
    }
    
    // 积压告警
    if (nextRetry.length > 5) {
        await sendMail("【系统告警】重试队列积压", `<p>当前有 ${nextRetry.length} 条通知解析失败，请检查网络或AI接口。</p>`);
    }
}

main();
