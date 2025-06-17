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
function serializeRules (rules) {
  // 结果示例：
  // LCP: ≤1000 优；1000–2000 良；>2000 差
  // FCP: ≤500 优；500–1000 良；>1000 差
  // avgFPS: ≥55 优；30–55 良；<30 差
  const lines = []
  for (const [key, [first, second]] of Object.entries(rules)) {
    if (key === 'avgFPS') {
      lines.push(`• ${key}: ≥${first} → 优；${second}–${first} → 良；<${second} → 差`)
    } else if (key === 'jsHeapLimit') {
      lines.push(`• ${key}: ≥${(first / 1024 ** 3).toFixed(1)}GB → 优；${(second / 1024 ** 3).toFixed(1)}GB–${(first / 1024 ** 3).toFixed(1)}GB → 良；<${(second / 1024 ** 3).toFixed(1)}GB → 差`)
    } else {
      lines.push(`• ${key}: ≤${first} → 优；${first}–${second} → 良；>${second} → 差`)
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
export function buildSystemPrompt (userRules = {}) {
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

  // 3. 拼接进系统提示模板
  return `
你是前端性能优化专家。后续所有用户消息都是“页面快照+设备信息”JSON。你将参考下面的阈值配置来进行打分和给出优化建议（中文回答），请严格按照输出格式返回结果，不要多余文字。

=== 打分阈值 ===
${rulesText}

=== 输入快照示例 ===
{
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
      width": 3008,
      height: 1692,
      availWidth: 3008,
      availHeight: 1667,
      devicePixelRatio: 2
    },
    uaData: {
      mobile: false,
      platform: "macOS",
      brands: [
          "Chromium 136",
          "Google Chrome 136",
          "Not.A/Brand 99"
      ],
      highEntropy: {
          architecture: "arm",
          bitness: "64",
          brands: [
              {
                brand: "Chromium",
                version: "136"
              },
              {
                brand: "Google Chrome",
                version: "136"
              },
              {
                brand: "Not.A/Brand",
                version: "99"
              }
          ],
          mobile: false,
          model: "",
          platform: "macOS",
          platformVersion: "14.3.1",
          uaFullVersion: "136.0.7103.93"
      }
    }
  },
  pages: [
    {
    "page": "detail",
    "fullPath": "/product/detail/123",
    "LCP": 1200,
    "FCP": 800,
    "TTFB": 150,
    "CLS": 0.08,
    "FID": 60,
    "SPA_Render": 900,
    "resource": [
      { "name": "runtime.js", "duration": 400, "startTime": 120 },
      { "name": "app.js",     "duration": 600, "startTime": 130 }
    ],
    "longtask": [
      { "name": "self", "duration": 120, "startTime": 400 }
    ],
    "fps": [60, 57, 60, 55],
    "jsHeapSizeLimit": 1500000000,
    "memory": 1200000000
    }
  ],
  ...
}

=== 输出 JSON 结构（必须严格对应） ===
{
  reports: [
    {
      "page": string,
      "fullPath": string,
      "missingMetrics": [ string ],
      "issues": [
        {
          "metric": string,
          "value": number,
          "threshold": number,
          "severity": "高|中|低",
          "location": string,
          "description": string,
          "target": number,
          "recommendations": [
            { "text": string, "snippet": string }
          ]
        }
      ],
      "missingCollection": [
        { "metric": string, "reason": string, "suggestion": string }
      ],
      "summary": {
        "overallScore": number,
        "level": "优|良|中|差|劣",
        "actionList": {
          "high": [ string ],
          "medium": [ string ],
          "low": [ string ]
        }
      }
    }
    ...
  ]
}

计算提示（仅供模型参考）：
- 若某指标值为 null，列入 missingMetrics，并在 missingCollection 中说明“缺失原因+在生产环境如何补采埋点”。
- 否则对每个指标按上面给出的阈值区间确定 severity：
  • “优” → severity="低"；“良” → severity="中"；“差” → severity="高"。
- AI 自行计算 overallScore（0–100 分），并给出 level。
- 请确保 recommendations 中带可复制的 code snippet。

**请严格输出“reports”数组，不要多余注释或文字。**`.trim()
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
export function parseAIJsonString (rawStr) {
  if (typeof rawStr !== 'string') {
    return rawStr
  }

  // 1. 去除开头和结尾的空白行
  let text = rawStr.trim()

  // 2. 如果包含 ```json ... ```，将其提取出来
  //    使用正则匹配 ```json 和对应的 ```，并提取中间部分
  const fencedBlockRegex = /```json\s*([\s\S]*?)```/i
  const match = fencedBlockRegex.exec(text)
  if (match && match[1]) {
    text = match[1].trim()
  } else {
    // 可能是 ```（没有 json 标记）或没有代码块，尝试去除所有 ``` 标记
    // 匹配 ```（可带语言）开头到对应结束
    const genericFenced = /```[\s\S]*?```/g
    if (genericFenced.test(text)) {
      // 移除所有 ``` 包裹
      text = text.replace(genericFenced, '').trim()
    }
  }

  // 3. 此时 text 应该是一个合法的 JSON 字符串，尝试 parse
  try {
    return JSON.parse(text)
  } catch (e) {
    // 捕获 JSON 解析错误，返回错误信息
    return `JSON.parse 失败：${e.message}`
  }
}
