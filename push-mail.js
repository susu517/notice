/**
 * 手动推送：把留档里最新的若干条提炼结果，按一封邮件发出去
 *
 * 用法：
 *   node push-mail.js            默认发最新 5 条
 *   node push-mail.js 11         发最新 11 条（全部）
 *
 * 由网页上的「立即推送」按钮触发 GitHub Actions 运行本脚本。
 * 需要环境变量 SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_TO。
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const notices = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'notices.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const { sendMail } = require('./monitor');

async function main() {
  const count = Math.max(1, Number(process.argv[2]) || 5);
  const onlyUrl = String(process.argv[3] || '').trim();

  // 单条推送：网页上某条记录的「推送」按钮传原文链接过来
  let items;
  if (onlyUrl) {
    const hit = notices.find((n) => n.url === onlyUrl);
    items = hit ? [hit] : [];
    if (!items.length) {
      console.log('留档里找不到这条链接：' + onlyUrl);
      process.exit(1);
    }
  } else {
    items = notices.slice(0, count);
  }

  if (!items.length) {
    console.log('留档是空的，没有可推送的内容。');
    return;
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('缺少邮箱配置：SMTP_USER / SMTP_PASS 未设置，无法发信。');
    process.exit(1);
  }

  await sendMail(items);
  console.log(`已推送 ${items.length} 条：`);
  items.forEach((n, i) => console.log(`  ${i + 1}. ${n.published_at || '无日期'} | ${n.category} | 星${n.score} | ${n.title}`));
}

if (require.main === module) {
  main().catch((e) => {
    console.error('推送失败：', e.message);
    process.exit(1);
  });
}

module.exports = { main };
