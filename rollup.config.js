import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import babel from '@rollup/plugin-babel';

const extensions = ['.js'];
const external = ['vue', 'vue-router', 'web-vitals'];

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
};

export default [
  // 1. 现代 ESM 构建（无 Babel 转换，供 Vite / webpack5）
  {
    input: 'src/index.js',
    external,
    output: {
      file: 'dist/index.mjs',
      format: 'es',
      sourcemap: true,
    },
    plugins: [resolve({ extensions }), commonjs()],
  },

  // 2. ESM 降级构建（经 Babel 转换，兼容旧 bundler）
  {
    input: 'src/index.js',
    external,
    output: {
      file: 'dist/index.esm.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      resolve({ extensions }),
      commonjs(),
      babel(babelOptions),
      terser({ output: { ecma: 5 } }),
    ],
  },

  // 3. CommonJS 构建（供 require() 使用）
  {
    input: 'src/index.js',
    external,
    output: {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
    plugins: [
      resolve({ extensions }),
      commonjs(),
      babel(babelOptions),
      terser({ output: { ecma: 5 } }),
    ],
  },
];
