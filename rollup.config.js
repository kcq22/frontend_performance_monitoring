// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import babel from '@rollup/plugin-babel';

const extensions = ['.js', '.jsx', '.ts', '.tsx'];

export default [
  // CommonJS 构建
  {
    input: 'src/index.js',
    output: {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      sourcemap: true
    },
    plugins: [
      resolve({ extensions }),
      commonjs(),
      babel({
        extensions,
        babelHelpers: 'bundled',
        include: ['src/**/*'],            // 只编译你的源码
        exclude: 'node_modules/**',       // 排除第三方库
        presets: [
          ['@babel/preset-env', {
            targets: '> 0.25%, not dead', // 兼容主流浏览器
            modules: false               // 保持 ESModule 交给 Rollup 处理
          }]
        ]
      }),
      terser()
    ]
  },
  // ES Module 构建
  {
    input: 'src/index.js',
    output: {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      resolve({ extensions }),
      commonjs(),
      babel({
        extensions,
        babelHelpers: 'bundled',
        include: ['src/**/*'],
        exclude: 'node_modules/**',
        presets: [
          ['@babel/preset-env', {
            targets: '> 0.25%, not dead',
            modules: false
          }]
        ]
      }),
      terser()
    ]
  }
];
