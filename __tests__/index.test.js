import { PerfCollector } from '../src/PerfCollector';

describe('PerfCollector 基本功能', () => {
  it('初始化时应有正确的 metrics 结构', () => {
    const collector = new PerfCollector(() => {}, { maxFpsSamples: 5, ttl: 1000 });
    expect(collector.metrics).toEqual({
      LCP: null,
      FCP: null,
      TTFB: null,
      CLS: 0,
      FID: null,
      resourceEntries: [],
      longtaskEntries: [],
      memory: null,
      fpsSamples: [],
      SPA_Render: null
    });
  });

  it('resetMetrics 应该重置所有指标', () => {
    const collector = new PerfCollector(() => {}, { maxFpsSamples: 5, ttl: 1000 });
    collector.metrics.LCP = 123;
    collector.metrics.fpsSamples.push(60);
    collector.resetMetrics();
    expect(collector.metrics).toEqual({
      LCP: null,
      FCP: null,
      TTFB: null,
      CLS: 0,
      FID: null,
      resourceEntries: [],
      longtaskEntries: [],
      memory: null,
      fpsSamples: [],
      SPA_Render: null
    });
  });

  it('buildSnapshot 应返回包含 pageName、fullPath、timestamp 等字段', () => {
    const collector = new PerfCollector(() => {}, { maxFpsSamples: 5, ttl: 1000 });
    // 模拟设置部分 metrics
    collector.metrics.LCP = 500;
    collector.metrics.resourceEntries.push({ name: 'a.js', duration: 10, startTime: 5 });
    const snapshot = collector.buildSnapshot('home', '/home?foo=bar');
    expect(snapshot).toMatchObject({
      pageName: 'home',
      fullPath: '/home?foo=bar',
      LCP: 500,
      resource: [{ name: 'a.js', duration: 10, startTime: 5 }]
    });
    expect(typeof snapshot.timestamp).toBe('number');
  });
});
