/**
 * 测试邮件推送：在 GitHub Actions 里手动点一次「测试邮件推送」就能跑
 * 只发一封，内容用现有留档的前 2 条（没有就用一条示例）
 */

const fs = require('fs');
const nodemailer = require('nodemailer');
const render = require('./render');

const ROOT = __dirname;
const config = JSON.parse(fs.readFileSync(ROOT + '/config.json', 'utf8'));

let sample = [];
try {
  sample = JSON.parse(fs.readFileSync(ROOT + '/data/notices.json', 'utf8')).slice(0, 2);
} catch {
  sample = [];
}
if (!sample.length) {
  sample = [{
    title: '这是一封测试邮件（说明推送配置已经通了）',
    url: 'https://spxy.zjgsu.edu.cn/?tzgg.html',
    category: '讲座报告',
    score: 4,
    event_time: '11月11日（周三）上午8:05',
    key_points: ['这条是示例内容，用来确认邮件能正常收到', '正式推送会换成官网真实通知', '每条都会带分类、星级、时间、要点和原文链接'],
    site: '测试',
  }];
}

const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

if (!user || !pass) {
  console.error('缺少 SMTP_USER 或 SMTP_PASS，请先在仓库 Secrets 里配置。');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.qq.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: { user, pass },
});

const to = process.env.MAIL_TO || user;

transporter.sendMail({
  from: user,
  to,
  subject: '【测试】学院信息推送配置成功',
  html: render.mailHtml(sample, config),
}, (err, info) => {
  if (err) {
    console.error('发送失败：', err.message);
    console.error('常见原因：1) 用了登录密码而不是授权码 2) 授权码已失效 3) 邮箱没开启 SMTP 服务');
    process.exit(1);
  }
  console.log('发送成功 →', to);
  console.log('服务器返回：', info.response || '(无)');
});
