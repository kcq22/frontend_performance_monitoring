import { Reporter } from '../src/sdk/Reporter'
import { DataCache } from '../src/sdk/DataCache'

// mock BatchProcessor 只记录 enqueue 调用
jest.mock('../src/utils/BatchProcessor', () => {
  return {
    BatchProcessor: jest.fn().mockImplementation(({ processBatchFn }) => ({
      enqueue: jest.fn(),
      destroy: jest.fn(),
      _processBatchFn: processBatchFn
    }))
  }
})

describe('Reporter subscribe', () => {
  it('subscribe 应将 snapshot 传入 BatchProcessor.enqueue', () => {
    const reporter = new Reporter({ url: 'https://api.com' })
    const dataCache = new DataCache({ onEnqueue: () => {} })

    reporter.processor.enqueue = jest.fn()
    reporter.subscribe(dataCache)

    const snap = { pageName: 'home', timestamp: Date.now() }
    dataCache.onEnqueue(snap)

    expect(reporter.processor.enqueue).toHaveBeenCalledWith({
      key: snap.pageName,
      ...snap
    })
  })
})
