# frontend_performance_monitoring

本 SDK 适用于 Vue 3 及任意 H5 SPA 应用（有无 Vue Router 均可），集成了：

- **硬导航 Core Web Vitals**（LCP、FCP、TTFB、FID、CLS），自动检测并采集
- **软导航指标**：资源加载、长任务、FPS、内存、CLS 累计
- **SPA 渲染时长**：精准测量 Vue Router 渲染或原生 History/Hash 路由渲染耗时
- **自动路由监听**：优先绑定 Vue Router，否则回退到原生 History/Hash/UNI‑App/Taro 全面捕获 URL 变化
- **批量上报** & **可选 AI 分析**

## 安装

```bash
npm install frontend_performance_monitoring
# 或者
yarn add frontend_performance_monitoring
```

**Peer Dependencies**
请确保项目中安装了以下包（版本仅需满足或更高）：

```bash
npm install vue@^3.0.0 vue-router@^4.0.0 web-vitals@^2.1.4
# 或
yarn add vue@^3.0.0 vue-router@^4.0.0 web-vitals@^2.1.4
```

## 快速开始

```javascript
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initPerfSDK } from 'frontend_performance_monitoring'

const { perfInstance, destroy } = initPerfSDK({
  router,
  report: {
    url: 'your url',
    headers: {
      token: 'your token',
      ContentType: 'application/json'
    },
    batchSize: 5,               // 批量上报数量，可选 默认 5
    maxQueueSize: 5,            // 缓存队列长度，可选 默认 5
    maxRetry: 1,                // 最大重试次数，可选 默认 1
    reportUrlTtl: 24 * 3600 * 1000, // 缓存过期时间，可选 默认 24 小时
    storageKey: 'PerfSDK_lastReportTime', // 本地存储 Key
    setParams: (performance) => ({     // 自定义上报参数
      ...performance,
      other: 'other'
    }),
    onSuccess: (res) => {            // 上报成功回调
      console.log('res', res)
    }
  },
  aiOptions: {
    url: 'your url',
    model: 'ai model',
    headers: {
      token: 'your token',
      ContentType: 'application/json'
    },
    batchSize: 5,               // 批量分析数量，可选 默认 5
    maxQueueSize: 5,            // 最大队列长度，可选 默认 5
    maxRetry: 1,                // 最大重试次数，可选 默认 1
    maxMessages: 20,            // 最大历史消息条数，可选 默认 20
    analyzeTtl: 24 * 3600 * 1000,   // 分析缓存过期时间，可选 默认 24 小时
    storageKey: 'PerfSDK_lastAnalyzeTime', // 本地存储 Key
    logToConsole: true,         // 是否打印 AI 分析结果到控制台
    otherOptions: null,         // 透传给 AI 服务器的其他参数
    onSuccess: (rawContent) => {    // AI 响应成功回调
      console.log('rawContent', rawContent)
    }
  },
  scoringRules: {              //可选 性能阈值规则配置，不传使用默认配置
    LCP: [1000, 2000],
    FCP: [500, 1000],
    TTFB: [200, 500],
    CLS: [0.1, 0.25],
    FID: [50, 100],
    SPA_Render: [500, 1000],
    resourceTotal: [500, 1500],
    maxLongTask: [50, 200],
    avgFPS: [55, 30],
    jsHeapLimit: [1.5 * 1024 ** 3, 0.5 * 1024 ** 3]
  },
  allowCollectEnv: true,       // 是否采集环境信息
  maxFpsSamples: 100,          // 最大 FPS 采样点数
  samplingRate: 1.0,           // 采样率（0~1）
  logLevel: 'debug',           // 日志级别（DEBUG/INFO/WARN/ERROR/SILENT）
})

const app = createApp(App)
// 安装首屏性能测量插件
app.use(createPerfFirstPaintPlugin({ router, perfInstance }))
app.use(router)
app.mount('#app')

// 页面卸载或刷新前销毁 SDK
window.addEventListener('beforeunload', destroy)
```

## 常用 API
- **参数说明**：

  | 名称                          | 类型              | 必填 | 默认值        | 说明                                                    |
    | ----------------------------- | ----------------- | ---- |------------| ------------------------------------------------------- |
  | `router`                      | Router            | ✗    | —          | Vue Router 实例                                         |
  | `report`                      | Object            | ✗    | —          | 上报配置对象                                            |
  | `report.url`                  | string            | ✗    | —          | 后端上报接口 URL                                        |
  | `report.headers`              | object            | ✗    | `{}`       | 自定义请求头，如 token、Content‑Type 等                 |
  | `report.batchSize`            | number            | ✗    | `5`        | 每批次上报条数                                          |
  | `report.maxQueueSize`         | number            | ✗    | `5`        | 批次队列最大长度                                        |
  | `report.maxRetry`             | number            | ✗    | `1`        | 最大重试次数                                            |
  | `report.reportUrlTtl`         | number (ms)       | ✗    | `86400000` | 相同 key 的最小上报间隔（毫秒）                         |
  | `report.storageKey`           | string            | ✗    | —          | 本地存储 Key                                            |
  | `report.setParams`            | func              | ✗    | —          | 自定义批量上报参数组装函数                              |
  | `report.onSuccess`            | func              | ✗    | —          | 上报成功回调                                            |
  | `aiOptions`                   | Object            | ✗    | —          | AI 分析配置                                             |
  | `aiOptions.url`               | string            | ✗    | —          | AI 接口 URL                                             |
  | `aiOptions.model`             | string            | ✗    | —          | AI 模型名称                                             |
  | `aiOptions.headers`           | object            | ✗    | `{}`       | AI 请求头，如 Authorization、Content‑Type 等            |
  | `aiOptions.batchSize`         | number            | ✗    | `5`        | 每批次分析条数                                          |
  | `aiOptions.maxQueueSize`      | number            | ✗    | `5`        | AI 分析批次队列最大长度                                 |
  | `aiOptions.maxRetry`          | number            | ✗    | `1`        | AI 分析最大重试次数                                     |
  | `aiOptions.maxMessages`       | number            | ✗    | `20`       | 本地缓存的最大对话条数                                  |
  | `aiOptions.analyzeTtl`        | number (ms)       | ✗    | `86400000` | AI 分析缓存过期时间（毫秒）                             |
  | `aiOptions.storageKey`        | string            | ✗    | —          | AI 分析本地存储 Key                                     |
  | `aiOptions.logToConsole`      | boolean           | ✗    | `true`     | 是否打印 AI 分析结果到控制台                            |
  | `aiOptions.otherOptions`      | object / null     | ✗    | `null`     | 透传给 AI 服务端的其他参数，如 `stream`, `temperature` 等 |
  | `aiOptions.onSuccess`         | func              | ✗    | —          | AI 响应成功回调                                         |
  | `scoringRules`                | Object            | ✗    | —          | 性能阈值规则，可自定义警告/严重阈值                     |
  | `allowCollectEnv`             | boolean           | ✗    | `false`    | 是否采集用户环境信息（浏览器、系统、网络等）            |
  | `maxFpsSamples`               | number            | ✗    | `60`       | 最大 FPS 采样点数                                       |
  | `samplingRate`                | number            | ✗    | `1.0`      | 随机采样率，范围 0~1                                    |
  | `logLevel`                    | string            | ✗    | `WARN`     | 日志级别（DEBUG/INFO/WARN/ERROR/SILENT）                |

- **返回值**：

  ```js
  {
    perfInstance, // PerfCollector 实例，可手动触发或扩展
    destroy       // 方法 销毁 SDK，断开所有监听并清理资源
  }

## 常用场景示例

**有 Vue Router**

```javascript
const { perfInstance, destroy } = initPerfSDK({ router, report: { ... } })
const app = createApp(App)
app.use(router)          // 必须要在 initPerfSDK 之后再挂载
app.mount('#app')
```

- 行为：

    - 首次加载后，自动采集 Hard Vitals 并上报首页

    - 每次路由切换前，上报上一页的软导航数据

    - 每次路由切换完成后，测量渲染耗时并注入 snapshot

**无 Vue Router（通用 H5、UNI‑App、Taro…）**

```javascript
const { perfInstance, destroy } = initPerfSDK({ report: { ... } })
const app = createApp(App)
app.mount('#app')
```

- 行为：

    - 自动拦截 History API、hashchange、链接点击、表单提交，以及 UNI‑App/Taro API

    - 每次 URL 变化，把上一页累积数据上报

    - 用 requestAnimationFrame 简易估算渲染耗时



## 兼容性 & 构建
**兼容旧版 Vue‑CLI / Webpack**

> 某些使用旧版 Vue‑CLI（≤4.x）或自定义 Webpack 的消费端，默认不会对 `node_modules` 里的 ESM 代码做 Babel
> 转译，可能会报 `Unexpected token`。  
> 请在它们的构建配置里，手动把本包也纳入转译。

#### Vue‑CLI（`vue.config.js`）

```js
// vue.config.js
module.exports = {
  transpileDependencies: [
    'frontend_performance_monitoring'
  ]
}
```

#### 纯 Webpack + Babel

```javascript
// webpack.config.js
module.exports = {
  // … 其他配置 …
  module: {
    rules: [
      // 让 babel-loader 也处理本包里的 .js / .mjs 文件
      {
        test: /\.m?js$/,
        include: /node_modules\/frontend_performance_monitoring/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: '> 0.25%, not dead'
              }]
            ]
          }
        }
      },
      // … 你现有的其他规则 …
    ]
  }
}
```

> ⚠️ 注意：上述配置仅在极少数“老脚手架”中需要；现代的 Vite、Webpack 5、Vue‑CLI 5⁺、Rollup 等工具均可开箱即用，无需额外配置。
