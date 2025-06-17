// jest.setup.js

// 在 Node 环境下给 window 一个最小 shape
global.window = {
  location: { pathname: '/' },
  addEventListener: () => {},
  removeEventListener: () => {}
}

// 给 performance 一个简单的实现
global.performance = {
  now: () => Date.now(),
  getEntriesByType: () => [],
  memory: { usedJSHeapSize: 0 }
}

// 如果用到 document.visibilityState
global.document = {
  visibilityState: 'visible',
  addEventListener: () => {},
  removeEventListener: () => {}
}
