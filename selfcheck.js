/**
 * 部署自检：不需要联网、不需要密钥，检查这份仓库能不能跑起来。
 * 在 Actions 里手动点「部署自检」即可，日志会逐项告诉你哪里不对。
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ok = [];
const warn = [];
const bad = [];

function check(label, cond, detail) {
  if (cond) ok.push(`${label}${detail ? '　' + detail : ''}`);
  else bad.push(`${label}${detail ? '　' + detail : ''}`);
}

function soft(label, cond, detail) {
  if (cond) ok.push(`${label}${detail ? '　' + detail : ''}`);
  else warn.push(`${label}${detail ? '　' + detail : ''}`);
}

console.log('===== 学院信息筛选助手 · 部署自检 =====\n');

// ---------- 1. 必需文件 ----------
const files = ['monitor.js', 'crawler.js', 'screener.js', 'ai.js', 'render.js', 'config.json', 'package.json'];
const missing = files.filter((f) => !fs.existsSync(path.join(ROOT, f)));
check('核心文件齐全', missing.length === 0, missing.length ? '缺少：' + missing.join('、') : `共 ${files.length} 个`);

const wf = ['monitor.yml', 'push.yml', 'extract.yml', 'test-mail.yml'];
const wfMissing = wf.filter((f) => !fs.existsSync(path.join(ROOT, '.github/workflows', f)));
check('定时任务文件齐全', wfMissing.length === 0, wfMissing.length ? '缺少：' + wfMissing.join('、') : `共 ${wf.length} 个`);

// ---------- 2. 配置 ----------
let cfg = null;
try {
  cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  check('config.json 格式正确', true, `栏目 ${(cfg.sites || []).length} 个`);
} catch (e) {
  bad.push('config.json 无法解析：' + e.message + '（多半是复制粘贴时少了逗号或引号）');
}

if (cfg) {
  const enabled = (cfg.sites || []).filter((s) => s.enabled !== false);
  check('已启用栏目', enabled.length > 0, `${enabled.length} 个启用，${(cfg.sites || []).length - enabled.length} 个停用`);
  const badUrl = (cfg.sites || []).filter((s) => !/^https?:\/\//.test(s.url || ''));
  check('栏目地址格式', badUrl.length === 0, badUrl.length ? '以下不是完整网址：' + badUrl.map((s) => s.name).join('、') : '全部以 http 开头');
  check('AI 开关', !!(cfg.ai && cfg.ai.enabled), cfg.ai && cfg.ai.enabled ? `已开启，模型 ${cfg.ai.model}` : '已关闭，全部走规则');
}

// ---------- 3. 数据文件 ----------
function probe(file, fallback) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return { exists: false, value: null };
  try {
    return { exists: true, value: JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch (e) {
    return { exists: true, value: null, error: e.message };
  }
}

const notices = probe('data/notices.json', []);
if (notices.error) bad.push('data/notices.json 无法解析：' + notices.error);
else if (!notices.exists) soft('data/notices.json', true, '还没生成，第一轮跑完自动出现');
else if (Array.isArray(notices.value)) check('留档文件', true, `${notices.value.length} 条已留档`);
else bad.push('data/notices.json 应该是数组（以 [ 开头），现在是别的结构');

const state = probe('data/state.json', {});
if (state.error) bad.push('data/state.json 无法解析：' + state.error);
else if (!state.exists) soft('data/state.json', true, '还没生成，第一轮跑完自动出现');
else {
  const v = state.value || {};
  // 程序会自动补齐，这里只提示状态
  soft('基线状态', v.seeded === true, v.seeded === true ? '首次登记已完成，之后抓到的才算新通知' : '尚未完成首次登记，下一轮或手动点一次即可');
}

// ---------- 4. 判定引擎能不能真的跑 ----------
try {
  const screener = require('./screener');
  const sample = screener.screenOne({
    title: '关于举办2026年大学生化学竞赛校内选拔赛的通知',
    url: 'https://example.com/test',
    content: '初赛时间：2026年11月20日。决赛时间：2026年12月5日。报名截止：2026年11月18日。请各班统一填写附件一报名表。',
    published_at: '2026-11-10',
  });
  check('判定引擎可用', !!sample, sample ? `${sample.category} / ${sample.score} 星 / ${sample.event_time}` : '样例返回空');
} catch (e) {
  bad.push('判定引擎跑不起来：' + e.message);
}

// ---------- 5. 网页 ----------
const idx = path.join(ROOT, 'docs/index.html');
if (fs.existsSync(idx)) {
  const h = fs.readFileSync(idx, 'utf8');
  soft('网页文件', h.length > 5000 && h.includes('<script'), `${h.length} 字节`);
  soft('禁止 Jekyll 处理', fs.existsSync(path.join(ROOT, 'docs/.nojekyll')), fs.existsSync(path.join(ROOT, 'docs/.nojekyll')) ? '标记文件在' : '缺 .nojekyll，页面可能打不开');
} else {
  warn.push('docs/index.html 还不存在，第一轮跑完会自动生成');
}

// ---------- 6. 密钥（只看有没有，绝不打印内容） ----------
const key = (name, label, need) => {
  const has = !!(process.env[name] && String(process.env[name]).trim());
  if (has) ok.push(`${label}　已配置`);
  else if (need) bad.push(`${label}　没配置`);
  else warn.push(`${label}　没配置（可选，不影响运行）`);
};
key('SMTP_USER', 'QQ 邮箱账号', false);
key('SMTP_PASS', 'QQ 邮箱授权码', false);
key('ZHIPU_KEY', 'AI 密钥（智谱）', false);
soft('收件邮箱', !!(process.env.MAIL_TO || process.env.SMTP_USER), process.env.MAIL_TO ? '已单独指定' : '未指定，默认发给自己');

// ---------- 7. 工作流权限与部署后的常见坑 ----------
// monitor 写数据与网页、extract 写识别结果，这两个必须有写权限；
// push 只是读数据发信，不需要写，缺了也不算问题
['monitor.yml', 'extract.yml'].forEach((f) => {
  const p = path.join(ROOT, '.github/workflows', f);
  if (!fs.existsSync(p)) return;
  const t = fs.readFileSync(p, 'utf8');
  if (!t.includes('contents: write')) bad.push(`${f} 缺少 contents: write 权限，跑完无法把结果写回仓库`);
  if (!t.includes('TZ: Asia/Shanghai')) warn.push(`${f} 没锁时区，凌晨运行时日期可能记成前一天`);
});
soft('仓库名', true, '当前包名 ' + ((cfg && cfg.__name) || 'notice') + '；GitHub 仓库名必须是 notice，网址才是 /notice/');

// ---------- 输出 ----------
console.log('\n【必须通过】');
if (bad.length) bad.forEach((b) => console.log('  ✗ ' + b));
else console.log('  全部通过');

if (warn.length) {
  console.log('\n【可以忽略，但值得看一眼】');
  warn.forEach((w) => console.log('  - ' + w));
}

console.log('\n【已通过】');
ok.forEach((o) => console.log('  ✓ ' + o));

console.log('\n===== 结论 =====');
if (bad.length) {
  console.log(`发现 ${bad.length} 处必须修复的问题，按上面逐条改，改完再点一次这个自检。`);
  process.exitCode = 1;
} else {
  const mailReady = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  if (mailReady) console.log('这份仓库可以跑，邮件推送已就绪。接下来：');
  else console.log('这份仓库可以跑，但邮箱还没配，暂时收不到推送（网页照常更新）。接下来：');
  console.log('  1) Actions → 学院信息自动检查 → Run workflow，先跑一次建基线（只登记，不发邮件）');
  console.log('  2) Settings → Pages → Deploy from a branch → main → /docs，生成网址');
  console.log('  3) 点「测试邮件推送」确认邮箱通不通');
}
