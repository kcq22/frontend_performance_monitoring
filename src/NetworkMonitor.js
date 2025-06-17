/**
 * NetworkMonitor.js
 *
 * 通过 window.online/offline 事件和 Network Information API
 * 实时监测当前网络状态及网络质量。
 *
 * 用法：
 *   import { NetworkMonitor } from './NetworkMonitor'
 *   const netMon = new NetworkMonitor((status) => {
 *     console.log('网络状态更新：', status)
 *   })
 *   netMon.start()
 *   // … 当不需要时，调用 netMon.stop()
 */

export class NetworkMonitor {
  /**
   * @param {(status: NStatus) => void} callback
   *        callback 会在网络状态或网络质量发生变化时被调用，
   *        接收一个对象 { online, effectiveType, downlink, rtt }
   */
  constructor (callback) {
    this.callback = callback
    this.handleOnline = this.handleOnline.bind(this)
    this.handleOffline = this.handleOffline.bind(this)
    this.handleConnectionChange = this.handleConnectionChange.bind(this)
  }

  /**
   * 启动监听
   */
  start () {
    // 1. 立即触发一次当前状态
    this.dispatchStatus()

    // 2. 监听在线/离线 事件
    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)

    // 3. 监听 Network Information API，部分浏览器支持
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (conn && typeof conn.addEventListener === 'function') {
      conn.addEventListener('change', this.handleConnectionChange)
    }
  }

  /**
   * 停止监听
   */
  stop () {
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (conn && typeof conn.removeEventListener === 'function') {
      conn.removeEventListener('change', this.handleConnectionChange)
    }
  }

  /**
   * 统一派发当前网络状态给 callback
   */
  dispatchStatus () {
    const online = navigator.onLine
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    const effectiveType = conn?.effectiveType || 'unknown' // 例如 '4g', '3g', '2g', 'slow-2g'
    const downlink = conn?.downlink ? conn.downlink + 'Mbps' : null // Mbps
    const rtt = conn?.rtt ? conn.rtt + 'ms' : null // ms

    this.callback({
      online,
      effectiveType,
      downlink,
      rtt
    })
  }

  handleOnline () {
    this.dispatchStatus()
  }

  handleOffline () {
    this.dispatchStatus()
  }

  handleConnectionChange () {
    this.dispatchStatus()
  }
}
