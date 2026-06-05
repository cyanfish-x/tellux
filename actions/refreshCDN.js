// Depends on tencentcloud-sdk-nodejs version 4.0.3 or higher

import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)

const dotenv = require("dotenv")
const tencentcloud = require("tencentcloud-sdk-nodejs-cdn")

dotenv.config({ path: path.resolve(__dirname, ".env") })

const CdnClient = tencentcloud.cdn.v20180606.Client
const flushPaths = parseCdnFlushPaths(process.env.CDN_FLUSH_PATHS)

function parseCdnFlushPaths(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

if (flushPaths.length === 0) {
  throw new Error("缺少 CDN_FLUSH_PATHS，请在 actions/.env 中配置 CDN 缓存刷新路径")
}

// 密钥信息从 actions/.env 读取，需要提前设置 CDN_SECRET_ID 和 CDN_SECRET_KEY
// 使用环境变量方式可以避免密钥硬编码在代码中，提高安全性
// 生产环境建议使用更安全的密钥管理方案，如密钥管理系统(KMS)、容器密钥注入等
// 请参见：https://cloud.tencent.com/document/product/1278/85305
// 密钥可前往官网控制台 https://console.cloud.tencent.com/cam/capi 进行获取
const clientConfig = {
  credential: {
    secretId: process.env.CDN_SECRET_ID,
    secretKey: process.env.CDN_SECRET_KEY,
  },
  region: "ap-chengdu",
  profile: {
    httpProfile: {
      endpoint: "cdn.tencentcloudapi.com",
    },
  },
}

// 实例化要请求产品的client对象,clientProfile是可选的
const client = new CdnClient(clientConfig)
const params = {
  Paths: flushPaths,
  FlushType: "flush",
}
client.PurgePathCache(params).then(
  (data) => {
    console.log(data)
  },
  (err) => {
    console.error("error", err)
  }
)
