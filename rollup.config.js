import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import { terser } from 'rollup-plugin-terser'
import babel from '@rollup/plugin-babel'
import filesize from 'rollup-plugin-filesize'
import { visualizer } from 'rollup-plugin-visualizer';

const extensions = ['.js']
const external = ['vue', 'vue-router']
const isProd = process.env.NODE_ENV === 'production'

const babelOptions = {
  extensions,
  babelHelpers: 'bundled',
  exclude: 'node_modules/**',
  presets: [
    [
      '@babel/preset-env',
      {
        targets: '> 0.25%, not dead',
        modules: false,
      },
    ],
  ],
}

export default [
  // 1. 现代 ESM 构建（无 Babel 转换，供 Vite / webpack5）
  {
    input: 'src/index.js',
    external,
    output: {
      file: 'dist/index.mjs',
      format: 'es',
      sourcemap: !isProd,
    },
    plugins: [
      resolve({ extensions }),
      commonjs(),
      filesize(),
      terser({
        compress: { drop_console: true },
        format: {
          ecma: 2015,
          comments: false
        },
      }),
      visualizer({
        filename: 'stats.html',    // 输出文件名
        open: false,             // 构建后自动打开浏览器
        gzipSize: true,            // 同时计算 gzipped 大小
        brotliSize: true           // 也可计算 Brotli 大小
      }),
    ],
  },

  // 2. ESM 降级构建（经 Babel 转换，兼容旧 bundler）
  {
    input: 'src/index.js',
    external,
    output: {
      file: 'dist/index.esm.js',
      format: 'es',
      sourcemap: !isProd,
    },
    plugins: [
      resolve({ extensions }),
      commonjs(),
      babel(babelOptions),
      terser({ output: { ecma: 5 } }),
      filesize(),
    ],
  },

  // 3. CommonJS 构建（供 require() 使用）
  {
    input: 'src/index.js',
    external,
    output: {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      sourcemap: !isProd,
      exports: 'named',
    },
    plugins: [
      resolve({ extensions }),
      commonjs(),
      babel(babelOptions),
      terser({ output: { ecma: 5 } }),
      filesize(),
    ],
  },
]
