# frontend_performance_monitoring

前端性能监控 SDK，基于 web-vitals + 自定义采集，支持 SPA 路由切换监控与 AI 分析。

## 安装

```bash
npm install frontend_performance_monitoring
# 或者
yarn add frontend_performance_monitoring
```

## 快速开始

```javascript
import { initPerfSDK } from 'frontend_performance_monitoring';
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

const app = createApp(App);

initPerfSDK({
  router,
  reportUrl: 'https://your.backend/api/perf',
  // 其余配置...
});

app.use(router).mount('#app');
```
