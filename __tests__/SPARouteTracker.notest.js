// SPARouteTracker.test.js
import { installSPARouteTracker } from '../src/sdk/SPARouteTracker'
import { nextTick } from 'vue'

// mock vue 的 nextTick，让回调同步执行，方便测试
jest.mock('vue', () => ({
  nextTick: jest.fn(fn => fn())
}))

// mock 全局 performance 对象，防止测试环境缺失
global.performance = {
  mark: jest.fn(),
  measure: jest.fn(),
  getEntriesByName: jest.fn(() => [{ duration: 123 }]),
  clearMarks: jest.fn(),
  clearMeasures: jest.fn()
}

describe('SPARouteTracker 钩子安装与卸载', () => {
  it('应安装 beforeEach/afterEach 并在 stop 时移除', () => {
    const removeBefore = jest.fn()
    const removeAfter = jest.fn()

    // 模拟 router 对象及其钩子安装方法
    const routerMock = {
      beforeEach: jest.fn(() => removeBefore),
      afterEach: jest.fn(() => removeAfter)
    }

    const onDone = jest.fn()

    // 调用真实实现
    const tracker = installSPARouteTracker(routerMock, onDone)

    // 验证钩子是否安装了
    expect(routerMock.beforeEach).toHaveBeenCalled()
    expect(routerMock.afterEach).toHaveBeenCalled()

    // 模拟路由 afterEach 调用触发渲染完成回调
    const afterEachCallback = routerMock.afterEach.mock.calls[0][0]
    afterEachCallback({ fullPath: '/x' })

    // 断言回调被调用且参数符合预期
    expect(onDone).toHaveBeenCalledWith(expect.any(Number), '/x')

    // 调用停止监听，确认注销函数被执行
    tracker.stop()

    expect(removeBefore).toHaveBeenCalled()
    expect(removeAfter).toHaveBeenCalled()
  })
})
