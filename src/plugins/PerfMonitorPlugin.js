// src/utils/perf-sdk/PerfFirstPaintPlugin.js
import { nextTick } from 'vue'
import { logger } from '../utils/logger'

export function createPerfFirstPaintPlugin({ router, perfInstance }) {
  if (!router) throw new Error('[PerfFirstPaintPlugin] 必须传入 router')
  if (!perfInstance) throw new Error('[PerfFirstPaintPlugin] 必须传入 perfInstance')

  let hasReported = false
  let customFCP = null
  let customLCP = null
  let fcpObserver, lcpObserver

  function setupObservers() {
    // 监听 FCP
    fcpObserver = new PerformanceObserver(list => {
      logger.debug('[PerfFirstPaintPlugin] FCP entries:', list.getEntries())
      for (const entry of list.getEntries()) {
        if (!customFCP) customFCP = entry.startTime
      }
    })
    fcpObserver.observe({ type: 'paint', buffered: true })

    // 监听 LCP
    lcpObserver = new PerformanceObserver(list => {
      logger.debug('[PerfFirstPaintPlugin] LCP entries:', list.getEntries())
      for (const entry of list.getEntries()) {
        customLCP = entry.startTime
      }
    })
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })
  }

  function cleanupObservers() {
    if (fcpObserver) {
      fcpObserver.disconnect()
    }
    if (lcpObserver) {
      lcpObserver.disconnect()
    }
  }

  function reportIfReady(route) {
    // logger.debug('[PerfFirstPaintPlugin] reportIfReady called:', { hasReported, customFCP, customLCP })
    if (hasReported) return
    const navEntries = performance.getEntriesByType('navigation')
    const hasNav = navEntries.length > 0

    if (!hasNav && customFCP == null && customLCP == null) {
      // 都还没来得及测量，跳过
      return
    }

    hasReported = true
    const perf = perfInstance

    // TTFB
    if (hasNav) {
      perf.metrics.TTFB = navEntries[0].responseStart
      perf.hasAnyMetric = true
    }
    // FCP / LCP
    if (customFCP != null) {
      perf.metrics.FCP = Math.round(customFCP)
      perf.hasAnyMetric = true
    }
    if (customLCP != null) {
      perf.metrics.LCP = Math.round(customLCP)
      perf.hasAnyMetric = true
    }
    // SPA_Render 设为 0（硬导航场景）
    perf.metrics.SPA_Render = 0

    const pageKey = perf._getPageKey(route)
    const snapshot = perf.buildSnapshot(pageKey, route.fullPath)
    perf.onPageComplete(snapshot)
    perf.resetMetrics()
    // 一次性完成后，断开 observer
    cleanupObservers()
  }

  return {
    install(app) {
      logger.debug('[PerfFirstPaintPlugin] install')
      setupObservers()

      let didFallback = false  // <- 标志位
      // 首次路由变更时补报
      router.afterEach(to => {
        // 只在第一次「首屏」路由完成后跑
        if (didFallback) return
        didFallback = true

        // reportIfReady(to)
        nextTick(() => {
          const now = Math.round(performance.now())
          // 每个路由只取一次 fallback，避免覆盖真实 Observer 值
          if (customFCP == null) customFCP = now
          if (customLCP == null) customLCP = now
          logger.debug('[PerfFirstPaintPlugin] afterEach FCP/LCP =', now, 'ms')
          reportIfReady(to)
        })
      })
    }
  }
}
