import { AIAnalyzer } from '../src/sdk/AIAnalyzer'

// mock parse 工具
jest.mock('../src/utils', () => ({
  parseAIJsonString: jest.fn(str => JSON.parse(str))
}))

jest.mock('../src/utils/BatchProcessor', () => {
  return {
    BatchProcessor: jest.fn().mockImplementation(({ processBatchFn }) => ({
      enqueue: jest.fn((item) => processBatchFn([item])),
      destroy: jest.fn()
    }))
  }
})

// mock fetch 响应
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [
          {
            message: {
              content: '{"summary":"OK"}'
            }
          }
        ]
      })
  })
)

describe('AIAnalyzer.processBatch', () => {
  it('应发送 fetch 并写入 messages 和调用 onSuccess', async () => {
    const onSuccess = jest.fn()

    const ai = new AIAnalyzer({
      url: 'https://fake-ai.com',
      model: 'gpt-4',
      systemPrompt: '你是性能分析师',
      onSuccess
    })

    const fakeDataCache = {
      onEnqueue: null,
      enqueue(snap) {
        this.onEnqueue && this.onEnqueue(snap)
      }
    }

    ai.subscribe(fakeDataCache)

    const snapshot = {
      pageName: 'home',
      timestamp: Date.now(),
      key: 'home'
    }

    await fakeDataCache.enqueue(snapshot)

    expect(fetch).toHaveBeenCalledTimes(1)

    // 断点调试需要等待 event loop
    await Promise.resolve()

    expect(onSuccess).toHaveBeenCalledWith('{"summary":"OK"}')
  })
})
