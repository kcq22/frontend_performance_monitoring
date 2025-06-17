/**
 * 内置默认阈值配置
 * 数组格式对于“值越小越好”的指标：[优阈值, 良阈值]
 * 对于“值越大越好”的指标（avgFPS），仍用 [优阈值, 良阈值]，
 * 但调用时会让 AI 知道这个是“越大越好”。
 */
export const defaultScoringRules = {
  LCP: [1000, 2000],
  FCP: [500, 1000],
  TTFB: [200, 500],
  CLS: [0.1, 0.25],
  FID: [50, 100],
  SPA_Render: [500, 1000],
  resourceTotal: [500, 1500],
  maxLongTask: [50, 200],
  avgFPS: [55, 30],
  jsHeapLimit: [1.5 * 1024 ** 3, 0.5 * 1024 ** 3] // 单位字节
}
