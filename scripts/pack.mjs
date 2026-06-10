// 零依赖打包脚本：把 dist/ 打成 kankan-learn-v<version>.zip（用内置 zlib 组装 ZIP）。
// 用法：npm run pack（会先确保 dist 已构建）。跨平台，无需系统 zip / python。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { deflateRawSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')

if (!existsSync(distDir)) {
  console.error('✗ 没找到 dist/，请先运行 `npm run build`。')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const outName = `kankan-learn-v${pkg.version}.zip`
const outPath = join(root, outName)

// ---- CRC32 ----
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ---- 递归收集 dist 下所有文件 ----
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

const files = walk(distDir).sort()
const localParts = []
const central = []
let offset = 0
// 固定 DOS 时间，保证可复现构建（1980-01-01 00:00:00）
const DOS_TIME = 0
const DOS_DATE = 0x21

for (const full of files) {
  const name = relative(distDir, full).split(sep).join('/') // ZIP 内统一用 /
  const data = readFileSync(full)
  const crc = crc32(data)
  const comp = deflateRawSync(data, { level: 9 })
  const nameBuf = Buffer.from(name, 'utf8')

  // 本地文件头
  const lfh = Buffer.alloc(30)
  lfh.writeUInt32LE(0x04034b50, 0) // 签名
  lfh.writeUInt16LE(20, 4) // version needed
  lfh.writeUInt16LE(0x0800, 6) // flags：UTF-8 文件名
  lfh.writeUInt16LE(8, 8) // method = deflate
  lfh.writeUInt16LE(DOS_TIME, 10)
  lfh.writeUInt16LE(DOS_DATE, 12)
  lfh.writeUInt32LE(crc, 14)
  lfh.writeUInt32LE(comp.length, 18)
  lfh.writeUInt32LE(data.length, 22)
  lfh.writeUInt16LE(nameBuf.length, 26)
  lfh.writeUInt16LE(0, 28) // extra len
  localParts.push(lfh, nameBuf, comp)

  // 中央目录项
  const cdh = Buffer.alloc(46)
  cdh.writeUInt32LE(0x02014b50, 0)
  cdh.writeUInt16LE(20, 4) // version made by
  cdh.writeUInt16LE(20, 6) // version needed
  cdh.writeUInt16LE(0x0800, 8) // flags：UTF-8
  cdh.writeUInt16LE(8, 10)
  cdh.writeUInt16LE(DOS_TIME, 12)
  cdh.writeUInt16LE(DOS_DATE, 14)
  cdh.writeUInt32LE(crc, 16)
  cdh.writeUInt32LE(comp.length, 20)
  cdh.writeUInt32LE(data.length, 24)
  cdh.writeUInt16LE(nameBuf.length, 28)
  cdh.writeUInt16LE(0, 30) // extra
  cdh.writeUInt16LE(0, 32) // comment
  cdh.writeUInt16LE(0, 34) // disk
  cdh.writeUInt16LE(0, 36) // internal attrs
  cdh.writeUInt32LE(0, 38) // external attrs
  cdh.writeUInt32LE(offset, 42) // local header offset
  central.push(cdh, nameBuf)

  offset += lfh.length + nameBuf.length + comp.length
}

const centralBuf = Buffer.concat(central)
const localBuf = Buffer.concat(localParts)

// 中央目录结束记录
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0)
eocd.writeUInt16LE(0, 4) // disk
eocd.writeUInt16LE(0, 6) // cd start disk
eocd.writeUInt16LE(files.length, 8)
eocd.writeUInt16LE(files.length, 10)
eocd.writeUInt32LE(centralBuf.length, 12)
eocd.writeUInt32LE(localBuf.length, 16) // central dir offset
eocd.writeUInt16LE(0, 20) // comment len

writeFileSync(outPath, Buffer.concat([localBuf, centralBuf, eocd]))

const kb = (statSync(outPath).size / 1024).toFixed(1)
console.log(`✓ 已打包 ${outName}（${files.length} 个文件，${kb} KB）`)
console.log(`  路径：${outPath}`)
