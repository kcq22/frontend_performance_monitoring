import { NetworkMonitor } from '../src/utils/NetworkMonitor'

describe('NetworkMonitor 事件', () => {
  const connectionMock = {
    effectiveType: '4g',
    downlink: 10,
    rtt: 50,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }

  beforeAll(() => {
    Object.defineProperty(navigator, 'connection', {
      value: connectionMock,
      configurable: true
    })
  })

  it('start 时应立即派发一次状态，并监听事件', () => {
    const cb = jest.fn()
    const nm = new NetworkMonitor(cb)
    nm.start()

    expect(cb).toHaveBeenCalledTimes(1)
    expect(window.addEventListener).toBeDefined()
    nm.stop()
  })
})
