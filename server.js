// 爱学 · AiXue 服务器
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 8900;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ============ 验证码存储 ============
// 格式: { email: { code, expiresAt } }
const codeStore = new Map();

// 清理过期验证码
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of codeStore) {
    if (data.expiresAt < now) codeStore.delete(email);
  }
}, 60000);

// ============ SMTP 配置 ============
function getTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null; // 演示模式
  
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_PORT === '465' || !process.env.SMTP_PORT,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ============ API: 发送验证码 ============
app.post('/api/send-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.json({ ok: false, error: '请输入有效的邮箱地址' });
    }

    // 生成6位验证码
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10分钟有效

    const transporter = getTransporter();
    if (!transporter) {
      // 演示模式：直接返回验证码
      codeStore.set(email, { code, expiresAt });
      console.log(`[DEMO] 验证码 for ${email}: ${code}`);
      return res.json({ ok: true, message: '演示模式，验证码已显示在控制台', demoCode: code });
    }

    // 发送邮件
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: '爱学 · 邮箱验证码',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f8f9fa; border-radius: 12px;">
          <div style="text-align: center; font-size: 32px; margin-bottom: 16px;">📚</div>
          <h2 style="text-align: center; color: #333;">爱学 · 邮箱验证</h2>
          <p style="color: #555; font-size: 14px;">你的验证码是：</p>
          <div style="text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #4F46E5; background: #fff; padding: 16px; border-radius: 8px; margin: 16px 0;">
            ${code}
          </div>
          <p style="color: #999; font-size: 12px;">验证码 10 分钟内有效，请勿泄露给他人。</p>
          <p style="color: #bbb; font-size: 11px; margin-top: 24px;">爱学 · 你的 FCE 英语学习助手</p>
        </div>
      `,
    });

    codeStore.set(email, { code, expiresAt });
    console.log(`[SMTP] 验证码已发送到 ${email}`);
    res.json({ ok: true, message: '验证码已发送到你的邮箱，请查收' });
  } catch (err) {
    console.error('[ERROR] 发送验证码失败:', err.message);
    res.json({ ok: false, error: '发送失败: ' + err.message });
  }
});

// ============ API: 验证验证码 ============
app.post('/api/verify-code', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.json({ ok: false, error: '参数不完整' });
  }

  const stored = codeStore.get(email);
  if (!stored) {
    return res.json({ ok: false, error: '请先获取验证码' });
  }
  if (stored.expiresAt < Date.now()) {
    codeStore.delete(email);
    return res.json({ ok: false, error: '验证码已过期，请重新获取' });
  }
  if (stored.code !== code) {
    return res.json({ ok: false, error: '验证码错误' });
  }

  // 验证成功，清除已用的验证码
  codeStore.delete(email);
  res.json({ ok: true, message: '验证成功' });
});

// ============ 健康检查 ============
app.get('/api/health', (req, res) => {
  const smtpOk = !!process.env.SMTP_HOST;
  res.json({
    status: 'ok',
    smtp: smtpOk ? 'configured' : 'demo-mode',
    codeCount: codeStore.size,
    time: new Date().toISOString(),
  });
});

// ============ 启动 ============
app.listen(PORT, '0.0.0.0', () => {
  const mode = process.env.SMTP_HOST ? 'SMTP邮件模式' : '演示模式（验证码打印在控制台）';
  console.log(`🚀 爱学运行在 http://0.0.0.0:${PORT}`);
  console.log(`📧 邮件模式: ${mode}`);
  console.log(`📖 http://localhost:${PORT}/aixue.html`);
});
