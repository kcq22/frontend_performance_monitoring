// CollectHardVitals.js
import { getLCP, getFCP, getTTFB, getCLS, getFID } from 'web-vitals'

/**
 * 在“硬导航”（首次加载）时采集 Core Web Vitals：
 * LCP、FCP、TTFB、CLS、FID。
 * @param {(metric: { name: string, value: number, id?: string }) => void} callback
 */
export function collectHardVitals (callback) {
  getLCP((metric) => callback(metric))
  getFCP((metric) => callback(metric))
  getTTFB((metric) => callback(metric))
  getCLS((metric) => callback(metric))
  getFID((metric) => callback(metric))
}
