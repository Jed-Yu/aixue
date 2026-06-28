# 爱学 · AiXue

英语小题库 — 整理知识点 · 出练习题（YLE/KET/PET/FCE/CAE/CPE/雅思/托福）

## 快速部署

### 一键部署到 Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new?template=https://github.com/your-username/aixue)

或手动部署：

1. 把代码上传到 GitHub
2. 在 [Railway](https://railway.app) 创建新项目 → Deploy from GitHub repo
3. 等几秒钟就部署好了
4. Railway 会自动分配一个 `*.railway.app` 域名

### 环境变量（可选）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 端口 | Railway自动分配 |
| `SMTP_HOST` | SMTP服务器地址 | 留空=演示模式 |
| `SMTP_PORT` | SMTP端口 | 465 |
| `SMTP_USER` | 邮箱账号 | - |
| `SMTP_PASS` | 邮箱密码/授权码 | - |
| `SMTP_FROM` | 发件人地址 | 同SMTP_USER |

不配置 SMTP 时走演示模式，验证码直接显示在页面上，方便测试。

### 本地运行

```bash
npm install
node server.js
```

访问 http://localhost:8900/aixue.html

## 功能

- 📝 知识点整理：输入笔记，自动归类为语法/词汇/句型/注意事项
- ✍️ 出题练习：填空题、仿写句子、句子改写
- 📧 邮箱验证码登录/注册
- 🎭 身份选择：学生/家长/老师
