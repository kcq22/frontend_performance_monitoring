import { logger } from './logger'

/**
 * 创建一个可持久化到 Web Storage（localStorage / sessionStorage）的 Map
 * @param {string} storageKey - 存储用的 key
 * @param {'localStorage'|'sessionStorage'} [storageType='localStorage']
 * @returns {{
 *   get(key: string, defaultValue?: any): any,
 *   set(key: string, value: any): void,
 *   isExpired(key: string, ttl: number): boolean,
 *   entries(): [string, any][],
 *   clear(): void
 * }}
 */
export function createPersistedMap (storageKey, storageType = 'localStorage') {
  if (!storageKey) {
    throw new Error('createPersistedMap: storageKey 必填')
  }
  if (storageType !== 'localStorage' && storageType !== 'sessionStorage') {
    throw new Error('createPersistedMap: storageType 必须是 "localStorage" 或 "sessionStorage"')
  }

  const storage = window[storageType]
  // 内存 Map 缓存
  const map = new Map()

  // 初始化：从 storage 恢复
  try {
    const raw = storage.getItem(storageKey)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        arr.forEach(([k, v]) => {
          map.set(k, v)
        })
      }
    }
  } catch (e) {
    logger.warn('createPersistedMap: 恢复失败', e)
  }

  // 持久化函数
  function persist () {
    try {
      const arr = Array.from(map.entries())
      storage.setItem(storageKey, JSON.stringify(arr))
    } catch (e) {
      logger.warn('createPersistedMap: 持久化失败', e)
    }
  }

  return {
    /**
     * 读取 key
     * @param {string} key
     * @param {any} [defaultValue]
     */
    get (key, defaultValue = undefined) {
      return map.has(key) ? map.get(key) : defaultValue
    },

    /**
     * 设置 key，并立即持久化
     * @param {string} key
     * @param {any} value
     */
    set (key, value) {
      map.set(key, value)
      persist()
    },

    /**
     * 判断是否过期：如果没有存，则返回 true
     * @param {string} key
     * @param {number} ttl 毫秒
     */
    isExpired (key, ttl) {
      const last = map.has(key) ? map.get(key) : 0
      return (Date.now() - last) >= ttl
    },

    /**
     * 返回所有 [key, value] 数组
     */
    entries () {
      return Array.from(map.entries())
    },

    /**
     * 清空所有记录
     */
    clear () {
      map.clear()
      try {
        storage.removeItem(storageKey)
      } catch (e) {
        logger.warn('createPersistedMap: 清除失败', e)
      }
    }
  }
}

/**
 * 管理一组正在上报（in‑flight）的 pageKey，防止重复采集。
 */
export function useInFlight () {
  // 内部用一个 Set 来保存所有 in-flight 的 key
  const inFlight = new Set()

  return {
    /**
     * 判断某个 pageKey 是否正在上报
     * @param {string} pageKey
     * @returns {boolean}
     */
    isInFlight (pageKey) {
      console.log('isInFlight========', inFlight)
      return inFlight.has(pageKey)
    },

    /**
     * 将一个或多个 pageKey 标记为 in‑flight
     * @param {string|string[]} pageKeys
     */
    markInFlight (pageKeys) {
      if (Array.isArray(pageKeys)) {
        pageKeys.forEach(key => inFlight.add(key))
      } else {
        inFlight.add(pageKeys)
      }
      console.log('markInFlight========', inFlight)
    },

    /**
     * 将一个或多个 pageKey 从 in‑flight 中移除
     * @param {string|string[]} pageKeys
     */
    clearInFlight (pageKeys) {
      if (Array.isArray(pageKeys)) {
        pageKeys.forEach(key => inFlight.delete(key))
      } else {
        inFlight.delete(pageKeys)
      }
    },
    /**
     * 清空所有 in-flight
     */
    clearAllInFlight () {
      inFlight.clear()
    }
  }
}
