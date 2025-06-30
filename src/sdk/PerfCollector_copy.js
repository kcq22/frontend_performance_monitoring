// src/sdk/PerfCollector.js
import { collectHardVitals } from '../utils/CollectHardVitals'
import {
  observeResources,
  observeLongTasks,
  trackFPS,
  trackMemory,
  trackCLS
} from '../utils/SoftVitals'
import { installSPARouteTracker } from '../utils/SPARouteTracker'
import { logger } from '../utils/logger'

const TEXT_LENGTH = 100 // 资源name截取长度

export class PerfCollector {
  /**
   * @param {(snapshot: object) => void} onPageComplete
   * @param {object} options
   * @param {boolean} [options.useWebVitals=false]  是否启用 collectHardVitals
   * @param {number} [options.maxFpsSamples=60]
   */
  constructor(onPageComplete, {
    useWebVitals = false,
    maxFpsSamples = 60,
    samplingRate = 1
  } = {}) {
    // 参数校验
    if (typeof onPageComplete !== 'function') throw new TypeError('onPageComplete 必须是函数')

    this.onPageComplete = onPageComplete
    this.useWebVitals = useWebVitals
    this.maxFpsSamples = maxFpsSamples
    this.currentPage = window.location.pathname
    // 添加采样率配置
    this.samplingRate = samplingRate < 0 || samplingRate > 1 ? 1 : samplingRate
    // 用于存储各个 stop 回调，方便 destroy 时调用
    this._observers = {
      resource: null,
      longtask: null,
      fps: null,
      memory: null,
      cls: null,
      webVitals: null,
      spaRoute: null
    }
    this.resetMetrics()

    // —— 1. 硬导航指标 ——
    if (this.useWebVitals) {
      collectHardVitals((metric) => {
        this.hasAnyMetric = true
        this.metrics[metric.name] = metric.value
      })
    }
    // 2. 软导航指标
    this._initSoftVitals()
  }

  /**
   * 初始化软导航指标
   */
  _initSoftVitals() {
    // —— 2. 软导航阶段采集：资源 ——
    this._observers.resource = observeResources((entries) => {
      this.hasAnyMetric = true
      entries.forEach((entry) => {
        const { name } = entry
        this.metrics.resourceEntries.push({
          name: name.length > TEXT_LENGTH ? `${name.slice(0, TEXT_LENGTH)}...` : name,
          duration: entry.duration ? entry.duration.toFixed(3) : entry.duration,
          startTime: entry.startTime.toFixed(3)
        })
      })
    })

    // —— 3. 软导航阶段采集：长任务 ——
    this._observers.longtask = observeLongTasks((entries) => {
      this.hasAnyMetric = true
      entries.forEach((entry) => {
        this.metrics.longtaskEntries.push({
          name: entry.name,
          duration: entry.duration,
          startTime: entry.startTime
        })
      })
    })

    // —— 4. 软导航阶段采集：FPS ——
    this._observers.fps = trackFPS((fpsVal) => {
      this.hasAnyMetric = true
      this.metrics.fpsSamples.push(fpsVal)
      if (this.metrics.fpsSamples.length > this.maxFpsSamples) {
        this.metrics.fpsSamples.shift()
      }
    }, this.maxFpsSamples)

    // —— 5. 软导航阶段采集：Memory ——
    this._observers.memory = trackMemory((usedJsHeap) => {
      this.hasAnyMetric = true
      this.metrics.memory = usedJsHeap
    })

    // —— 6. 软导航阶段采集：CLS ——
    this._observers.cls = trackCLS((clsValue) => {
      this.hasAnyMetric = true
      this.metrics.CLS = clsValue // 这里覆盖原 CLS 值，或者累加都行
    })
  }

  /**
   * 在路由切换时由外部调用：先将旧页面 snapshot 推给 onPageComplete，再重置 metrics
   * @param {Router} router — Vue Router 实例
   */
  bindRouter(router) {
    this._observers.spaRoute = installSPARouteTracker(router, (renderTime, page) => {
      // 应用采样率
      if (Math.random() >= this.samplingRate) {
        this.resetMetrics()
        return
      }
      const route = router.currentRoute.value
      // 1. 拿到 pageKey（通常是 route.name）
      const pageKey = this._getPageKey(route)
      this.hasAnyMetric = true
      // 先把 renderTime 作为“SPA 渲染耗时”放入 metrics
      this.metrics.SPA_Render = renderTime
      // 最后结束当前页面的所有指标采集，打包成 snapshot
      const snapshot = this.buildSnapshot(pageKey, route.fullPath)
      this.onPageComplete(snapshot)

      // 重置 metrics，并更新当前 page
      this.currentPage = pageKey
      this.resetMetrics()
    })
  }

  buildSnapshot(page, fullPath) {
    return {
      pageName: page || this.currentPage,
      fullPath,
      timestamp: Date.now(),
      // Core Web Vitals（硬导航时采集）
      LCP: this.metrics.LCP || null,
      FCP: this.metrics.FCP || null,
      TTFB: this.metrics.TTFB || null,
      CLS: this.metrics.CLS || 0,
      FID: this.metrics.FID || null,
      // 资源、长任务、内存、帧率
      resource: [...this.metrics.resourceEntries],
      longtask: [...this.metrics.longtaskEntries],
      memory: this.metrics.memory || null,
      fps: [...this.metrics.fpsSamples],
      // SPA 渲染时长（soft nav）
      SPA_Render: this.metrics.SPA_Render || null
    }
  }

  // 对外暴露 设置metrics属性
  setParams(paramsStr, value) {
    // 判断 this.metrics 是否有paramsStr这个属性
    if (!this.metrics.hasOwnProperty(paramsStr)) {
      this.metrics[paramsStr] = value
    }
  }

  resetMetrics() {
    this.hasAnyMetric = false
    this.metrics = {
      LCP: null,
      FCP: null,
      TTFB: null,
      CLS: 0,
      FID: null,
      resourceEntries: [],
      longtaskEntries: [],
      memory: null,
      fpsSamples: [],
      SPA_Render: null
    }
  }

  /**
   * 暴露给外部的销毁方法：停止所有观察/采集，清理资源
   */
  destroy() {
    // 1. 停止所有 PerformanceObserver、requestAnimationFrame、setInterval
    Object.values(this._observers).forEach(observer => {
      if (observer && typeof observer.stop === 'function') {
        try {
          observer.stop()
        } catch (e) {
          console.warn('[PerfCollector] 停止 observer 失败：', e)
        }
      }
    })
    // 2. 清理内部状态
    this.resetMetrics()
    this._observers = {}
  }

  /**
   * 从 route 中生成 pageKey：
   * 优先用 route.name；如果没有 name，就 fallback 为 route.fullPath。
   * 如果需要更复杂的逻辑（比如某些路由 group），可在此处扩展。
   */
  _getPageKey(route) {
    if (route.name) {
      return route.name
    } else {
      logger.warn('当前路由没有 name，使用 fullPath 作为 pageKey')
      return route.fullPath
    }
  }
}
