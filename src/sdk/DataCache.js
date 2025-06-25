export class DataCache {
  constructor () {
    this.queue = [] // 本地的缓存队列
    // 存放所有订阅者的回调
    this._enqueueSubscribers = []
  }

  /** 添加一个完整的页面 metrics 对象 */
  enqueue(pageMetrics) {
    // 没找到可替换的快照，追加到队列
    this.queue.push(pageMetrics)
    for (const fn of this._enqueueSubscribers) {
      try {
        fn(pageMetrics)
      } catch (e) {
        console.error('[DataCache] enqueue subscriber 异常', e)
      }
    }
  }

  /**
   * 注册一个订阅者，每次 enqueue 都会调用
   * @param {(pageMetrics: object) => void} fn
   */
  subscribe(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('DataCache.subscribe 需要传入函数')
    }
    this._enqueueSubscribers.push(fn)
  }

  /**
  * 取消订阅
  * @param {(pageMetrics: object) => void} fn
  */
  unsubscribe(fn) {
    this._enqueueSubscribers = this._enqueueSubscribers.filter(f => f !== fn)
  }

  /** 销毁定时器 & 事件 */
  destroy() {
    this.queue = []
  }
}
