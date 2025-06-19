// src/sdk/Reporter.js
import { BatchProcessor } from '../utils/BatchProcessor'

export class Reporter {
  /**
   * @param {object} options
   * @param {string} options.url        — 必填，后端上报地址
   * @param {number} [options.batchSize=5]    — 达到多少条快照触发一次批量上报
   * @param {number} [options.maxQueueSize=50]— 入队最大长度，超出后丢弃最旧
   * @param {number} [options.reportUrlTtl=86400000]   — 相同 pageKey 的最小上报间隔 (ms)
   * @param {string} [options.storageKey]     — 持久化 key (localStorage)
   */
  constructor ({
                 url,
                 batchSize = 5,
                 maxQueueSize = 5,
                 maxRetry = 1,
                 reportUrlTtl = 24 * 3600 * 1000,
                 headers = {},
                 setParams,
                 onSuccess,
                 storageKey = 'PerfSDK_lastReportTime',
                 environmentInfo
               } = {}) {
    if (!url || typeof url !== 'string') {
      throw new Error('[Reporter] Url 必填且为字符串')
    }
    this.onSuccess = onSuccess
    this.processor = new BatchProcessor({
      batchSize,
      maxQueueSize,
      ttl: reportUrlTtl,
      storageKey,
      storageType: 'localStorage',
      maxRetry,
      processBatchFn: async (batch) => {
        // batch 中是 array of snapshots
        let params = batch
        if (setParams && typeof setParams === 'function') {
          params = setParams({
            page: batch,
            environment: environmentInfo
          })
        }
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': headers.ContentType || 'application/json'
          },
          body: JSON.stringify(params)
        })
        if (onSuccess && typeof onSuccess === 'function') {
          onSuccess(res)
        }
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
    dataCache.onEnqueue = snapshot => {
      // 把 snapshot 转成带 key 的 item
      this.processor.enqueue({ key: snapshot.pageName, ...snapshot })
    }
  }

  destroy () {
    this.processor.destroy()
  }
}
