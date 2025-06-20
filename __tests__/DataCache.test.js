import { DataCache } from '../src/sdk/DataCache'

describe('DataCache 模块', () => {
  it('enqueue 应触发 onEnqueue 回调并存入 queue', () => {
    const cb = jest.fn()
    const cache = new DataCache({ onEnqueue: cb })

    const snap = { pageName: 'home', timestamp: Date.now() }
    cache.enqueue(snap)

    expect(cache.queue).toContain(snap)
    expect(cb).toHaveBeenCalledWith(snap)
  })

  it('destroy 应重置 queue', () => {
    const cache = new DataCache({ onEnqueue: () => {} })
    cache.queue.push(1, 2)
    cache.destroy()
    expect(cache.queue.length).toBe(0)
  })
})
