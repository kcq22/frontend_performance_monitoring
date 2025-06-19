module.exports = {
  testEnvironment: 'jsdom', // 模拟浏览器环境
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'], // 加载环境初始化
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'], // 匹配测试文件
  moduleFileExtensions: ['js', 'json'],
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.{js,vue}'],
  coverageDirectory: 'coverage',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1' // 若使用别名，可配置 alias
  }
}
