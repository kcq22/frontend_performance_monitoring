export class DataCache {
  /**
   * @param {string} reportUrl — 后端性能数据上报接口
   */
  constructor ({ onEnqueue }) {
    this.queue = [] // 本地的缓存队列
    this.onEnqueue = onEnqueue // 每条入队都会调用
  }

  /** 添加一个完整的页面 metrics 对象 */
  enqueue (pageMetrics) {
    // 没找到可替换的快照，追加到队列
    this.queue.push(pageMetrics)
    this.onEnqueue(pageMetrics)
  }

  /** 销毁定时器 & 事件 */
  destroy () {
    this.queue = []
  }
}
