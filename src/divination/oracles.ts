import {HEXAGRAMS,TRIGRAMS,TRIGRAM_ORDER} from '../domain/constants.js';
import type {MeihuaResult,JiaobeiResult,QiuqianResult} from '../../packages/contracts/index.js';
import poems from './guandi.json' with {type:'json'};
import {deriveMeihuaFacts} from './meihuaFacts.js';
const name=(bits:number[])=>HEXAGRAMS.find(h=>h.binary.join('')===bits.join(''))!.name;
export function meihua(numbers:number[],calendar?:MeihuaResult['calendar']):MeihuaResult {
  if(numbers.length!==3 || numbers.some(n=>!Number.isSafeInteger(n)||n<1||n>999999999))throw new Error('请输入三个 1–999999999 的整数');
  const upper=TRIGRAM_ORDER[(numbers[0]!-1)%8]!,lower=TRIGRAM_ORDER[(numbers[1]!-1)%8]!,moving=(numbers[2]!-1)%6+1;
  const bits=[...TRIGRAMS[lower].binary,...TRIGRAMS[upper].binary];
  const changedBits=bits.map((b,i)=>i===moving-1?1-b:b),mutualBits=[...bits.slice(1,4),...bits.slice(2,5)];
  const body=moving<=3?upper:lower,use=moving<=3?lower:upper;
  const b=TRIGRAMS[body].element,u=TRIGRAMS[use].element;
  const generates:Record<string,string>={wood:'fire',fire:'earth',earth:'metal',metal:'water',water:'wood'};
  const controls:Record<string,string>={wood:'earth',earth:'water',water:'fire',fire:'metal',metal:'wood'};
  const relation=b===u?'体用比和':generates[b]===u?'体生用':generates[u]===b?'用生体':controls[b]===u?'体克用':'用克体';
  const core={bits,changedBits,moving,body,use,...(calendar?{calendar}:{})};
  return {method:'meihua',version:1,numbers:[...numbers],primary:name(bits),changed:name(changedBits),mutual:name(mutualBits),bits,changedBits,mutualBits,moving,body,use,relation,...(calendar?{calendar}:{}),analysis:deriveMeihuaFacts(core),rule:'三数法 v1：第一数除八取上卦，第二数除八取下卦，第三数除六取动爻；余零分别作八、六。先天卦序乾兑离震巽坎艮坤，爻自下而上；动爻所在经卦为用，另一经卦为体。此为本产品固定的三数取法。卦气以起卦时月建五行定旺相休囚死。'};
}
export function qiuqian(index:number):QiuqianResult {
  if(!Number.isInteger(index)||index<0||index>=poems.length)throw new Error('Invalid lot index');
  return {method:'qiuqian',version:1,...poems[index]!,rule:'关帝百签，均匀随机抽取一签。本版为独立抽签，不包含庙宇特定的掷筊验签仪式。'};
}
export function jiaobei(a:number,b:number):JiaobeiResult {
  if(![a,b].every(x=>x===0||x===1))throw new Error('Invalid block faces');
  const faces:["flat"|"round","flat"|"round"]=[a?'round':'flat',b?'round':'flat'];
  const name=a!==b?'圣筊':a===0?'笑筊':'阴筊';
  const meaning=name==='圣筊'?'一平一凸，传统上表示允可。':name==='笑筊'?'两平面朝上，传统上表示未定，可重新梳理问题。':'两凸面朝上，传统上表示不允，宜暂缓再思。';
  return {method:'jiaobei',version:1,faces,name,meaning,rule:'单次双筊，每块独立等概率取平面或凸面朝上：圣筊 1/2、笑筊 1/4、阴筊 1/4。数字模拟，不等同于真实木筊的物理概率。'};
}
