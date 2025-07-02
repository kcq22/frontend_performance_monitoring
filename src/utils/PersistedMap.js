import { logger } from './logger'

/**
 * 创建一个可持久化到 Web Storage（localStorage / sessionStorage）的 Map，
 * 并在写入时自动处理容量溢出：
 * - 支持设置最大条目数 maxEntries
 * - 写入失败时按 LRU 策略逐条删除最旧条目，重试写入
 *
 * @param {string} storageKey       存储用的 key
 * @param {'localStorage'|'sessionStorage'} [storageType='localStorage']
 * @param {number} [maxEntries=100] 最大条目数上限
 */
export function createPersistedMap(
  storageKey,
  storageType = 'localStorage',
  maxEntries = 100
) {
  if (!storageKey) {
    throw new Error('createPersistedMap: storageKey 必填')
  }
  if (storageType !== 'localStorage' && storageType !== 'sessionStorage') {
    throw new Error('createPersistedMap: storageType 必须是 "localStorage" 或 "sessionStorage"')
  }
  maxEntries = Math.floor(maxEntries)
  if (maxEntries < 1) {
    throw new Error('createPersistedMap: maxEntries 必须 ≥ 1')
  }

  const storage = window[storageType]
  const map = new Map()            // 存储实际数据
  const accessTime = new Map()     // 存储每个 key 的最近访问时间

  // 恢复已有数据
  try {
    const raw = storage.getItem(storageKey)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        arr.forEach((entry) => {
          try {
            if (Array.isArray(entry) && entry.length >= 2) {
              const [k, v, ts] = entry
              map.set(k, v)
              accessTime.set(k, typeof ts === 'number' ? ts : Date.now())
            } else {
              throw new Error('格式不正确')
            }
          } catch (e) {
            logger.warn('[createPersistedMap] 忽略无效条目', entry)
          }
        })
      }
    }
  } catch (e) {
    logger.warn('[createPersistedMap] 恢复阶段 JSON.parse 失败，忽略全部旧数据', e)
  }

  // 检测 QuotaExceededError
  function isQuotaExceeded(err) {
    return (
      err &&
      (err.code === 22 ||
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    )
  }

  // 节流 persist：若短时间内多次调用，合并为一次
  let pendingPersist = false
  function schedulePersist() {
    if (pendingPersist) return
    pendingPersist = true

    const handler = () => {
      pendingPersist = false
      doPersist()
    }

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(handler, { timeout: 200 })
    } else {
      setTimeout(handler, 200)
    }
  }


  // 真正的写入逻辑
  function doPersist() {
    // 序列化格式：[[key, value, ts], ...]
    const serialize = () =>
      JSON.stringify(
        Array.from(map.entries()).map(([k, v]) => [k, v, accessTime.get(k)])
      )

    let data = serialize()
    try {
      storage.setItem(storageKey, data)
    } catch (err) {
      if (isQuotaExceeded(err)) {
        // 循环删除直到成功或没有可删条目
        let attemptCount = 0
        const maxAttempts = Math.max(10, map.size) // 最多尝试次数

        while (map.size > 0 && attemptCount < maxAttempts) {
          attemptCount++

          // 找到当前最旧条目
          let minTs = Infinity
          let oldestKey = null

          for (const [k, ts] of accessTime.entries()) {
            if (ts < minTs) {
              minTs = ts
              oldestKey = k
            }
          }

          if (!oldestKey) break; // 没有可删除的条目

          // 删除最旧条目
          map.delete(oldestKey)
          accessTime.delete(oldestKey)
          logger.warn(`[createPersistedMap] 容量不足，回收条目 "${oldestKey}"`)

          try {
            // 重新序列化并尝试写入
            data = serialize()
            storage.setItem(storageKey, data)
            return // 写入成功，退出
          } catch (e2) {
            if (!isQuotaExceeded(e2)) {
              // 非容量错误则退出
              logger.error('[createPersistedMap] 持久化失败', e2)
              return
            }
            // 继续尝试删除
          }
        }

        if (map.size === 0) {
          logger.error('[createPersistedMap] 已清空所有条目，写入仍失败')
        } else {
          logger.error('[createPersistedMap] 无法释放足够空间，写入失败')
        }
      } else {
        logger.error('[createPersistedMap] 持久化失败', err)
      }
    }
  }

  // 查找并删除一个最旧条目
  function deleteOldestEntry() {
    if (map.size === 0) return false

    // 找到当前最旧条目
    let minTs = Infinity
    let oldestKey = null

    for (const [k, ts] of accessTime.entries()) {
      if (ts < minTs) {
        minTs = ts
        oldestKey = k
      }
    }

    if (oldestKey) {
      map.delete(oldestKey)
      accessTime.delete(oldestKey)
      logger.warn(`[createPersistedMap] LRU 回收 "${oldestKey}"`)
      return true
    }

    return false
  }

  return {
    /**
     * 读取 key
     * @param {string} key
     * @param {any} defaultValue
     */
    get(key, defaultValue = undefined) {
      if (map.has(key)) {
        accessTime.set(key, Date.now())
        schedulePersist()
        return map.get(key)
      }
      return defaultValue
    },

    /**
     * 设置 key，并异步节流持久化
     * @param {string} key
     * @param {any} value
     */
    set(key, value) {
      // 如果是新键且达到容量上限，删除最旧条目
      if (!map.has(key) && map.size >= maxEntries) {
        deleteOldestEntry()
      }

      map.set(key, value)
      accessTime.set(key, Date.now())
      schedulePersist()
    },

    /**
     * 判断是否包含指定键
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
      return map.has(key)
    },

    /**
     * 删除指定键
     * @param {string} key
     * @returns {boolean} 是否删除成功
     */
    delete(key) {
      const deleted = map.delete(key)
      if (deleted) {
        accessTime.delete(key)
        schedulePersist()
      }
      return deleted
    },

    /**
     * 判断是否过期：如果没有存，则返回 true
     * @param {string} key
     * @param {number} ttl   毫秒
     */
    isExpired(key, ttl) {
      if (!map.has(key)) return true
      const last = accessTime.get(key)
      return Date.now() - last >= ttl
    },

    /** 返回所有 [key, value] 数组 */
    entries() {
      return Array.from(map.entries())
    },

    /** 返回所有键 */
    keys() {
      return Array.from(map.keys())
    },

    /** 返回所有值 */
    values() {
      return Array.from(map.values())
    },

    /** 获取当前条目数量 */
    get size() {
      return map.size
    },

    /** 清空所有记录 */
    clear() {
      map.clear()
      accessTime.clear()
      try {
        storage.removeItem(storageKey)
      } catch (e) {
        logger.warn('[createPersistedMap] 清除失败', e)
      }
    }
  }
}

  /**
   * 管理一组正在上报（in‑flight）的 pageKey，防止重复采集。
   */
  export function useInFlight() {
    // 内部用一个 Set 来保存所有 in-flight 的 key
    const inFlight = new Set()

    return {
      /**
       * 判断某个 pageKey 是否正在上报
       * @param {string} pageKey
       * @returns {boolean}
       */
      isInFlight(pageKey) {
        console.log('isInFlight========', inFlight)
        return inFlight.has(pageKey)
      },

      /**
       * 将一个或多个 pageKey 标记为 in‑flight
       * @param {string|string[]} pageKeys
       */
      markInFlight(pageKeys) {
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
      clearInFlight(pageKeys) {
        if (Array.isArray(pageKeys)) {
          pageKeys.forEach(key => inFlight.delete(key))
        } else {
          inFlight.delete(pageKeys)
        }
      },
      /**
       * 清空所有 in-flight
       */
      clearAllInFlight() {
        inFlight.clear()
      }
    }
  }
