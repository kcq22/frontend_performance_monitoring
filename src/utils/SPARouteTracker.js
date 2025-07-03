// src/sdk/SPARouteTracker.js
import { nextTick } from 'vue'
import { logger } from './logger'


/**
 * 安装 SPA 路由渲染耗时追踪器，返回一个可以停止监听的 { stop() } 对象。
 *
 * 在 Vue Router SPA 中，监听每次路由切换，并用 performance.mark/measure
 * 计算“路由渲染时长”。不再额外保存 routeStartTime 变量，因为我们直接用 mark/measure。
 *
 * @param {import('vue-router').Router} router
 * @param onRouteChange
 * @param {(renderTime: number) => void} onRenderComplete
 * @returns {{ stop: () => void }}
 */
export function installSPARouteTracker(router, onRouteChange, onRenderComplete,) {
  // 存储两个注销函数
  let removeBefore = null
  let removeAfter = null
  // 标志：是否已做过首页（初始路由）快照
  let hasFirst = false
  let isPendingRender = false

  /** 渲染时长 start 点 */
  function markRenderStart() {
    performance.mark('route-start')
    isPendingRender = true
  }

  /** 渲染时长 end & 回调 */
  function markRenderEnd() {
    if (!isPendingRender) return
    nextTick(() => {
      requestAnimationFrame(() => {
        try {
          performance.mark('route-end')
          performance.measure('route-render', 'route-start', 'route-end')
          const measures = performance.getEntriesByName('route-render')
          if (measures.length) {
            const duration = Math.round(measures.pop().duration)
            onRenderComplete(duration)
          }
        } catch (err) {
          logger.warn('[SPARouteTracker] 渲染测量失败：', err)
        } finally {
          performance.clearMarks('route-start')
          performance.clearMarks('route-end')
          performance.clearMeasures('route-render')
          isPendingRender = false
        }
      })
    })
  }

  try {
    // 1. beforeEach: 仅设置开始标记
    removeBefore = router.beforeEach((to, from, next) => {
      const currentUrl = location.pathname + location.search + location.hash
      if (hasFirst && to.fullPath !== currentUrl) {
        const prevKey = from.name || from.fullPath
        onRouteChange(prevKey, from.fullPath)
      } else {
        hasFirst = true
      }
      // 标记开始测量
      markRenderStart()
      next()
    })
  } catch (e) {
    logger.warn('[SPARouteTracker] 安装 beforeEach 失败：', e)
  }

  try {
    // 2. afterEach: 在 DOM 更新完成后设置结束标记并 measure
    removeAfter = router.afterEach(() => {
      // 渲染结束时点
      markRenderEnd()
    })
  } catch (e) {
    logger.warn('[SPARouteTracker] 安装 afterEach 失败：', e)
  }

  return {
    stop() {
      // 调用注销函数，移除钩子
      if (typeof removeBefore === 'function') {
        try {
          removeBefore()
        } catch (e) {
          logger.warn('[SPARouteTracker] 卸载 beforeEach 失败：', e)
        }
      }
      if (typeof removeAfter === 'function') {
        try {
          removeAfter()
        } catch (e) {
          logger.warn('[SPARouteTracker] 卸载 afterEach 失败：', e)
        }
      }
    }
  }
}
