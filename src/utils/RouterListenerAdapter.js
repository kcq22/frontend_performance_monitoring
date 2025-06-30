// src/utils/RouterListenerAdapter.js
import { normalizePath } from './index'
import { nextTick } from 'vue'

/**
 * 通用路由监听器
 *  1. 优先订阅框架自带的路由事件（uni-app、Taro）
 *  2. 接着监听标准浏览器事件：popstate、hashchange
 *  3. 可选 patch pushState/replaceState → 派发 location change
 *  4. 拦截 <a> 点击 & <form> 提交
 *  5. beforeunload/visibilitychange 做最后一次硬导航埋点
 *
 * @param {(newUrl: string, oldUrl?: string|null) => void} onRouteChange
 * @param onRenderComplete
 * @returns {() => void} 取消所有监听
 */
export function initRouterListener(onRouteChange, onRenderComplete) {

  const { markRenderStart, markRenderEnd } = setupRenderTracker(onRenderComplete)

  // 保存上一页的路径，首次为初始化时的页面
  let lastUrl = normalizePath(location.href)

  function notify() {
    const newUrl = normalizePath(location.href)
    const oldUrl = lastUrl
    if (newUrl === oldUrl) return
    // 🔥 先更新 lastUrl，再触发回调，确保回调里拿到的是 old/new
    lastUrl = newUrl
    // ⚡️ 在路由变化时，先把“上一页”数据上报
    onRouteChange(oldUrl)

    // 新页面开始打点
    markRenderStart && markRenderStart()
    markRenderEnd && markRenderEnd(newUrl)
  }

  // 1. 框架事件：uni-app
  let removeUniHook = () => {
  }
  if (typeof window.uni === 'object' && typeof uni.$once === 'function') {
    // uni-app 默认会在跳转后触发 'routeChange' 事件（不同版本可能不同，请确认）
    uni.$once('routeChange', notify)
    removeUniHook = () => uni.$off('routeChange', notify)
  }

  // 1b. 框架事件：Taro
  let removeTaroHook = () => {
  }
  if (typeof window.Taro === 'object' && Taro.eventCenter) {
    // Taro H5 端可通过 eventCenter 订阅路由变化
    const { on, off } = Taro.eventCenter
    on('routeChange', notify)
    removeTaroHook = () => off('routeChange', notify)
  }

  // 2. 浏览器原生事件
  window.addEventListener('popstate', notify)
  window.addEventListener('hashchange', notify)

  // 3. 可选 patch History API
  let removeMethodPatch = () => {
  }
  const _push = history.pushState
  const _replace = history.replaceState
  if (!_push._perfPatched) {
    history.pushState = function() {
      const result = _push.apply(this, arguments)
      window.dispatchEvent(new Event('locationchange'))
      return result
    }
    history.pushState._perfPatched = true
  }
  if (!_replace._perfPatched) {
    history.replaceState = function() {
      const result = _replace.apply(this, arguments)
      window.dispatchEvent(new Event('locationchange'))
      return result
    }
    history.replaceState._perfPatched = true
  }
  window.addEventListener('locationchange', notify)
  removeMethodPatch = () => {
    window.removeEventListener('locationchange', notify)
    history.pushState = _push
    history.replaceState = _replace
  }

  // 4. 拦截 <a> 点击 & <form> 提交
  const clickHandler = e => {
    const a = e.target.closest('a[href]')
    if (!a) return
    const href = a.getAttribute('href')
    // 只拦截同源并非下载链接
    if (!href.startsWith('http') || new URL(href, location.origin).origin === location.origin) {
      setTimeout(notify, 0)
    }
  }
  document.addEventListener('click', clickHandler, true)

  // 5. 硬导航前最后一次埋点
  const beforeUnloadHandler = () => onRouteChange(normalizePath(location.href), lastUrl)
  const visibilityHandler = () => {
    if (document.visibilityState === 'hidden') {
      onRouteChange(normalizePath(location.href), lastUrl)
    }
  }
  window.addEventListener('beforeunload', beforeUnloadHandler)
  document.addEventListener('visibilitychange', visibilityHandler)

  // 返回取消监听
  return () => {
    removeUniHook()
    removeTaroHook()
    window.removeEventListener('popstate', notify)
    window.removeEventListener('hashchange', notify)
    window.removeEventListener('beforeunload', beforeUnloadHandler)
    document.removeEventListener('visibilitychange', visibilityHandler)

    removeMethodPatch()
    document.removeEventListener('click', clickHandler, true)
  }
}

export function setupRenderTracker(onRenderComplete) {
  let isPending = false

  const markRenderStart = () => {
    performance.mark('route-start')
    isPending = true
  }

  const markRenderEnd = (pagePath) => {
    if (!isPending) return
    nextTick(() => {
      requestAnimationFrame(() => {
        try {
          performance.mark('route-end')
          performance.measure('route-render', 'route-start', 'route-end')
          const measures = performance.getEntriesByName('route-render')
          if (measures?.length > 0) {
            const duration = measures[measures.length - 1].duration
            onRenderComplete(Math.round(duration), pagePath)
          }
        } catch (err) {
        }
        performance.clearMarks('route-start')
        performance.clearMarks('route-end')
        performance.clearMeasures('route-render')
        isPending = false
      })
    })
  }

  return {
    markRenderStart,
    markRenderEnd
  }
}
