import { defaultScoringRules } from './const'

/**
 * 通用控制台展示函数：把 AI 返回的 Markdown 内容按 “### ” 标题分组，
 * 自动识别各标题，不依赖具体页面名称，然后在控制台折叠显示每个部分。
 *
 * @param {object} result AI 接口返回的完整 JSON 对象
 */
export function showAIAnalysisGeneric (result) {
  const content = result?.choices?.[0]?.message?.content || ''
  if (!content) {
    console.warn('[AIAnalyzer] 返回结果为空或无效')
    return
  }

  // 将内容按 "### " 拆分为多个部分，忽略开头可能的空段
  const rawSections = content.split(/^###\s+/m).slice(1)

  console.group('%c[AIAnalyzer] 📊 性能分析结果', 'color: #409EFF; font-weight: bold;')

  rawSections.forEach((section) => {
    // section 格式如： "登录页 `/login` 性能瓶颈分析\n\n内容…"
    // 先按首行拆出标题，剩余为该节的正文
    const lines = section.split('\n')
    const titleLine = lines.shift().trim() // 取第一行作为标题
    const body = lines.join('\n').trim() // 剩余行作为正文

    // 在控制台折叠此节内容
    console.groupCollapsed(`🔹 ${titleLine}`)
    console.log(body)
    console.groupEnd()
  })

  console.groupEnd()
}

/**
 * 尽可能采集当前浏览器环境的详细信息。
 * 注意：由于浏览器安全沙箱，无法获取 CPU 型号、硬盘容量等深度信息。
 * @returns {object} environmentInfo
 */
export function collectEnvironmentInfo () {
  const info = {}

  // 1. 操作系统 & 浏览器（优先使用 UserAgentData，如果可用）
  const uaData = navigator.userAgentData || null
  if (uaData) {
    // “userAgentData” 可能包含 brands、mobile、platform 等
    info.uaData = {
      mobile: uaData.mobile, // 布尔，是否移动设备
      platform: uaData.platform || (uaData.os || null), // 操作系统名称，如 "Windows"、"Android"
      brands: uaData.brands ? uaData.brands.map(b => `${b.brand} ${b.version}`) : []
      // 某些浏览器会给出 highEntropyValues: {platformVersion, fullVersionList}
    }
    // 如果你想拿到更具体的高熵值，还可以：
    if (uaData.getHighEntropyValues) {
      uaData.getHighEntropyValues([
        'platformVersion',
        'uaFullVersion',
        'architecture',
        'model',
        'bitness'
      ]).then(high => {
        info.uaData.highEntropy = high
      }).catch(() => {
        /* 忽略错误，这些值可能因隐私而拒绝 */
      })
    }
  } else {
    // fallback 到传统 userAgent / platform
    info.userAgent = navigator.userAgent || null
    info.platform = navigator.platform || null
  }

  // 2. CPU 核心数 & 设备内存大致档位
  const approxMemory = navigator.deviceMemory || null
  let memoryCategory = '未知'
  if (approxMemory !== null) {
    if (approxMemory >= 8) memoryCategory = '高（≥8 GB）'
    else if (approxMemory >= 4) memoryCategory = '中（4–8 GB）'
    else memoryCategory = '低（<4 GB）'
  }
  info.hardware = {
    logicalProcessors: navigator.hardwareConcurrency || null, // 逻辑核心数
    approxDeviceMemoryGB: approxMemory, // 设备内存，单位 GB（Chrome 支持）
    // 加个字段标注“高/中/低”档位
    memoryApproxCategory: memoryCategory
  }

  // 3. 屏幕与显示
  info.screen = {
    width: window.screen?.width || null,
    height: window.screen?.height || null,
    availWidth: window.screen?.availWidth || null,
    availHeight: window.screen?.availHeight || null,
    devicePixelRatio: window.devicePixelRatio || 1
  }

  // 4. GPU 信息（通过 WebGL 上下文反推）
  info.gpu = (function() {
    try {
      // 创建一个离屏 WebGL Context
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (!gl) return null
      // WEBGL_debug_renderer_info 扩展可拿到更细粒度信息
      const dbgRenderInfo = gl.getExtension('WEBGL_debug_renderer_info')
      const renderer = dbgRenderInfo
        ? gl.getParameter(dbgRenderInfo.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER)
      const vendor = dbgRenderInfo
        ? gl.getParameter(dbgRenderInfo.UNMASKED_VENDOR_WEBGL)
        : gl.getParameter(gl.VENDOR)
      return {
        renderer: renderer || 'unknown',
        vendor: vendor || 'unknown'
      }
    } catch (e) {
      return null
    }
  })()

  // 6. 语言 & 时区
  // info.locale = {
  //   language: navigator.language || null,
  //   languages: navigator.languages || [],
  //   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || null
  // }

  // 7. Cookie/Storage 支持情况
  // info.storage = {
  //   cookieEnabled: navigator.cookieEnabled,
  //   localStorage: (() => {
  //     try {
  //       localStorage.setItem('__test', '1')
  //       localStorage.removeItem('__test')
  //       return true
  //     } catch {
  //       return false
  //     }
  //   })(),
  //   sessionStorage: (() => {
  //     try {
  //       sessionStorage.setItem('__test', '1')
  //       sessionStorage.removeItem('__test')
  //       return true
  //     } catch {
  //       return false
  //     }
  //   })()
  // }

  // // 8. 浏览器插件（仅做参考，现代浏览器插件较少）
  // if (navigator.plugins) {
  //   info.plugins = Array.from(navigator.plugins).map(p => p.name)
  // } else {
  //   info.plugins = []
  // }
  // localStorage.setItem('environment', info)
  return info
}

/**
 * 把“阈值配置”序列化成一段文字，方便拼进 system 提示里。
 */
function serializeRules(
  rules,
  {
    higherBetter = ['avgFPS', 'fps'],
    byteMetrics = ['jsHeapLimit', 'usedJSHeap']
  } = {}
) {
  const lines = []

  const formatValue = (metric, v) => {
    if (byteMetrics.includes(metric)) {
      // 如果 v > 1 GB，则以 GB 显示，否则 MB
      const gb = v / (1024 ** 3)
      if (gb >= 1) return `${gb.toFixed(1)}GB`
      const mb = v / (1024 ** 2)
      return `${mb.toFixed(1)}MB`
    }
    return String(v)
  }

  for (const [metric, [good, mid]] of Object.entries(rules)) {
    const isHigherBetter = higherBetter.includes(metric)

    // 格式化阈值值
    const goodFmt = formatValue(metric, good)
    const midFmt  = formatValue(metric, mid)

    if (isHigherBetter) {
      // 越大越好： ≥ mid → 优； good–mid → 良； < good → 差
      lines.push(
        `• ${metric}: ≥${midFmt} → 优；${goodFmt}–${midFmt} → 良；<${goodFmt} → 差`
      )
    } else {
      // 越小越好： ≤ good → 优；good–mid → 良；>mid → 差
      lines.push(
        `• ${metric}: ≤${goodFmt} → 优；${goodFmt}–${midFmt} → 良；>${midFmt} → 差`
      )
    }
  }

  return lines.join('\n')
}

/**
 * 生成最终给 AI 的 system 提示（字符串）
 * @param {object} userRules  用户传入的阈值（可能只包含部分 key）
 *                           格式同 defaultScoringRules（键相同，值为 [优阈值, 良阈值]）
 * @returns {string}
 */
export function buildSystemPrompt(userRules = {}) {
  // 创建有效规则的副本（基于默认规则）
  const effectiveRules = { ...defaultScoringRules }

  // 如果存在用户规则，进行合并
  if (userRules) {
    Object.entries(userRules).forEach(([key, val]) => {
      // 仅当同时满足以下条件时更新规则：
      // 1. 该键存在于默认规则中（防止添加新规则）
      // 2. 值是数组
      // 3. 数组长度恰好为2
      if (
        key in defaultScoringRules &&
        Array.isArray(val) &&
        val.length === 2
      ) {
        effectiveRules[key] = val
      }
    })
  }

  // 2. 把合并后的阈值格式化成一段可读文本
  const rulesText = serializeRules(effectiveRules)

  // 2. 准备示例快照（最新版结构），如果外部未传，则使用默认示例
  const defaultSnapshot = {
    environment: {
      gpu: {
        renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)",
        vendor: "Google Inc. (Apple)"
      },
      hardware: {
        logicalProcessors: 8,
        approxDeviceMemoryGB: 8,
        memoryApproxCategory: "高（≥8 GB）"
      },
      screen: {
        width: 3008,
        height: 1692,
        availWidth: 3008,
        availHeight: 1667,
        devicePixelRatio: 2
      },
      uaData: {
        mobile: false,
        platform: "macOS",
        brands: [
          { brand: "Chromium", version: "136" },
          { brand: "Google Chrome", version: "136" },
          { brand: "Not.A/Brand", version: "99" }
        ],
        highEntropy: {
          architecture: "arm",
          bitness: "64",
          model: "",
          platform: "macOS",
          platformVersion: "14.3.1",
          uaFullVersion: "136.0.7103.93"
        }
      }
    },
    pages: [
      {
        page: "detail",
        fullPath: "/product/detail/123",
        LCP: 1200,
        FCP: 800,
        TTFB: 150,
        CLS: 0.08,
        FID: 60,
        SPA_Render: 900,
        resourceStats: { count: 153, avgTime: 51.849, maxTime: 350.5 },
        longTaskStats: { count: 4, avgTime: 131.5, maxTime: 248 },
        fpsSamples: [60, 57, 60, 55],
        usedJSHeapMB: 1200000000,
      }
    ]
  }
  const example = defaultSnapshot || {}
  // 用 2 格缩进美化
  const snapshotText = JSON.stringify(example, null, 2)

  // —— 3. 定义输出 Schema 并序列化 ——
  const outputSchema = {
    reports: [
      {
        page: "string",
        fullPath: "string",
        missingMetrics: ["string"],
        issues: [
          {
            metric: "string",
            value: "number",
            threshold: "number",
            severity: "高|中|低",
            location: "string",
            description: "string",
            target: "number",
            recommendations: [
              { text: "string", snippet: "string" }
            ]
          }
        ],
        summary: {
          overallScore: "number",
          level: "优|良|中|差|劣",
          actionList: {
            high: ["string"],
            medium: ["string"],
            low: ["string"]
          }
        }
      }
    ]
  }
  const schemaText = JSON.stringify(outputSchema, null, 2)

  // 3. 拼接进系统提示模板
  return `
你是前端性能优化专家。后续所有用户消息都是“页面快照+设备信息”JSON。你将参考下面的阈值配置来进行打分和给出优化建议（中文回答），请严格按照输出格式返回结果，不要多余文字。

=== 打分阈值 ===
${rulesText}

=== 输入快照示例 ===
\`\`\`json
${snapshotText}
\`\`\`

=== 输出 JSON 结构（必须严格对应） ===
\`\`\`json
${schemaText}
\`\`\`

计算提示（仅供模型参考）：
- 对每个指标按上面给出的阈值区间确定 severity：
  • “优” → severity="低"；“良” → severity="中"；“差” → severity="高"。
- AI 自行计算 overallScore（0–100 分），并给出 level。
- 请确保 recommendations 中带可复制的 code snippet。

=== 输出要求（必须遵守） ===
- 必须仅返回合法 JSON 字符串；
- JSON 必须使用 \`\`\`json 包裹；
- JSON 最外层必须为对象，必须包含 "reports": [...] 字段；
- 不要包含任何解释说明、开头/结尾语句、注释、标题或多余内容；
- 严格按照 schema 格式结构返回；
- 如遇无法解析的数据，也应返回结构完整的 JSON，并标注为空或 reason 字段。
`.trim()
}

/**
 * 尝试从一段包含 Markdown 代码块（```json ... ```）的字符串中提取纯 JSON 并解析为对象。
 * 如果没有检测到代码块，也会尝试直接 JSON.parse。
 *
 * @param {string} rawStr - AI 返回的原始字符串，可能带有 ```json ``` 包裹和多余空行
 * @returns {string}
 *    - success: 是否解析成功
 *    - data:   如果 success 为 true，则为解析后的 JS 对象
 *    - error:  如果 success 为 false，则为错误信息
 */
export function parseAIJsonString(rawStr) {
  if (typeof rawStr !== 'string') return rawStr;

  // 1. 清理首尾空白字符
  let text = rawStr.trim();

  // 2. 提取 Markdown 代码块中的 JSON 内容（优先 ` ```json `）
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (jsonBlockMatch) {
    text = jsonBlockMatch[1].trim();
  } else {
    // 普通 ``` 包裹（无 json 标签）
    const genericBlocks = text.match(/```[\s\S]*?```/g);
    if (genericBlocks) {
      text = genericBlocks
        .map(b => b.replace(/```[\w]*\s*/g, '').replace(/```$/, '').trim())
        .join('\n');
    }
  }

  // 3. 标准 JSON 解析尝试
  try {
    return JSON.parse(text);
  } catch (e1) {}

  // 4. 尝试转义修复
  try {
    const cleanedStr = text
      .replace(/^"(.*)"$/, '$1')       // 去除整体包裹引号
      .replace(/\\"/g, '"')            // 转义引号
      .replace(/\\\\/g, '\\')          // 转义反斜线
      .replace(/\\n/g, '\n')           // 换行
      .replace(/\\t/g, '\t');          // 制表符

    return JSON.parse(cleanedStr);
  } catch (e2) {}

  // 5. 最后尝试：提取对象、修复单引号
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);

    const singleQuoteFix = text.replace(/'/g, '"');
    return JSON.parse(singleQuoteFix);
  } catch (e3) {
    console.error('JSON.parse 错误:', e3);
    return rawStr; // 返回原始字符串，避免程序崩溃
  }
}

/**
 * 规范化 URL，只保留「路由部分」
 * - 若包含 hash（“#/...”），则返回 hash 里的路径部分
 * - 否则用 new URL 拿 pathname
 *
 * @param {string} fullUrl
 * @returns {string} 例如 "/sub_pages_boutique_mall/pages/detail/detail"
 */
export function normalizePath(fullUrl) {
  try {
    const url = new URL(fullUrl, window.location.origin)
    const hash = url.hash // 带 '#'
    if (hash && hash.startsWith('#/')) {
      // 去掉首个 '#'，然后再去掉查询参数
      return hash.slice(1).split('?')[0]
    }
    // 无 hash 或 hash 不是路由，则返回 pathname（不带查询）
    return url.pathname
  } catch (e) {
    // 兜底：手动拆
    const parts = fullUrl.split('#')
    if (parts[1] && parts[1].startsWith('/')) {
      return parts[1].split('?')[0]
    }
    return parts[0].split('?')[0]
  }
}

/**
 * 将数字固定到指定小数位数
 * @param {number|string} number - 要处理的数字
 * @param {number} [fixed=3] - 要保留的小数位数，默认为3
 * @returns {number|*} 处理后的数字，如果输入不是有效数字则原样返回
 */
export function numberFixed(number, fixed = 3) {
  // 1. 检查number是否为null或undefined
  if (number == null) return number

  // 2. 检查fixed是否为有效正整数
  const parsedFixed = Math.max(0, Math.min(20, Math.floor(Number(fixed)) || 3))

  try {
    // 3. 尝试转换为数字
    const num = Number(number)

    // 4. 检查是否为有效数字
    if (Number.isNaN(num) || !Number.isFinite(num)) {
      return number
    }

    // 5. 使用更精确的四舍五入方法
    const factor = Math.pow(10, parsedFixed)
    return Math.round((num + Number.EPSILON) * factor) / factor
  } catch (e) {
    // 6. 捕获任何意外错误
    return number
  }
}
