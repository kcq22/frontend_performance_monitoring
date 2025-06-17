// src/sdk/logger.js

// 日志级别常量
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4
}

// 默认日志级别（用于当 window.__PERF_LOG_LEVEL 无效时回退）
const DEFAULT_LEVEL = 'WARN'

let currentLevel = LOG_LEVELS[DEFAULT_LEVEL]

// 调用 SDK 初始化时，在 initPerfSDK 里注入
export function configureLogger (level = 'WARN') {
  const up = level.toUpperCase().trim()
  if (LOG_LEVELS[up] == null) {
    console.warn(`[PerfSDK-LOGGER] 无效的日志级别：${level}, 使用 WARN`)
  } else {
    currentLevel = LOG_LEVELS[up]
  }
}

// 内部判断函数
function shouldLog (level) {
  return level >= currentLevel
}

export const logger = {
  debug (...args) {
    if (shouldLog(LOG_LEVELS.DEBUG)) console.log('[PerfSDK][DEBUG]', ...args)
  },
  info (...args) {
    if (shouldLog(LOG_LEVELS.INFO)) console.info('[PerfSDK][INFO]', ...args)
  },
  warn (...args) {
    if (shouldLog(LOG_LEVELS.WARN)) console.warn('[PerfSDK][WARN]', ...args)
  },
  error (...args) {
    if (shouldLog(LOG_LEVELS.ERROR)) console.error('[PerfSDK][ERROR]', ...args)
  }
}
