#!/usr/bin/env node
// 全局字体排版一致性扫描器（方案：根目录《全局字体排版一致性设计方案-2026-09-05.md》附录 A）
// 用法：node scripts/check-typography.mjs [目录，默认 src]
// 检出违禁 exit 1；warn 项不影响退出码。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] || 'src';
// 白名单：驾驶舱统计卡大数字允许 text-2xl/3xl（本仓库统计页在 pages/archive-stats 与 components/stats）
const BIG_NUM_WHITELIST = /pages[\\/]archive-stats[\\/]|components[\\/]stats[\\/]/;

const RULES = [
  { re: /text-\[(?:8|9|9\.5|10|10\.5|11)(?:px)?\]/g, level: 'error', msg: '12px 以下字号已禁止，归并到 text-aux(12px/text-xs)' },
  { re: /text-\[(?!13px\])\d+(?:\.\d+)?px\]/g,       level: 'error', msg: '任意 px 字号已禁止，字阶闭集只有 12/14/15/16/20（用 text-xs|text-sm|text-tab|text-base|text-xl）' },
  { re: /text-lg\b/g,                                level: 'error', msg: 'text-lg(18px) 已淘汰，用 text-base(16px, title 档)' },
  { re: /text-(2xl|3xl|4xl)\b/g,                     level: 'error', msg: '超档字号仅驾驶舱统计卡可用（pages/stats 白名单），其余用 text-xl(20px)', skip: f => BIG_NUM_WHITELIST.test(f) },
  { re: /text-\[13px\]/g,                            level: 'warn',  msg: '13px 已淘汰：主信息→text-sm，辅助→text-xs' },
];

let errors = 0, warns = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p); continue; }
    if (!/\.tsx?$/.test(name)) continue;
    const src = readFileSync(p, 'utf8');
    src.split('\n').forEach((line, i) => {
      for (const { re, level, msg, skip } of RULES) {
        if (skip?.(p)) continue;
        re.lastIndex = 0;
        if (re.test(line)) {
          const rel = relative(process.cwd(), p);
          console[level === 'error' ? 'error' : 'warn'](`${rel}:${i + 1}  ${line.trim().slice(0, 100)}\n    ↳ ${msg}`);
          level === 'error' ? errors++ : warns++;
        }
      }
    });
  }
}
walk(root);
console.log(`\ntypography-check: ${errors} error(s), ${warns} warning(s)`);
process.exit(errors ? 1 : 0);
