import { logger } from './utils/logger'
/**
 * 监听资源加载，回调会收到 PerformanceResourceTiming 数组，并返回一个 stop 函数用于断开监听
 * @param {(entries: PerformanceResourceTiming[]) => void} callback
 * @returns {{ stop: () => void }} stop 方法用于断开观察
 */
export function observeResources(callback) {
  if (
    typeof window === 'undefined' ||
    typeof PerformanceObserver === 'undefined'
  ) {
    return { stop: () => {} }
  }

  let obs
  try {
    obs = new PerformanceObserver((list) => {
      try {
        const entries = list.getEntries()
        if (entries && entries.length > 0) {
          callback(entries)
        }
      } catch (e) {
        logger.error('[observeResources] 回调执行失败：', e)
      }
    })
    obs.observe({ type: 'resource', buffered: true })
  } catch (e) {
    logger.warn('[observeResources] PerformanceObserver 观察失败：', e)
    return { stop: () => {} }
  }

  return {
    stop() {
      try {
        obs.disconnect()
      } catch (e) {
        logger.warn('[observeResources] disconnect 失败：', e)
      }
    }
  }
}

/**
 * 监听长任务（JS 执行时间大于 50ms），回调会收到 PerformanceLongTaskTiming 数组，并返回一个 stop 函数
 * @param {(entries: PerformanceLongTaskTiming[]) => void} callback
 * @returns {{ stop: () => void }} stop 方法用于断开观察
 */
export function observeLongTasks(callback) {
  if (
    typeof window === 'undefined' ||
    typeof PerformanceObserver === 'undefined'
  ) {
    return { stop: () => {} }
  }

  let obs
  try {
    obs = new PerformanceObserver((list) => {
      try {
        const entries = list.getEntries()
        if (entries && entries.length > 0) {
          callback(entries)
        }
      } catch (e) {
        logger.error('[observeLongTasks] 回调执行失败：', e)
      }
    })
    obs.observe({ type: 'longtask', buffered: true })
  } catch (e) {
    logger.warn('[observeLongTasks] PerformanceObserver 观察失败：', e)
    return { stop: () => {} }
  }

  return {
    stop() {
      try {
        obs.disconnect()
      } catch (e) {
        logger.warn('[observeLongTasks] disconnect 失败：', e)
      }
    }
  }
}

/**
 * 采集 FPS，每秒统计一次，并返回一个 stop 函数用于停止帧率监听
 * @param {(fpsValue: number) => void} callback
 * @param {number} maxSamples — fps 样本最大长度
 * @returns {{ stop: () => void }} stop 方法用于取消 requestAnimationFrame
 */
export function trackFPS(callback, maxSamples = 60) {
  if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') {
    return { stop: () => {} }
  }

  let lastTime = performance.now()
  let frameCount = 0
  let isStopped = false
  const fpsSamples = []
  let rafId = null

  function measure(now) {
    if (isStopped) return
    try {
      frameCount++
      if (now - lastTime >= 1000) {
        fpsSamples.push(frameCount)
        if (fpsSamples.length > maxSamples) {
          fpsSamples.shift()
        }
        // 回调当前一秒的 fps
        try {
          callback(frameCount)
        } catch (e) {
          logger.error('[trackFPS] 回调执行失败：', e)
        }
        frameCount = 0
        lastTime = now
      }
      rafId = requestAnimationFrame(measure)
    } catch (e) {
      logger.warn('[trackFPS] measure 阶段异常：', e)
    }
  }

  // 启动监听
  rafId = requestAnimationFrame(measure)

  return {
    stop() {
      isStopped = true
      if (rafId != null) {
        try {
          cancelAnimationFrame(rafId)
        } catch (e) {
          logger.warn('[trackFPS] cancelAnimationFrame 失败：', e)
        }
      }
    }
  }
}

/**
 * 监听内存（仅在 Chrome 下可用），并返回一个 stop 函数用于停止定时采集
 * @param {(usedJSHeapSize: number) => void} callback
 * @param {number} intervalMs — 每隔多少毫秒采集一次
 * @returns {{ stop: () => void }} stop 方法用于清除定时器
 */
export function trackMemory(callback, intervalMs = 5000) {
  if (
    typeof window === 'undefined' ||
    typeof performance === 'undefined' ||
    !performance.memory ||
    typeof setInterval === 'undefined'
  ) {
    return { stop: () => {} }
  }

  let timerId = null
  try {
    timerId = setInterval(() => {
      try {
        callback(performance.memory.usedJSHeapSize)
      } catch (e) {
        logger.error('[trackMemory] 回调执行失败：', e)
      }
    }, intervalMs)
  } catch (e) {
    logger.warn('[trackMemory] setInterval 失败：', e)
    return { stop: () => {} }
  }

  return {
    stop() {
      if (timerId != null) {
        try {
          clearInterval(timerId)
        } catch (e) {
          logger.warn('[trackMemory] clearInterval 失败：', e)
        }
      }
    }
  }
}

/**
 * 监听累积布局偏移（CLS），并返回一个 stop 函数用于断开监听
 * @param {(clsValue: number) => void} callback
 * @returns {{ stop: () => void }} stop 方法用于断开观察
 */
export function trackCLS(callback) {
  if (
    typeof window === 'undefined' ||
    typeof PerformanceObserver === 'undefined'
  ) {
    return { stop: () => {} }
  }

  let clsSum = 0
  let obs
  try {
    obs = new PerformanceObserver((list) => {
      try {
        list.getEntries().forEach((entry) => {
          if (!entry.hadRecentInput) {
            clsSum += entry.value
          }
        })
        callback(clsSum)
      } catch (e) {
        logger.error('[trackCLS] 回调执行失败：', e)
      }
    })
    obs.observe({ type: 'layout-shift', buffered: true })
  } catch (e) {
    logger.warn('[trackCLS] PerformanceObserver 观察失败：', e)
    return { stop: () => {} }
  }

  return {
    stop() {
      try {
        obs.disconnect()
      } catch (e) {
        logger.warn('[trackCLS] disconnect 失败：', e)
      }
    }
  }
}
