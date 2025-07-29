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
import { initRouterListener } from '../utils/RouterListenerAdapter'

const TEXT_LENGTH = 100 // 资源name截取长度

export class PerfCollector {
  /**
   * @param {(snapshot: object) => void} onPageComplete
   * @param {object} options
   * @param {number} [options.maxFpsSamples=60]
   */
  constructor (onPageComplete, {
    maxFpsSamples = 60,
    samplingRate = 1,
  } = {}) {
    // 参数校验
    if (typeof onPageComplete !== 'function') {
      throw new TypeError('onPageComplete 必须是函数')
    }

    this.onPageComplete = onPageComplete
    this.maxFpsSamples = maxFpsSamples
    this.currentPage = window.location.pathname
    // 添加采样率配置
    this.samplingRate = samplingRate < 0 || samplingRate > 1 ? 1 : samplingRate

    // 用于存储各个 stop 回调，方便 destroy 时调用
    this._observers = {
      resource: null,
      longTask: null,
      fps: null,
      memory: null,
      cls: null,
      webVitals: null,
      spaRoute: null
    }

    this._unlistenNative = null

    this.resetMetrics()
    // —— 1. 硬导航指标 ——
    this._initHardVitals()
    // 2. 软导航指标
    this._initSoftVitals()
  }


  /**
   * 初始化硬导航指标
   */
  _initHardVitals() {
    this._observers.hardVitals = collectHardVitals(metric => {
      this.hasAnyMetric = true
      this.metrics[metric.name] = metric.value
    }, { reportAllChanges: true })
  }

  /**
   * 初始化软导航指标
   */
  _initSoftVitals() {
    // —— 2. 软导航阶段采集：资源 ——
    this._observers.resource = observeResources((stats) => {
      this.hasAnyMetric = true
      this.metrics.resourceStats = {
        ...stats
      }
    })

    // —— 3. 软导航阶段采集：长任务 (暂不开放)——
    this._observers.longTask = observeLongTasks((stats) => {
      this.hasAnyMetric = true
      this.metrics.longTaskStats = {
        ...stats
      }
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
   * 绑定vue router 实例
   * 在路由切换时由外部调用：先将旧页面 snapshot 推给 onPageComplete，再重置 metrics
   * @param {Router} router — Vue Router 实例
   */
  bindRouter(router) {
    this._observers.spaRoute = installSPARouteTracker(router, (pageKey, fullPath) => {
      // 应用采样率
      if (this._isExceedSamplingRate()) {
        this.resetMetrics()
        return
      }
      this.hasAnyMetric = true
      // 最后结束当前页面的所有指标采集，打包成 snapshot
      const snapshot = this.buildSnapshot(pageKey, fullPath)
      this.onPageComplete(snapshot)
      // 重置 metrics，并更新当前 page
      this.currentPage = pageKey
      this.resetMetrics()
    }, (renderTime) => {
      // 渲染耗时逻辑
      this.metrics.SPA_Render = renderTime
      this.hasAnyMetric = true
    })
  }

  // 绑定原生路由监听
  bindNativeListener() {
    this._unlistenNative = initRouterListener((newUrl) => {
      // 应用采样率
      if (this._isExceedSamplingRate()) {
        this.resetMetrics()
        return
      }
      this.hasAnyMetric = true
      const snapshot = this.buildSnapshot(newUrl, newUrl)
      this.onPageComplete(snapshot)
      this.currentPage = newUrl
      this.resetMetrics()
    }, (renderTime) => {
      // 渲染耗时逻辑
      this.metrics.SPA_Render = renderTime
      this.hasAnyMetric = true
    })
  }

  buildSnapshot(page, fullPath) {
    const usedBytes = this.metrics.memory || 0;              // 原 memory 字段
    const usedMB  = Math.round((usedBytes / 1024 / 1024) * 10) / 10; // 保留一位小数
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
      INP: this.metrics.INP || null,
      // 资源、长任务、内存、帧率
      resourceStats: this.metrics.resourceStats || null,
      longTaskStats: this.metrics.longTaskStats || null,
      // memory: this.metrics.memory || null,
      fpsSamples: [...this.metrics.fpsSamples],
      // SPA 渲染时长（soft nav）
      SPA_Render: this.metrics.SPA_Render || null,
      usedJSHeapMB: usedMB
    }
  }

  // 应用采样率 超过阈值则不发送
  _isExceedSamplingRate() {
    return Math.random() >= this.samplingRate
  }

  resetMetrics() {
    this.hasAnyMetric = false
    this.metrics = {
      LCP: null,
      FCP: null,
      TTFB: null,
      CLS: 0,
      FID: null,
      INP: null,
      resourceStats: {},
      longTaskStats: {},
      memory: null,
      fpsSamples: [],
      SPA_Render: null
    }
  }

  /**
   * 暴露给外部的销毁方法：停止所有观察/采集，清理资源
   */
  destroy() {
    this._unlistenNative()
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
}
