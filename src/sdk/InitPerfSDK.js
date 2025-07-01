// src/sdk/index.js
import { PerfCollector } from './PerfCollector'
import { DataCache } from './DataCache'
import { Reporter } from './Reporter'
import { AIAnalyzer } from './AIAnalyzer'
import { NetworkMonitor } from '../utils/NetworkMonitor'
import { buildSystemPrompt, collectEnvironmentInfo } from '../utils'
import { configureLogger, logger } from '../utils/logger'

/**
 * 对外暴露的初始化方法
 * @param {object} options
 * @param {import('vue-router').Router} options.router
 * @param {string} options.reportUrl
 * @param {string} [options.aiUrl]
 * @param {number} [options.maxFpsSamples]
 * @param {number} [options.batchSize]
 * @param {number} [options.interval]
 */

export function initPerfSDK(options) {
  const {
    router,
    report = {},
    aiOptions = {},
    allowCollectEnv = false,
    scoringRules,
    useWebVitals = false,
    maxFpsSamples,
    samplingRate, // 采样率
    logLevel // 日志级别
  } = options


  // 1. 校验必填项
  // if (!options.router) throw new Error('必须传入 Vue Router 实例')
  // if (!report.utl) throw new Error('必须传入 report.url')

  // 创建全局日志级别标志
  configureLogger(logLevel)

  // 3. 环境检测：SSR / document 不存在时优雅降级
  const isBrowser = typeof document !== 'undefined'
  if (!isBrowser) {
    logger.warn('非浏览器环境，性能监控被禁用')
    return
  }

  // —— 0. 环境信息 ——
  const environmentInfo = allowCollectEnv ? collectEnvironmentInfo() : null
  // 构建系统提示，把阈值直接写进去
  const systemPrompt = buildSystemPrompt(scoringRules)

  // 1. 初始化 DataCache（缓存 & 批量上报）
  const dataCache = new DataCache()

  //  Reporter：负责 HTTP 批量上报
  const reporter = report.url ? new Reporter({
    ...report,
    environmentInfo
  }) : null

  // 将 DataCache.enqueue 的每个 snapshot 交给 Reporter 处理
  reporter && reporter.subscribe(dataCache)

  // 2. 初始化 NetworkMonitor，用于获取最新网络状态
  // 全局网络状态
  let currentNetworkStatus = null
  const netMon = new NetworkMonitor((status) => {
    // status: { online: boolean, effectiveType: string, downlink: number, rtt: number }
    // 你可以把这个网络状态存到全局，供后续页面快照时取用
    currentNetworkStatus = status
    // console.log('网络状态更新：', status)
  })
  netMon && netMon.start()

  // 3. 初始化 AIAnalyzer（AI 分析）
  const aiAnalyzer = (aiOptions.url && aiOptions.model) ? new AIAnalyzer({
    ...aiOptions,
    environmentInfo,
    systemPrompt
  }) : null

  // 将 DataCache.enqueue 的每个 snapshot 交给 AIAnalyzer 处理
  aiAnalyzer && aiAnalyzer.subscribe(dataCache)

  // 4. 初始化 PerfCollector（监控控制器）
  // 由 PerfCollector 在每次“软导航结束”时调用，把 snapshot 丢给 DataCache
  const perf = new PerfCollector(
    (snapshot) => {
      snapshot.network = currentNetworkStatus || {
        online: navigator.onLine,
        effectiveType: 'unknown',
        downlink: null,
        rtt: null
      }
      // 每次“页面结束”或“软导航结束”时，把 data 推给缓存
      dataCache.enqueue(snapshot)
    },
    {
      maxFpsSamples,
      useWebVitals,
      samplingRate
    }
  )

  // 路由监听
  if (router && router.afterEach) {
    // 优先使用 Vue Router
    perf.bindRouter(router)
  } else {
    // 原生 History/Hash 方案
    perf.bindNativeListener()
  }
  logger.info('SPA 性能监控 SDK 已启动')

  return {
    destroy: () => {
      // 销毁 DataCache
      dataCache.destroy()
      // 销毁 NetworkMonitor
      netMon.stop()
      // 销毁 AIAnalyzer
      aiAnalyzer && aiAnalyzer.destroy()
      // 销毁 Reporter
      reporter && reporter.destroy()
      // 销毁 PerfCollector
      perf.destroy()
    },
    perfInstance: perf
  }
}
