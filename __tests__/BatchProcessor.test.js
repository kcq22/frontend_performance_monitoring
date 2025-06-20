import { BatchProcessor } from '../src/utils/BatchProcessor'

// mock persisted map & in‑flight helpers
jest.mock('../src/utils/persistedMap', () => ({
  createPersistedMap: () => ({
    set: jest.fn(),
    get: () => 0,
    isExpired: () => true
  }),
  useInFlight: () => {
    const set = new Set()
    return {
      isInFlight: key => set.has(key),
      markInFlight: key => set.add(key),
      clearInFlight: key => set.delete(key)
    }
  }
}))

describe('BatchProcessor 重试与 flushAll', () => {
  jest.useFakeTimers()

  it('成功批次应调用 processBatchFn 一次并清除 in‑flight', async () => {
    const processFn = jest.fn(() => Promise.resolve())
    const bp = new BatchProcessor({
      batchSize: 2,
      maxQueueSize: 5,
      ttl: 0,
      maxRetry: 1,
      storageKey: 'bp',
      processBatchFn: processFn
    })

    bp.enqueue({ key: 'p1', timestamp: Date.now() })
    bp.enqueue({ key: 'p1', timestamp: Date.now() + 1 }) // 触发 batchSize=2

    // 下一轮 event‑loop 才会处理
    await Promise.resolve()
    expect(processFn).toHaveBeenCalledTimes(1)
  })

  it('失败批次应按指数退避重试', async () => {
    const processFn = jest.fn()
      .mockRejectedValueOnce(new Error('fail‑1'))
      .mockResolvedValueOnce('ok')
    const bp = new BatchProcessor({
      batchSize: 1,
      maxQueueSize: 2,
      ttl: 0,
      maxRetry: 1,
      storageKey: 'bp2',
      processBatchFn: processFn
    })

    bp.enqueue({ key: 'p', timestamp: Date.now() })

    // 第一次失败
    await Promise.resolve()
    expect(processFn).toHaveBeenCalledTimes(1)

    // 推进 fake timers 触发重试（默认 500ms）
    jest.advanceTimersByTime(600)
    await Promise.resolve()
    expect(processFn).toHaveBeenCalledTimes(2)
  })
})
