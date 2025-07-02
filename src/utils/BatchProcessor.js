import { createPersistedMap, useInFlight } from './PersistedMap'
import { logger } from './logger'

/**
 * 通用的“批量队列处理器”。
 */
export class BatchProcessor {
  /**
   * @param {object} options
   * @param {number} options.batchSize       — pending 达到此数时组 batch
   * @param {number} options.maxQueueSize    — 批次队列最大长度（单位：batch 数）
   * @param {number} options.ttl             — 同一 key 的最小间隔(毫秒)
   * @param {string} options.storageKey      — 持久化 key
   * @param {'localStorage'|'sessionStorage'} [options.storageType]
   * @param {number} options.maxRetry        — 批次处理失败时最大重试次数
   * @param {(batch:Array<object>)=>Promise} options.processBatchFn — 真正的处理函数
   */

  constructor({
                batchSize,
                maxQueueSize,
                ttl,
                storageKey,
                storageType = 'localStorage',
                maxRetry,
                processBatchFn
              } = {}) {
    if (typeof processBatchFn !== 'function') {
      throw new Error('BatchProcessor: processBatchFn 必填且为函数')
    }

    this.batchSize = Math.max(1, batchSize)
    this.maxQueueSize = Math.max(1, maxQueueSize)
    this.ttl = Math.max(3000, ttl)
    this.maxRetry = Math.max(0, maxRetry)
    this.processBatch = processBatchFn

    // 持久化上次成功时间
    this._store = createPersistedMap(storageKey, storageType)

    // in‑flight 管理
    const { isInFlight, markInFlight, clearInFlight } = useInFlight()
    this._isInFlight = isInFlight
    this._markInFlight = markInFlight
    this._clearInFlight = clearInFlight

    this._pending = [] // 单条 item
    this._queue = [] // 已成批的 item[]
    this._processing = false

    // 在页面卸载时，尽可能把剩余数据发出去
    this._onBeforeUnload = () => {
      this.flushAll()
    }
    // 监听页面隐藏或卸载，立即 flushAll
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this.flushAll()
      }
    }
    document.addEventListener('visibilitychange', this._onVisibilityChange)
    window.addEventListener('beforeunload', this._onBeforeUnload)
  }

  /**
   * 尝试把单条 item 加入 pending & batch & queue
   * @param {{ key: string, [others]: any }} item — 必须有 key 字段
   */
  enqueue(item) {
    const key = item.key
    const newTs = item.timestamp

    for (let i = 0; i < this._pending.length; i++) {
      const oldMetrics = this._pending[i]
      const { pageName: oldKey, timestamp: oldTs } = oldMetrics
      // 判断两个时间戳是否足够接近 可以视为“同一次页面上报”。
      if (oldKey === key && this._isCloseInTime(oldTs, newTs)) {
        const oldHasNav = (oldMetrics.LCP != null) || (oldMetrics.FCP != null)
        const newHasNav = (item.LCP != null) || (item.FCP != null)

        if (!oldHasNav && newHasNav) {
          // 新快照带硬导航，旧快照不带 → 用新快照替换
          this._pending[i] = item
        }
        // 如果旧快照已有硬导航，则不替换；或者两者都不带，则忽略
        return
      }
    }

    // TTL & in‑flight 过滤
    if (!this._store.isExpired(key, this.ttl)) return
    if (this._isInFlight(key)) return

    // push pending
    this._pending.push(item)
    logger.debug('BatchProcessor: 加入 当前队列', item, this._pending)

    // 凑够 batch 时，形成一个新的批次
    if (this._pending.length >= this.batchSize) {
      const batchItems = this._pending.splice(0, this.batchSize)
      this._enqueueBatch(batchItems)
    }
  }

  /** 将一整批 push 到队列，并尝试处理 */
  _enqueueBatch(batch) {
    if (this._queue.length >= this.maxQueueSize) {
      logger.warn('BatchProcessor: 批次队列已满，丢弃当前批次')
      return
    }
    const keys = batch.map(i => i.key)
    // 标记 in‑flight **只在真正入队时**
    this._markInFlight(keys)
    this._queue.push({ uuid: `batch_${Date.now()}`, batch, retryCount: 0 })
    this._flushNext()
  }

  /** 调度下一个批次 */
  _flushNext() {
    if (this._processing || this._queue.length === 0) return
    this._processNext()
  }

  /** 真正处理队头批次，带重试和指数退避 */
  async _processNext() {
    this._processing = true

    const { uuid, batch, retryCount } = this._queue.shift()
    const keys = batch.map(i => i.key)

    try {
      await this.processBatch(batch)
      // 成功：持久化 & 清 in‑flight
      const now = Date.now()
      this._clearInFlight(keys)
      keys.forEach(key => {
        this._store.set(key, now)
      })
      this._processing = false
      // 尝试处理下一个
      this._flushNext()
    } catch (err) {
      logger.error(`BatchProcessor: ${uuid}批次处理失败 (尝试 ${retryCount}/${this.maxRetry})`, err)
      // 失败：清 in‑flight
      this._clearInFlight(keys)

      if (retryCount < this.maxRetry) {
        // 指数退避后重试
        const delay = 10 * Math.pow(2, retryCount)
        setTimeout(() => {
          // 1. 先释放处理锁
          this._processing = false
          // 2. 将批次重新加入队列（重试计数+1）
          this._queue.unshift({ uuid, batch, retryCount: retryCount + 1 })
          // 3. 触发后续处理
          this._flushNext()
        }, delay)
      } else {
        // 记录最终失败
        logger.warn(`BatchProcessor: 批次达到最大重试次数 (${this.maxRetry})，放弃处理`, keys)
        // +++ 关键修复：达到最大重试后标记为"已处理" ++ +
        this._clearInFlight(keys)

        this._processing = false
        this._flushNext()
      }
    }
  }

  /**
   * 一次性：先把所有 pending 批量入 queue，然后触发所有批次上报
   */
  async flushAll() {
    // 1. 把 pending 中剩余项打包入队
    while (this._pending.length > 0) {
      const batch = this._pending.splice(0, this.batchSize)
      this._enqueueBatch(batch)
    }
    // 2. 等待所有批次处理完毕
    // 如果当前有批次在 processing，等它结束并继续处理后续
    while (this._processing || this._queue.length > 0) {
      // 如果没有在 processing，但有队列，手动启动
      if (!this._processing && this._queue.length > 0) {
        this._flushNext()
      }
      // 等一小段时间再检测
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  /**
   * 销毁：移除事件监听、清理内存，并触发一次 final flush
   */
  async destroy() {
    document.removeEventListener('visibilitychange', this._onVisibilityChange)
    window.removeEventListener('beforeunload', this._onBeforeUnload)
    await this.flushAll()
    // 清空队列
    this._pending = []
    this._queue = []
  }

  /**
   * 判断两个时间戳是否足够接近，可以视为“同一次页面上报”。
   * @param {number} ts1
   * @param {number} ts2
   */
  _isCloseInTime(ts1, ts2) {
    return Math.abs(ts1 - ts2) < 500 // 500ms 根据实际需求可调
  }
}
