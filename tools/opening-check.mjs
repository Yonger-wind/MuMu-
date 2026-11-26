/* 开场动画模块的静态检查：语法 + 导出名 + 定义字段。
   用法：node tools/opening-check.mjs [cicada|qinglv|moonlight|vortex ...]（缺省全部）
   只做模块级检查，不跑动画。 */
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPORTS = { vortex: 'VORTEX', cicada: 'CICADA', qinglv: 'QINGLV', moonlight: 'MOONLIGHT' };
const wanted = process.argv.slice(2).filter((a) => EXPORTS[a]) ;
const keys = wanted.length ? wanted : Object.keys(EXPORTS);
let bad = 0;

for (const key of keys) {
  const file = resolve(HERE, '..', 'scripts', 'openings', key + '.js');
  try {
    const mod = await import(pathToFileURL(file).href);
    const def = mod[EXPORTS[key]];
    if (!def) throw new Error(`没有导出 ${EXPORTS[key]}`);
    for (const f of ['key', 'title', 'ariaLabel', 'params', 'create']) {
      if (def[f] === undefined) throw new Error(`缺少字段 ${f}`);
    }
    if (def.key !== key) throw new Error(`key 应为 '${key}'，实际 '${def.key}'`);
    if (typeof def.params.speed !== 'number' || typeof def.params.density !== 'number') {
      throw new Error('params 需要 speed 与 density');
    }
    if (typeof def.create !== 'function') throw new Error('create 不是函数');
    console.log(`OK  ${key}.js  《${def.title}》 speed=${def.params.speed} density=${def.params.density} scaleCap=${def.scaleCap} titleAt=${def.titleAt}`);
  } catch (err) {
    bad++;
    console.log(`FAIL ${key}.js  ${err.message}`);
  }
}
process.exit(bad ? 1 : 0);