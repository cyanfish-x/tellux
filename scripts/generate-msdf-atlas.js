import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import generateBMFont from 'msdf-bmfont-xml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 配置
const CONFIG = {
  // 常用3500汉字 + 英文数字符号
  charset: [
    // 数字
    '0123456789',
    // 英文字母
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    // 常用标点和符号
    '。，！？；：“”‘’（）《》【】、·—…￥%@#&*+-=×÷<>',
    // 高频3500汉字（GB2312一级字库子集）
    '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张信马节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究观越织装影算低持音众书布复容儿须际商非验连断深难近矿千周委素技备半办青省列习响约支般史感劳便团往酸历市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院查江型眼王按格养易置派层片始却专状育厂京识适属圆包火住调满县局照参红细引听该铁价严',
    '龙首领导师民众百姓城市乡村街道社区学校医院公司企业商店餐厅酒店银行邮局车站机场港口码头桥梁隧道公路铁路地铁站台广场公园景区景点博物馆图书馆体育馆影剧院展览馆会议中心购物中心超市便利店药店医疗美容健身游泳球场网球篮排羽毛乒乓台球保龄滑冰滑雪登山徒步骑行跑步游泳潜水冲浪帆船钓鱼露营烧烤野餐摄影绘画书法音乐舞蹈戏剧电影电视动漫游戏阅读写作演讲辩论科研教育培训咨询服务维修装修租赁销售购买订购预订预约挂号就诊检查治疗手术住院出院康复护理保健养生美食小吃特色名优土特产工艺品纪念品礼品玩具文具办公用品家具家电服装鞋帽箱包首饰化妆品日用品食品饮料烟酒茶糖果零食蔬菜水果肉类海鲜粮油调料'
  ].join(''),

  // 字体配置：fontFile 为字体文件路径，会被读取成 buffer 传入（绕过 opentype.loadSync 的 Windows 问题）
  // 跨平台提示：macOS 可用 /System/Library/Fonts/STHeiti Light.ttc，Linux 需安装中文字体
  fonts: [
    {
      name: 'SimHei',
      fontFile: 'C:/Windows/Fonts/simhei.ttf',  // Windows 黑体（含中文）
      outputName: 'simhei-regular'
    }
  ],

  // MSDF参数
  // fontSize 必须足够大让中文字符笔画（细到 2-3px）的距离场饱和——24px 下
  // distanceRange=8 会让整个字形落在边缘过渡区（median max 仅 ~148 而非 255），
  // 渲染时 smoothstep 无法区分内外，文字发糊。用较大的 fontSize=42。
  //
  // distanceRange 决定两件事：
  // 1. 小字号下的 screenPxRange：渲染 13px 时 ≈ (13/42)·distanceRange。msdfgen 推荐
  //    屏幕 pxrange ≥ 2；distanceRange=4 时仅 ~1.2px，CJK 细笔画偏薄发虚。
  // 2. shader 描边（halo）的最大可表达宽度 ≈ 0.5·distanceRange（atlas px）。
  //    1.2 css px 的 halo 在 13px 字号下 ≈ 1.2·(42/13) ≈ 3.9 atlas px，需要
  //    distanceRange ≥ 8（±4px），否则 halo 被 shader clamp 变细。
  msdfParams: {
    outputType: 'json',
    textureSize: [2048, 2048],
    fontSize: 42,
    distanceRange: 8,
    smartSize: true,
    roundDecimal: 2
  },

  outputDir: join(__dirname, '../examples/public/fonts')
}

function generateCharsetFile() {
  const charsetPath = join(__dirname, 'charset.txt')

  // 从 examples 目录扫描所有 .ts 文件，提取中文字符，确保示例文字 100% 命中 atlas
  const examplesDir = join(__dirname, '../examples')
  const scannedChars = scanExampleFiles(examplesDir)
  if (scannedChars.length > 0) {
    console.log(`✓ 从 examples 扫描到 ${scannedChars.length} 个中文字符`)
  }

  // 合并预定义 charset + 扫描字符，去重
  const uniqueChars = [...new Set([...CONFIG.charset, ...scannedChars])].join('')
  writeFileSync(charsetPath, uniqueChars, 'utf8')
  console.log(`✓ 生成字符集文件: ${uniqueChars.length} 个字符`)
  return uniqueChars
}

/**
 * 递归扫描目录下所有 .ts 文件，提取中文字符（CJK 统一汉字范围）。
 * 确保示例中实际渲染的文字都进入 atlas，避免回退到 TinySDF。
 */
function scanExampleFiles(dir) {
  const chars = new Set()
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      // 跳过 node_modules / dist 等
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue
      for (const ch of scanExampleFiles(fullPath)) chars.add(ch)
    } else if (entry.name.endsWith('.ts')) {
      const content = readFileSync(fullPath, 'utf8')
      for (const ch of content) {
        const code = ch.codePointAt(0)
        // CJK 统一汉字基本区 + 扩展A区
        if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) {
          chars.add(ch)
        }
      }
    }
  }
  return [...chars]
}

function ensureOutputDir() {
  if (!existsSync(CONFIG.outputDir)) {
    mkdirSync(CONFIG.outputDir, { recursive: true })
  }
}

function generateMsdfAtlas(font, charset) {
  const outputPath = join(CONFIG.outputDir, font.outputName)

  console.log(`\n生成 MSDF atlas: ${font.name}`)
  console.log(`  字体文件: ${font.fontFile}`)
  console.log(`  输出: ${outputPath}`)

  // 读取字体为 buffer —— generateBMFont 对 buffer 走 opentype.parse（可用），
  // 对字符串路径走 opentype.loadSync（Windows 上会返回无 outlinesFormat 的对象）
  const fontBuffer = readFileSync(font.fontFile)

  const opt = {
    filename: outputPath,
    outputType: CONFIG.msdfParams.outputType,
    textureSize: CONFIG.msdfParams.textureSize,
    fontSize: CONFIG.msdfParams.fontSize,
    distanceRange: CONFIG.msdfParams.distanceRange,
    fieldType: 'msdf',
    charset,
    smartSize: CONFIG.msdfParams.smartSize,
    roundDecimal: CONFIG.msdfParams.roundDecimal
  }

  return new Promise((resolve) => {
    // 回调签名: (error, textures, fontFile)
    //   textures: [{ filename, texture }]  texture 为 PNG buffer，filename 不含扩展名
    //   fontFile: { filename, data }       data 为 JSON 字符串，filename 已含 .json
    generateBMFont(fontBuffer, opt, (error, textures, fontFile) => {
      if (error) {
        console.error(`✗ 生成失败: ${error.message}`)
        resolve(false)
        return
      }
      console.log(`✓ 成功生成 ${font.outputName}`)

      // 写入 PNG 纹理（tex.filename 是正确的 fontDir+basename，无扩展名）
      let pngCount = 0
      for (const tex of textures) {
        const pngPath = `${tex.filename}.png`
        writeFileSync(pngPath, tex.texture)
        pngCount++
      }

      // 解析 JSON，补充 distanceRange 元数据后写回
      // 注意：fontFile.filename 因库内部 fontface=完整路径而被重复拼接，故用 outputPath
      const data = JSON.parse(fontFile.data)
      data.distanceRange = CONFIG.msdfParams.distanceRange
      data.info.face = font.outputName  // 修正 face（库用完整路径污染了它）
      const jsonPath = `${outputPath}.json`
      writeFileSync(jsonPath, JSON.stringify(data))

      const charCount = data.chars ? data.chars.length : 0
      console.log(`  - ${charCount} 个字符`)
      console.log(`  - ${pngCount} 张 PNG 纹理`)
      console.log(`  - Atlas尺寸: ${data.common.scaleW}×${data.common.scaleH}`)
      console.log(`  - distanceRange: ${data.distanceRange}`)
      console.log(`  - JSON: ${jsonPath}`)
      resolve(true)
    })
  })
}

function postProcess(font) {
  // distanceRange 已在 generateMsdfAtlas 中写入 JSON，此处仅做存在性校验
  const jsonPath = join(CONFIG.outputDir, `${font.outputName}.json`)
  if (!existsSync(jsonPath)) {
    console.warn(`警告: 未找到 ${jsonPath}`)
  }
}

async function main() {
  console.log('=== 生成 MSDF Atlas ===\n')

  const charset = generateCharsetFile()
  ensureOutputDir()

  let successCount = 0
  for (const font of CONFIG.fonts) {
    const ok = await generateMsdfAtlas(font, charset)
    if (ok) {
      postProcess(font)
      successCount++
    }
  }

  console.log(`\n=== 完成 ===`)
  console.log(`成功: ${successCount}/${CONFIG.fonts.length}`)

  if (successCount < CONFIG.fonts.length) {
    process.exit(1)
  }
}

main()
