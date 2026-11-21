import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
const app = await createApp();
app.listen(port, '0.0.0.0', () => {
  console.log(`同窗进阶服务已启动：http://localhost:${port}`);
  console.log('当前 AI/OCR 为可替换的本地模拟实现，所有建议仍需管理员复核。');
});
