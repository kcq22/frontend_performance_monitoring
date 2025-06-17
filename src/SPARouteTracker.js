// src/sdk/SPARouteTracker.js
import { nextTick } from 'vue'
import { logger } from './utils/logger'

/**
 * 安装 SPA 路由渲染耗时追踪器，返回一个可以停止监听的 { stop() } 对象。
 *
 * 在 Vue Router SPA 中，监听每次路由切换，并用 performance.mark/measure
 * 计算“路由渲染时长”。不再额外保存 routeStartTime 变量，因为我们直接用 mark/measure。
 *
 * @param {import('vue-router').Router} router
 * @param {(renderTime: number, page: string) => void} onRenderComplete
 * @returns {{ stop: () => void }}
 */
export function installSPARouteTracker (router, onRenderComplete) {
  // 存储两个注销函数
  let removeBefore = null
  let removeAfter = null

  try {
    // 1. beforeEach: 仅设置开始标记
    removeBefore = router.beforeEach((to, from, next) => {
      performance.mark('route-start')
      next()
    })
  } catch (e) {
    logger.warn('[SPARouteTracker] 安装 beforeEach 失败：', e)
  }

  try {
    // 2. afterEach: 在 DOM 更新完成后设置结束标记并 measure
    removeAfter = router.afterEach((to) => {
      // 等待 Vue 完成视图更新
      nextTick(() => {
        performance.mark('route-end')
        try {
          performance.measure('route-render', 'route-start', 'route-end')
          const measures = performance.getEntriesByName('route-render')
          if (measures.length > 0) {
            const renderTime = measures[measures.length - 1].duration
            onRenderComplete(renderTime, to.fullPath || to.path)
          }
        } catch (e) {
          logger.warn('[SPARouteTracker] measure 失败：', e)
        }
        // 清理 marks 和 measures，避免累积
        performance.clearMarks('route-start')
        performance.clearMarks('route-end')
        performance.clearMeasures('route-render')
      })
    })
  } catch (e) {
    logger.warn('[SPARouteTracker] 安装 afterEach 失败：', e)
  }

  return {
    stop () {
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
