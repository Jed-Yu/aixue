// 爱学 · 后端服务器 - 完整版

const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8900;

app.use(express.json());

// ========== 数据文件 ==========
const USERS_FILE = path.join(__dirname, 'users.json');
const CLASSES_FILE = path.join(__dirname, 'classes.json');
const HOMEWORK_FILE = path.join(__dirname, 'homework.json');
const CODES = {};

function loadJSON(file) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('Load', file, 'error:', e.message); }
  return {};
}
function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function loadUsers() { return loadJSON(USERS_FILE); }
function saveUsers(u) { saveJSON(USERS_FILE, u); }
function loadClasses() { return loadJSON(CLASSES_FILE); }
function saveClasses(c) { saveJSON(CLASSES_FILE, c); }
function loadHomework() { return loadJSON(HOMEWORK_FILE); }
function saveHomework(h) { saveJSON(HOMEWORK_FILE, h); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

// ========== SMTP ==========
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || '', port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_SECURE === 'false' ? false : true,
  user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
};
const DEMO_MODE = !SMTP_CONFIG.host;
if (DEMO_MODE) console.log('📧 演示模式');
else console.log(`📧 邮件模式：${SMTP_CONFIG.host}`);

async function sendEmail(to, code) {
  if (DEMO_MODE) { console.log(`[演示] 验证码 ${code} -> ${to}`); return { success: true, demo: true, code }; }
  try {
    const t = nodemailer.createTransport({ host: SMTP_CONFIG.host, port: SMTP_CONFIG.port, secure: SMTP_CONFIG.secure, auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass } });
    await t.sendMail({ from: SMTP_CONFIG.from, to, subject: '英语小题库 · 验证码', html: `<div style="font-family:sans-serif;padding:20px"><h2>📚 验证码</h2><p>你的验证码是：</p><div style="font-size:32px;font-weight:bold;color:#4F86F7;text-align:center;padding:20px;background:#E8F0FE;border-radius:12px;letter-spacing:8px">${code}</div><p style="color:#7F8C9B;font-size:13px">5分钟内有效</p></div>` });
    console.log(`✅ 邮件已发送到 ${to}`); return { success: true };
  } catch (e) { console.error(`❌ 发送失败: ${e.message}`); return { success: false, error: e.message }; }
}

// ========== 现有 API 保持 ==========

app.post('/api/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.json({ success: false, error: '请输入正确的邮箱地址' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  CODES[email] = { code, time: Date.now() };
  const result = await sendEmail(email, code);
  if (result.success) { const r = { success: true }; if (result.demo) { r.demo = true; r.code = code; } res.json(r); }
  else res.json({ success: false, error: '验证码发送失败' });
});

app.post('/api/register', async (req, res) => {
  const { email, name, password, code } = req.body;
  if (!email || !name || !password || !code) return res.json({ success: false, error: '请填写完整信息' });
  if (password.length < 6) return res.json({ success: false, error: '密码至少6位' });
  const record = CODES[email];
  if (!record || record.code !== code) return res.json({ success: false, error: '验证码错误或已过期' });
  if (Date.now() - record.time > 300000) { delete CODES[email]; return res.json({ success: false, error: '验证码已过期' }); }
  delete CODES[email];
  const users = loadUsers();
  if (users[email]) return res.json({ success: false, error: '该邮箱已注册' });
  users[email] = { email, name, password, createdAt: Date.now() };
  saveUsers(users);
  res.json({ success: true, user: { email, name, role: '' } });
});

app.post('/api/login', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.json({ success: false, error: '请填写邮箱和验证码' });
  const users = loadUsers();
  if (!users[email]) return res.json({ success: false, error: '该邮箱未注册' });
  const record = CODES[email];
  if (!record || record.code !== code) return res.json({ success: false, error: '验证码错误' });
  if (Date.now() - record.time > 300000) { delete CODES[email]; return res.json({ success: false, error: '验证码已过期' }); }
  delete CODES[email];
  const u = users[email];
  res.json({ success: true, user: { email, name: u.name, role: u.role || '', assignedLevel: u.assignedLevel || '' } });
});

app.post('/api/set-role', (req, res) => {
  const { email, role } = req.body;
  if (!email || !['student','parent','teacher'].includes(role)) return res.json({ success: false, error: '参数错误' });
  const users = loadUsers();
  if (!users[email]) return res.json({ success: false, error: '用户不存在' });
  users[email].role = role;
  saveUsers(users);
  res.json({ success: true, user: { email, name: users[email].name, role } });
});

app.post('/api/quick-login', (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, error: '请指定账号' });
  const users = loadUsers();
  if (!users[email]) {
    const name = { 'teacher@aixue.com':'李老师', 'student@aixue.com':'小明同学', 'parent@aixue.com':'王家长' }[email] || '体验用户';
    const role = { 'teacher@aixue.com':'teacher', 'student@aixue.com':'student', 'parent@aixue.com':'parent' }[email] || '';
    users[email] = { email, name, password:'123456', createdAt: Date.now(), demo:true, role };
    saveUsers(users);
  }
  res.json({ success: true, user: { email, name: users[email].name, role: users[email].role || '', assignedLevel: users[email].assignedLevel || '' } });
});

app.post('/api/check-session', (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ valid: false });
  const users = loadUsers();
  const u = users[email];
  res.json({ valid: !!u, user: u ? { email, name: u.name, role: u.role || '', assignedLevel: u.assignedLevel || '' } : null });
});

// ========== 个人信息编辑 ==========
app.post('/api/profile/update', (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) return res.json({ success: false, error: '参数错误' });
  if (name.length < 3 || name.length > 16) return res.json({ success: false, error: '昵称需3-16个字' });
  const users = loadUsers();
  if (!users[email]) return res.json({ success: false, error: '用户不存在' });
  // Check duplicate name
  for (const key of Object.keys(users)) {
    if (key !== email && users[key].name === name) return res.json({ success: false, error: '该昵称已被使用' });
  }
  users[email].name = name;
  saveUsers(users);
  res.json({ success: true, user: { email, name, role: users[email].role || '', assignedLevel: users[email].assignedLevel || '' } });
});

// ========== 查找用户（按昵称） ==========
app.post('/api/users/find-by-name', (req, res) => {
  const { name } = req.body;
  if (!name || name.length < 1) return res.json({ success: false, error: '请输入昵称' });
  const users = loadUsers();
  const results = [];
  for (const key of Object.keys(users)) {
    if (users[key].name && users[key].name.includes(name.trim())) {
      results.push({ email: key, name: users[key].name, role: users[key].role || '' });
    }
  }
  res.json({ success: true, users: results });
});

// ========== 班级管理 ==========
app.post('/api/classes/create', (req, res) => {
  const { teacherEmail, name, examLevel } = req.body;
  if (!teacherEmail || !name || !examLevel) return res.json({ success: false, error: '参数不完整' });
  const users = loadUsers();
  if (!users[teacherEmail] || users[teacherEmail].role !== 'teacher') return res.json({ success: false, error: '仅老师可创建班级' });
  const classes = loadClasses();
  const id = uid();
  classes[id] = { id, name, examLevel, teacherEmail, members: [], schedule: [], classLogs: [], createdAt: Date.now() };
  saveClasses(classes);
  res.json({ success: true, class: classes[id] });
});

app.post('/api/classes/list', (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, error: '参数错误' });
  const classes = loadClasses();
  const list = [];
  for (const key of Object.keys(classes)) {
    const c = classes[key];
    // Teacher sees own classes; members see classes they're in
    if (c.teacherEmail === email) list.push(c);
    else if (c.members && c.members.find(m => m.email === email)) list.push(c);
  }
  res.json({ success: true, classes: list });
});

app.post('/api/classes/update', (req, res) => {
  const { classId, name, examLevel } = req.body;
  const classes = loadClasses();
  if (!classes[classId]) return res.json({ success: false, error: '班级不存在' });
  if (name) classes[classId].name = name;
  if (examLevel) classes[classId].examLevel = examLevel;
  saveClasses(classes);
  res.json({ success: true, class: classes[classId] });
});

app.post('/api/classes/delete', (req, res) => {
  const { classId } = req.body;
  const classes = loadClasses();
  if (!classes[classId]) return res.json({ success: false, error: '班级不存在' });
  delete classes[classId];
  saveClasses(classes);
  res.json({ success: true });
});

// 添加成员到班级（通过昵称搜索添加）
app.post('/api/classes/add-member', (req, res) => {
  const { classId, userEmail, userName, role } = req.body;
  if (!classId || !userName) return res.json({ success: false, error: '参数不完整' });
  const classes = loadClasses();
  if (!classes[classId]) return res.json({ success: false, error: '班级不存在' });
  if (!classes[classId].members) classes[classId].members = [];
  // Find user by name
  const users = loadUsers();
  let found = null;
  for (const key of Object.keys(users)) {
    if (users[key].name === userName.trim()) { found = { email: key, name: users[key].name, role: users[key].role || '' }; break; }
  }
  if (!found) return res.json({ success: false, error: `未找到昵称为"${userName}"的用户` });
  if (classes[classId].members.find(m => m.email === found.email)) return res.json({ success: false, error: '该用户已在班级中' });
  classes[classId].members.push({ email: found.email, name: found.name, memberRole: role || 'student' });
  saveClasses(classes);
  res.json({ success: true, members: classes[classId].members });
});

app.post('/api/classes/remove-member', (req, res) => {
  const { classId, userEmail } = req.body;
  const classes = loadClasses();
  if (!classes[classId]) return res.json({ success: false, error: '班级不存在' });
  classes[classId].members = (classes[classId].members || []).filter(m => m.email !== userEmail);
  saveClasses(classes);
  res.json({ success: true, members: classes[classId].members });
});

// ========== 家长添加孩子 ==========
app.post('/api/parent/add-child', (req, res) => {
  const { parentEmail, childName } = req.body;
  if (!parentEmail || !childName) return res.json({ success: false, error: '参数不完整' });
  const users = loadUsers();
  if (!users[parentEmail]) return res.json({ success: false, error: '家长账号不存在' });
  // Find child by name
  let child = null;
  for (const key of Object.keys(users)) {
    if (users[key].name === childName.trim() && users[key].role === 'student') { child = { email: key, name: users[key].name }; break; }
  }
  if (!child) return res.json({ success: false, error: `未找到昵称为"${childName}"的学生` });
  if (!users[parentEmail].children) users[parentEmail].children = [];
  if (users[parentEmail].children.find(c => c.email === child.email)) return res.json({ success: false, error: '已添加过该孩子' });
  users[parentEmail].children.push(child);
  saveUsers(users);
  res.json({ success: true, children: users[parentEmail].children });
});

app.post('/api/parent/children', (req, res) => {
  const { email } = req.body;
  const users = loadUsers();
  res.json({ success: true, children: (users[email] && users[email].children) || [] });
});

// ========== 课程安排 & 课堂记录 ==========
app.post('/api/classes/set-schedule', (req, res) => {
  const { classId, schedule } = req.body;
  if (!classId || !schedule) return res.json({ success: false, error: '参数不完整' });
  const classes = loadClasses();
  if (!classes[classId]) return res.json({ success: false, error: '班级不存在' });
  classes[classId].schedule = schedule; // [{ day, startTime, endTime }]
  saveClasses(classes);
  res.json({ success: true, schedule: classes[classId].schedule });
});

app.post('/api/classes/add-note', (req, res) => {
  const { classId, content, progress, cancelled } = req.body;
  if (!classId) return res.json({ success: false, error: '参数不完整' });
  const classes = loadClasses();
  if (!classes[classId]) return res.json({ success: false, error: '班级不存在' });
  if (!classes[classId].classLogs) classes[classId].classLogs = [];
  classes[classId].classLogs.push({
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().split(' ')[0].substr(0,5),
    content: content || '',
    progress: progress || '',
    cancelled: cancelled || false,
  });
  saveClasses(classes);
  res.json({ success: true, logs: classes[classId].classLogs });
});

// ========== 作业系统 ==========
app.post('/api/homework/create', (req, res) => {
  const { classId, teacherEmail, title, type, questions, dueDate } = req.body;
  if (!classId || !teacherEmail || !title || !type || !questions || !questions.length) {
    return res.json({ success: false, error: '参数不完整' });
  }
  const hw = loadHomework();
  const id = uid();
  hw[id] = { id, classId, teacherEmail, title, type, questions, dueDate: dueDate || '', createdAt: Date.now() };
  saveHomework(hw);
  res.json({ success: true, homework: hw[id] });
});

app.post('/api/homework/list', (req, res) => {
  const { classId } = req.body;
  const hw = loadHomework();
  const list = [];
  for (const key of Object.keys(hw)) {
    if (hw[key].classId === classId) list.push(hw[key]);
  }
  list.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ success: true, homework: list });
});

app.post('/api/homework/delete', (req, res) => {
  const { homeworkId } = req.body;
  const hw = loadHomework();
  if (!hw[homeworkId]) return res.json({ success: false, error: '作业不存在' });
  delete hw[homeworkId];
  saveHomework(hw);
  res.json({ success: true });
});

// ========== 获取班级详情 ==========
app.post('/api/classes/detail', (req, res) => {
  const { classId } = req.body;
  const classes = loadClasses();
  if (!classes[classId]) return res.json({ success: false, error: '班级不存在' });
  // Get homework for this class
  const hw = loadHomework();
  const homeworkList = [];
  for (const key of Object.keys(hw)) {
    if (hw[key].classId === classId) homeworkList.push(hw[key]);
  }
  res.json({ success: true, class: classes[classId], homework: homeworkList.sort((a,b) => b.createdAt - a.createdAt) });
});

// ========== 静态文件 ==========
app.use(express.static(path.join(__dirname)));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 英语小题库服务器运行在 http://0.0.0.0:${PORT}`);
  console.log(`📖 访问地址: http://localhost:${PORT}/aixue.html`);
  if (!DEMO_MODE) console.log(`📧 邮件已配置：${SMTP_CONFIG.user} @ ${SMTP_CONFIG.host}`);
});
