// src/sdk/CollectHardVitals.js

import { getLCP, getFCP, getCLS, getFID, getTTFB } from 'web-vitals'
import { logger } from '../utils/logger'

/**
 * collectHardVitals
 *
 * 同时支持 Web Vitals API（web-vitals 包）和原生 PerformanceObserver，
 * 并且：
 *  - LCP、CLS 会多次上报
 *  - FCP、FID、TTFB 只会上报一次
 *  - TTFB 使用 load + 超时 兜底补发
 *
 * @param {(metric: { name: string; value: number }) => void} callback
 *        每当有新指标时被调用，参数包含 { name, value }
 * @param {{ reportAllChanges?: boolean; timeout?: number }} [options]
 *        reportAllChanges: 是否开启 buffered 模式（Web Vitals only）
 *        timeout: TTFB 的超时时间（毫秒）
 * @returns {{ stop: () => void }}
 *        返回一个 stop 方法，用来取消所有观察与回调
 */
export function collectHardVitals(
  callback,
  { reportAllChanges = true, timeout = 5000 } = {}
) {
  // 原生 PerformanceObserver 实例数组，用于后续 stop 时统一 disconnect()
  const nativeObservers = []
  // web-vitals 返回的取消订阅函数数组，同样用于 stop 时调用
  const unsubscribes = []
  // 记录哪些一次性指标已经上报过
  const seenOnce = new Set()
  // 定义哪些指标仅上报一次（FCP, FID, TTFB）
  const onceMetrics = new Set(['FCP', 'FID', 'TTFB'])
  // 标记 TTFB 是否已触发超时处理
  let timedOut = false

  /**
   * deliver
   * 包装 callback，确保只有指定的指标去重，其他指标总是上报
   */
  function deliver(name, value) {
    // 如果是一次性指标，且已经上报过，则直接跳过
    if (onceMetrics.has(name)) {
      if (seenOnce.has(name)) return
      seenOnce.add(name)
    }
    // 调用用户提供的回调
    try {
      callback({ name, value })
    } catch (e) {
      logger.error(`[CollectHardVitals] callback error for ${name}`, e)
    }
  }

  /**
   * tryWebVital
   * 优先尝试使用 web-vitals 提供的 API
   * 如果接口存在且调用成功，会将取消订阅函数存入 unsubscribes
   *
   * @param {Function} fn        web-vitals 导入的方法，例如 getLCP
   * @param {string}   metricName 用于 callback 标记
   * @param {Object}   opts      传给 web-vitals 的 opts（reportAllChanges）
   * @returns {boolean}          返回 true 表示使用了 web-vitals
   */
  function tryWebVital(fn, metricName, opts = {}) {
    if (typeof fn !== 'function') return false
    try {
      // 调用 web-vitals API
      const unsub = fn(metric => {
        deliver(metric.name, metric.value)
      }, opts.reportAllChanges)
      // 部分 web-vitals 实现会返回取消函数
      if (typeof unsub === 'function') {
        unsubscribes.push(unsub)
      }
      return true
    } catch (err) {
      logger.warn(`[CollectHardVitals] web-vitals ${metricName} failed, fallback to native`, err)
      return false
    }
  }

  /**
   * observeNative
   * 如果 web-vitals 不可用，则使用原生 PerformanceObserver
   *
   * @param {string} entryType   PerformanceObserver 的 type 字段
   * @param {string} metricName  上报时使用的指标名
   * @param {Function} extractor 从 entry 对象中提取 value
   */
  function observeNative(entryType, metricName, extractor) {
    if (typeof PerformanceObserver !== 'function') {
      logger.warn(`[CollectHardVitals] skip native observer for ${metricName}: unsupported`)
      return
    }
    try {
      const obs = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const v = extractor(entry)
          // extractor 返回 null/undefined 时跳过
          if (v != null) deliver(metricName, v)
        }
      })
      // buffered: true 可拿到过去产生但未消费的条目
      obs.observe({ type: entryType, buffered: true })
      nativeObservers.push(obs)
    } catch (err) {
      logger.warn(`[CollectHardVitals] native observer ${metricName} failed`, err)
    }
  }

  // —— 1. LCP —— （可多次上报）
  if (!tryWebVital(getLCP, 'LCP', { reportAllChanges })) {
    observeNative('largest-contentful-paint', 'LCP', e => e.startTime)
  }

  // —— 2. FCP —— （只上报第一次）
  if (!tryWebVital(getFCP, 'FCP', { reportAllChanges })) {
    observeNative('paint', 'FCP', e =>
      e.name === 'first-contentful-paint' ? e.startTime : null
    )
  }

  // —— 3. CLS —— （可多次累积上报）
  if (!tryWebVital(getCLS, 'CLS', { reportAllChanges })) {
    let clsAcc = 0
    if (typeof PerformanceObserver === 'function') {
      try {
        const obs = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            clsAcc += entry.value
            deliver('CLS', clsAcc)
          }
        })
        obs.observe({ type: 'layout-shift', buffered: true })
        nativeObservers.push(obs)
      } catch (err) {
        logger.warn('[CollectHardVitals] native observer CLS failed', err)
      }
    }
  }

  // —— 4. FID —— （只上报第一次）
  if (!tryWebVital(getFID, 'FID', { reportAllChanges })) {
    observeNative('first-input', 'FID', e =>
      e.processingStart - e.startTime
    )
  }

  // —— 5. TTFB —— （只上报第一次 + load/timeout 兜底）
  // 尝试 web-vitals
  const sawTV = tryWebVital(getTTFB, 'TTFB')
  // 原生 navigation timing 立即读一次
  let navEntries = performance.getEntriesByType?.('navigation') || []
  if (!sawTV && navEntries.length) {
    deliver('TTFB', navEntries[0].responseStart)
  }

  // 5a. load 事件后再补一次（覆盖早期 timing 晚加载场景）
  function onLoadFlush() {
    if (timedOut) return
    navEntries = performance.getEntriesByType?.('navigation') || []
    if (navEntries.length) {
      deliver('TTFB', navEntries[0].responseStart)
    }
  }

  window.addEventListener('load', onLoadFlush, { once: true })

  // 5b. 超时兜底
  const timeoutId = setTimeout(() => {
    timedOut = true
    navEntries = performance.getEntriesByType?.('navigation') || []
    if (navEntries.length) {
      deliver('TTFB', navEntries[0].responseStart)
    }
  }, timeout)

  // 返回 stop 方法，用于外部销毁时调度
  return {
    stop() {
      // 断开所有原生 observers
      nativeObservers.forEach(obs => {
        try {
          obs.disconnect()
        } catch {
        }
      })
      // 调用所有 web-vitals 退订函数
      unsubscribes.forEach(fn => {
        try {
          fn()
        } catch {
        }
      })
      // 清理 load 监听与 timeout
      window.removeEventListener('load', onLoadFlush)
      clearTimeout(timeoutId)
    }
  }
}
