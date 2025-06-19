// jest.setup.js

// 模拟全局 performance API
if (typeof global.performance === 'undefined') {
  global.performance = {}
}

performance.now = () => Date.now()
performance.mark = jest.fn()
performance.measure = jest.fn()
performance.clearMarks = jest.fn()
performance.clearMeasures = jest.fn()
performance.getEntriesByName = jest.fn(() => [])

// 模拟 requestAnimationFrame / cancelAnimationFrame
global.requestAnimationFrame = cb => setTimeout(cb, 16)
global.cancelAnimationFrame = id => clearTimeout(id)

// 模拟 fetch
global.fetch = require('jest-fetch-mock')

// mock vue 的 nextTick（避免 vue 依赖）
jest.mock('vue', () => ({
  nextTick: (cb) => Promise.resolve().then(cb)
}))

// mock logger 以避免控制台污染
jest.mock('./src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  configureLogger: jest.fn()
}))

// mock SoftVitals 和 SPARouteTracker
jest.mock('./src/sdk/SoftVitals', () => ({
  observeResources: jest.fn(),
  observeLongTasks: jest.fn(),
  trackFPS: jest.fn(),
  trackMemory: jest.fn(),
  trackCLS: jest.fn()
}))


jest.mock('./src/sdk/CollectHardVitals', () => ({
  collectHardVitals: jest.fn()
}))
