// 英语小题库 · 静态文件服务器
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8900;

app.use(express.static(path.join(__dirname)));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 英语小题库运行在 http://0.0.0.0:${PORT}`);
  console.log(`📖 http://localhost:${PORT}/aixue.html`);
});
