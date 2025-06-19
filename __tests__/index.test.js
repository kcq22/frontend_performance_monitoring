// __tests__/PerfCollector.test.js
// 专注 PerfCollector 本身，不再断言 _isCloseInTime

import { PerfCollector } from '../src/sdk/PerfCollector'
import * as SoftVitals from '../src/sdk/SoftVitals'
import * as SPARouteTracker from '../src/sdk/SPARouteTracker'
import { collectHardVitals } from '../src/sdk/CollectHardVitals'

jest.useFakeTimers()

// 通用 mock
beforeEach(() => {
  SoftVitals.observeResources.mockReturnValue({ stop: jest.fn() })
  SoftVitals.observeLongTasks.mockReturnValue({ stop: jest.fn() })
  SoftVitals.trackFPS.mockReturnValue({ stop: jest.fn() })
  SoftVitals.trackMemory.mockReturnValue({ stop: jest.fn() })
  SoftVitals.trackCLS.mockReturnValue({ stop: jest.fn() })
  SPARouteTracker.installSPARouteTracker.mockReturnValue({ stop: jest.fn() })
  collectHardVitals.mockImplementation(cb => {
    cb({ name: 'FCP', value: 123 })
    cb({ name: 'LCP', value: 456 })
  })

  // mock performance
  global.performance = {
    now: () => Date.now(),
    mark: jest.fn(),
    measure: jest.fn(),
    clearMarks: jest.fn(),
    clearMeasures: jest.fn(),
    getEntriesByName: jest.fn(() => [])
  }
})

afterEach(() => {
  jest.clearAllMocks()
})

describe('PerfCollector 基本功能', () => {
  it('构造时 onPageComplete 不是函数应抛出', () => {
    expect(() => new PerfCollector(null, {})).toThrow(TypeError)
  })

  it('初始化 metrics 结构正确', () => {
    const c = new PerfCollector(() => {}, { maxFpsSamples: 5 })
    expect(c.metrics).toEqual({
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
    })
  })

  it('resetMetrics 能清空已写入的数据', () => {
    const c = new PerfCollector(() => {}, {})
    c.metrics.LCP = 111
    c.metrics.fpsSamples.push(30)
    c.resetMetrics()
    expect(c.metrics.LCP).toBeNull()
    expect(c.metrics.fpsSamples.length).toBe(0)
  })

  it('buildSnapshot 返回 pageName/fullPath/timestamp 等字段', () => {
    const c = new PerfCollector(() => {}, {})
    c.metrics.LCP = 500
    c.metrics.resourceEntries.push({ name: 'a.js', duration: 10, startTime: 5 })

    const snap = c.buildSnapshot('home', '/home?a=1')
    expect(snap.pageName).toBe('home')
    expect(snap.fullPath).toBe('/home?a=1')
    expect(snap.LCP).toBe(500)
    expect(snap.resource).toEqual([
      { name: 'a.js', duration: 10, startTime: 5 }
    ])
    expect(typeof snap.timestamp).toBe('number')
  })
})

describe('路由绑定 & 采样率', () => {
  it('bindRouter 后软导航应触发 onPageComplete', () => {
    const onFinish = jest.fn()
    SPARouteTracker.installSPARouteTracker.mockImplementation((router, cb) => {
      cb(300, '/demo')
      return { stop: jest.fn() }
    })
    const c = new PerfCollector(onFinish, {})
    const fakeRouter = {
      beforeEach: jest.fn(),
      afterEach: jest.fn(),
      currentRoute: { value: { name: 'demo', fullPath: '/demo' } }
    }
    c.bindRouter(fakeRouter)
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('samplingRate 为 0 时不应触发 onPageComplete', () => {
    const onFinish = jest.fn()
    SPARouteTracker.installSPARouteTracker.mockImplementation((r, cb) => {
      cb(100, '/noreport')
      return { stop: jest.fn() }
    })
    const c = new PerfCollector(onFinish, { samplingRate: 0 })
    c.bindRouter({
      beforeEach: jest.fn(),
      afterEach: jest.fn(),
      currentRoute: { value: { name: 'n', fullPath: '/noreport' } }
    })
    expect(onFinish).not.toHaveBeenCalled()
  })
})

describe('Web Vitals 支持', () => {
  it('useWebVitals=true 时 FCP/LCP 落入 snapshot', () => {
    const cb = jest.fn()
    SPARouteTracker.installSPARouteTracker.mockImplementation((r, fn) => {
      fn(0, '/w')
      return { stop: jest.fn() }
    })
    const c = new PerfCollector(cb, { useWebVitals: true })
    c.bindRouter({
      beforeEach: jest.fn(),
      afterEach: jest.fn(),
      currentRoute: { value: { name: 'w', fullPath: '/w' } }
    })
    const snap = cb.mock.calls[0][0]
    expect(snap.FCP).toBe(123)
    expect(snap.LCP).toBe(456)
  })
})

describe('destroy', () => {
  it('destroy 停止所有 observer 并清空 _observers', () => {
    const stopList = []
    SoftVitals.observeResources.mockReturnValue({ stop: () => stopList.push('res') })
    SoftVitals.observeLongTasks.mockReturnValue({ stop: () => stopList.push('lt') })
    SoftVitals.trackFPS.mockReturnValue({ stop: () => stopList.push('fps') })
    SoftVitals.trackMemory.mockReturnValue({ stop: () => stopList.push('mem') })
    SoftVitals.trackCLS.mockReturnValue({ stop: () => stopList.push('cls') })
    SPARouteTracker.installSPARouteTracker.mockReturnValue({ stop: () => stopList.push('spa') })

    const c = new PerfCollector(jest.fn(), {})
    c.bindRouter({
      beforeEach: jest.fn(),
      afterEach: jest.fn(),
      currentRoute: { value: { name: 'd', fullPath: '/d' } }
    })
    c.destroy()

    expect(stopList).toEqual(expect.arrayContaining(['res', 'lt', 'fps', 'mem', 'cls', 'spa']))
    expect(c._observers).toEqual({})
  })
})
