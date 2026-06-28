// 爱学 · 后端服务器
// Email验证码 + 用户注册登录

const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8900;

app.use(express.json());

// ========== 数据存储（内存 + JSON文件持久化） ==========
const DATA_FILE = path.join(__dirname, 'users.json');
const CODES = {}; // email -> { code, time }

function loadUsers() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) { console.error('Load users error:', e.message); }
  return {};
}

function saveUsers(users) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

// ========== SMTP 配置 ==========
// 通过环境变量配置，DEFAULT_MODE=true 时只展示验证码不全量发送
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || '',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_SECURE === 'false' ? false : true,
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
};

const DEMO_MODE = !SMTP_CONFIG.host;
if (DEMO_MODE) {
  console.log('📧 演示模式：验证码会显示在控制台和API响应中');
  console.log('📧 配置 SMTP_HOST/SMTP_USER/SMTP_PASS 后可发送真实邮件');
} else {
  console.log(`📧 邮件模式：使用 ${SMTP_CONFIG.host} 发送邮件`);
}

// ========== 邮件发送 ==========
async function sendEmail(to, code) {
  if (DEMO_MODE) {
    console.log(`[演示] 验证码 ${code} 已发送到 ${to}`);
    return { success: true, demo: true, code };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_CONFIG.host,
      port: SMTP_CONFIG.port,
      secure: SMTP_CONFIG.secure,
      auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
    });

    await transporter.sendMail({
      from: SMTP_CONFIG.from,
      to,
      subject: '爱学 · 验证码',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #4F86F7;">📚 爱学 · 验证码</h2>
          <p>你好！</p>
          <p>你的验证码是：</p>
          <div style="font-size: 32px; font-weight: bold; color: #4F86F7; 
                      text-align: center; padding: 20px; 
                      background: #E8F0FE; border-radius: 12px; 
                      margin: 20px 0; letter-spacing: 8px;">
            ${code}
          </div>
          <p style="color: #7F8C9B; font-size: 13px;">验证码5分钟内有效，请勿泄露给他人。</p>
          <hr style="border: none; border-top: 1px solid #E8ECF3;">
          <p style="color: #7F8C9B; font-size: 12px;">爱学 · FCE英语学习助手</p>
        </div>
      `,
    });

    console.log(`✅ 邮件已发送到 ${to}`);
    return { success: true };
  } catch (e) {
    console.error(`❌ 发送邮件失败: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// ========== API 路由 ==========

// 发送验证码
app.post('/api/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.json({ success: false, error: '请输入正确的邮箱地址' });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  CODES[email] = { code, time: Date.now() };

  const result = await sendEmail(email, code);

  if (result.success) {
    // 演示模式下返回验证码（前端可展示）
    const response = { success: true };
    if (result.demo) {
      response.demo = true;
      response.code = code;
    }
    res.json(response);
  } else {
    res.json({ success: false, error: '验证码发送失败，请检查邮箱地址或联系管理员' });
  }
});

// 验证验证码
app.post('/api/verify-code', (req, res) => {
  const { email, code } = req.body;
  const record = CODES[email];

  if (!record) {
    return res.json({ success: false, error: '请先获取验证码' });
  }
  if (Date.now() - record.time > 5 * 60 * 1000) {
    delete CODES[email];
    return res.json({ success: false, error: '验证码已过期，请重新获取' });
  }
  if (record.code !== code) {
    return res.json({ success: false, error: '验证码错误' });
  }

  delete CODES[email]; // 验证后失效
  res.json({ success: true });
});

// 注册
app.post('/api/register', async (req, res) => {
  const { email, name, password, code } = req.body;

  if (!email || !name || !password || !code) {
    return res.json({ success: false, error: '请填写完整信息' });
  }
  if (password.length < 6) {
    return res.json({ success: false, error: '密码至少6位' });
  }

  // 验证码校验
  const record = CODES[email];
  if (!record || record.code !== code) {
    return res.json({ success: false, error: '验证码错误或已过期' });
  }
  if (Date.now() - record.time > 5 * 60 * 1000) {
    delete CODES[email];
    return res.json({ success: false, error: '验证码已过期' });
  }
  delete CODES[email];

  const users = loadUsers();
  if (users[email]) {
    return res.json({ success: false, error: '该邮箱已注册，请直接登录' });
  }

  // Check if teacher assigned a level for this student
  const allUsers = loadUsers();
  let assignedLevel = '';
  for (const key of Object.keys(allUsers)) {
    const u = allUsers[key];
    if (u.students && u.students.find(s => s.email === email)) {
      const student = u.students.find(s => s.email === email);
      assignedLevel = student.level || '';
      break;
    }
  }

  users[email] = { email, name, password, assignedLevel, createdAt: Date.now() };
  saveUsers(users);

  res.json({ success: true, user: { email, name, role: '', assignedLevel } });
});

// 登录（验证码登录）
app.post('/api/login', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.json({ success: false, error: '请填写邮箱和验证码' });
  }

  const users = loadUsers();
  if (!users[email]) {
    return res.json({ success: false, error: '该邮箱未注册，请先注册' });
  }

  const record = CODES[email];
  if (!record || record.code !== code) {
    return res.json({ success: false, error: '验证码错误或已过期' });
  }
  if (Date.now() - record.time > 5 * 60 * 1000) {
    delete CODES[email];
    return res.json({ success: false, error: '验证码已过期' });
  }
  delete CODES[email];

  const u = users[email];
  res.json({ success: true, user: { email, name: u.name, role: u.role || '', assignedLevel: u.assignedLevel || '' } });
});

// 设置身份
app.post('/api/set-role', (req, res) => {
  const { email, role } = req.body;
  const roles = ['student','parent','teacher'];
  if (!email || !roles.includes(role)) {
    return res.json({ success: false, error: '参数错误' });
  }
  const users = loadUsers();
  if (!users[email]) {
    return res.json({ success: false, error: '用户不存在' });
  }
  users[email].role = role;
  saveUsers(users);
  res.json({ success: true, user: { email, name: users[email].name, role } });
});

// 快速登录/体验账号
app.post('/api/quick-login', (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, error: '请指定账号' });

  const users = loadUsers();
  if (!users[email]) {
    // 自动创建体验账号
    const name = email === 'teacher@aixue.com' ? '李老师'
               : email === 'student@aixue.com' ? '小明同学'
               : '体验用户';
    // Assign default role based on email
    const defaultRole = email === 'teacher@aixue.com' ? 'teacher'
                      : email === 'student@aixue.com' ? 'student'
                      : '';
    users[email] = { email, name, password: '123456', createdAt: Date.now(), demo: true, role: defaultRole };
    saveUsers(users);
  }

  const u = users[email];
  res.json({ success: true, user: { email, name: u.name, role: u.role || '', assignedLevel: u.assignedLevel || '' } });
});

// 检查登录状态
app.post('/api/check-session', (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ valid: false });

  const users = loadUsers();
  const u = users[email];
  res.json({ valid: !!u, user: u ? { email, name: u.name, role: u.role || '', assignedLevel: u.assignedLevel || '' } : null });
});

// ========== 学生管理（老师/家长功能） ==========

// 获取学生列表
app.post('/api/students', (req, res) => {
  const { email } = req.body;
  const users = loadUsers();
  const u = users[email];
  if (!u) return res.json({ success: false, error: '用户不存在' });
  const students = u.students || [];
  res.json({ success: true, students });
});

// 添加学生
app.post('/api/students/add', (req, res) => {
  const { teacherEmail, studentEmail, studentName, level } = req.body;
  const levels = ['YLE','KET','PET','FCE','CAE','CPE','IELTS','TOEFL'];
  if (!levels.includes(level)) return res.json({ success: false, error: '无效的考试级别' });

  const users = loadUsers();
  const teacher = users[teacherEmail];
  if (!teacher) return res.json({ success: false, error: '老师账号不存在' });

  if (!teacher.students) teacher.students = [];
  // Check if already added
  if (teacher.students.find(s => s.email === studentEmail)) {
    return res.json({ success: false, error: '该学生已在列表中' });
  }

  teacher.students.push({ email: studentEmail, name: studentName || '学生', level });
  
  // Also set assignedLevel on the student account if it exists
  if (users[studentEmail]) {
    users[studentEmail].assignedLevel = level;
  }
  
  saveUsers(users);
  res.json({ success: true, students: teacher.students });
});

// 更新学生级别
app.post('/api/students/update', (req, res) => {
  const { teacherEmail, studentEmail, level } = req.body;
  const levels = ['YLE','KET','PET','FCE','CAE','CPE','IELTS','TOEFL'];
  if (!levels.includes(level)) return res.json({ success: false, error: '无效的考试级别' });

  const users = loadUsers();
  const teacher = users[teacherEmail];
  if (!teacher || !teacher.students) return res.json({ success: false, error: '老师或学生列表不存在' });

  const student = teacher.students.find(s => s.email === studentEmail);
  if (!student) return res.json({ success: false, error: '未找到该学生' });
  
  student.level = level;
  if (users[studentEmail]) {
    users[studentEmail].assignedLevel = level;
  }
  
  saveUsers(users);
  res.json({ success: true, students: teacher.students });
});

// 删除学生
app.post('/api/students/remove', (req, res) => {
  const { teacherEmail, studentEmail } = req.body;
  const users = loadUsers();
  const teacher = users[teacherEmail];
  if (!teacher || !teacher.students) return res.json({ success: false, error: '老师或学生列表不存在' });
  
  teacher.students = teacher.students.filter(s => s.email !== studentEmail);
  if (users[studentEmail]) {
    users[studentEmail].assignedLevel = undefined;
  }
  
  saveUsers(users);
  res.json({ success: true, students: teacher.students });
});

// ========== 静态文件 ==========
app.use(express.static(path.join(__dirname)));

// 启动
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 爱学服务器运行在 http://0.0.0.0:${PORT}`);
  console.log(`📖 访问地址: http://localhost:${PORT}/aixue.html`);
  if (!DEMO_MODE) {
    console.log(`📧 邮件已配置：${SMTP_CONFIG.user} @ ${SMTP_CONFIG.host}`);
  }
});
