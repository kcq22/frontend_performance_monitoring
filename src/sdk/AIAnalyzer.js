import { logger } from '../utils/logger'
import { parseAIJsonString } from '../utils'
import { BatchProcessor } from '../utils/BatchProcessor'

export class AIAnalyzer {
  /**
   * @param {object} [options]
   * @param {boolean} [options.logToConsole=true] — 是否打印到控制台
   */
  constructor ({
                 url,
                 model,
                 systemPrompt,
                 logToConsole,
                 headers = {},
                 otherOptions = {},
                 batchSize = 5,
                 maxRetry = 1,
                 maxMessages = 20,
                 maxQueueSize = 5,
                 analyzeTtl = 24 * 3600 * 1000,
                 storageKey = 'PerfSDK_lastAnalyzeTime',
                 onSuccess,
                 environmentInfo
               } = {}) {
    this.systemPrompt = systemPrompt
    this.logToConsole = logToConsole
    this.maxRetry = maxRetry
    this.maxMessages = maxMessages
    this.messages = []

    // 存储多轮对话的所有消息，先尝试从 sessionStorage 恢复
    const stored = sessionStorage.getItem('ai_analyzer_message')
    if (stored) {
      try {
        this.messages = JSON.parse(stored)
      } catch {
        this.messages = []
      }
    } else {
      this.messages = []
    }

    // 如果 messages 里没有 system 提示，则插入
    if (!this.messages.find(m => m.role === 'system')) {
      this.messages.unshift({
        role: 'system',
        content: this.systemPrompt || ''
      })
      sessionStorage.setItem('ai_analyzer_message', JSON.stringify(this.messages))
    }

    this.processor = new BatchProcessor({
      batchSize,
      maxQueueSize,
      ttl: analyzeTtl,
      storageKey,
      storageType: 'sessionStorage',
      maxRetry,
      processBatchFn: async (batch) => {
        // batch 中是 array of snapshots
        logger.debug('发起 AI 请求，参数：', {
          pages: batch,
          environment: environmentInfo
        })

        // 先构造要发送的 user-message 对象
        const userMessage = {
          role: 'user',
          content: JSON.stringify({
            pages: batch,
            environment: environmentInfo
          })
        }

        // 先插入真实 user 消息，并裁剪本地历史
        // this.messages.push(userMessage)
        this._trimMessageHistory()

        // 发起 fetch 请求
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': headers.ContentType || 'application/json',
            Authorization: headers.token || ''
          },
          body: JSON.stringify({
            model: model,
            messages: [
              ...this.messages,
              userMessage
            ],
            ...otherOptions
          })
        })

        if (!res.ok) {
          throw new Error(`AI 接口返回状态 ${res.status}`)
        }

        const result = await res.json()
        logger.debug('AI 响应原始：', res, result)

        // 解析 AI 返回内容，并推入 messages
        const rawContent = result.choices?.[0]?.message?.content || ''
        let parsedContent
        try {
          parsedContent = parseAIJsonString(rawContent)
        } catch (err) {
          logger.error('解析 AI 返回 JSON 失败，原始内容：', rawContent, err)
          parsedContent = rawContent // 即使解析失败，也保留原始字符串
        }

        // 打印到控制台
        if (this.logToConsole) {
          console.group('%c 📊 性能分析结果', 'color: #409EFF; font-weight: bold;')
          console.log(parsedContent)
          console.groupEnd()
        }

        this.messages.push(userMessage)
        // 把 assistant 的回复也存储在 messages
        this.messages.push({
          role: 'assistant',
          content: JSON.stringify(parsedContent)
        })
        sessionStorage.setItem('ai_analyzer_message', JSON.stringify(this.messages))

        onSuccess(rawContent)
      }
    })
  }

  /**
   * 订阅 DataCache 的 enqueue 事件，当有新快照时，入队
   * @param {DataCache} dataCache
   */
  subscribe (dataCache) {
    if (!dataCache || typeof dataCache.enqueue !== 'function') {
      throw new Error('[Reporter] subscribe 需要传入 DataCache 实例')
    }
    dataCache.onEnqueue = (snapshot) => {
      this.processor.enqueue({ key: snapshot.pageName, ...snapshot })
    }
  }

  /**
   * 简化版裁剪：只保留首条 system + 最近 maxMessages 条
   */
  _trimMessageHistory () {
    const max = this.maxMessages
    const msg = this.messages
    // 如果总量 ≤ system(1) + max，则不用裁剪
    if (msg.length <= max + 1) {
      return this.messages
    }
    const systemMsg = msg[0]
    // 取尾部最后 max 条
    const tail = msg.slice(-max)
    this.messages = [systemMsg, ...tail]
    // 持久化到 sessionStorage
    sessionStorage.setItem('ai_analyzer_message', JSON.stringify(this.messages))
    return [
      systemMsg,
      {
        role: 'system',
        content: `注意：以下仅保留最近 ${this.maxMessages} 条对话，之前内容已被省略。`
      },
      ...tail
    ]
  }

  destroy () {
    this.processor.destroy()
  }
}
