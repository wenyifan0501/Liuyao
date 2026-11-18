import {BRANCH_ELEMENTS,TRIGRAMS} from '../domain/constants.js';
import type {EarthlyBranch,FiveElement,TrigramName} from '../domain/types.js';
import type {MeihuaAnalysis,MeihuaResult,MeihuaRole,MeihuaSeasonState,MeihuaTrigramFact} from '../../packages/contracts/index.js';

const LABEL:Record<FiveElement,string>={wood:'木',fire:'火',earth:'土',metal:'金',water:'水'};
const GENERATES:Record<FiveElement,FiveElement>={wood:'fire',fire:'earth',earth:'metal',metal:'water',water:'wood'};
const CONTROLS:Record<FiveElement,FiveElement>={wood:'earth',earth:'water',water:'fire',fire:'metal',metal:'wood'};
const SEASON:Record<FiveElement,string>={wood:'春',fire:'夏',metal:'秋',water:'冬',earth:'四季土'};

function trigramOf(bits:readonly number[]):TrigramName{
  const key=bits.join('');
  return (Object.keys(TRIGRAMS) as TrigramName[]).find(n=>TRIGRAMS[n].binary.join('')===key)!;
}
/** Relation of `other` toward the body trigram, phrased from the other side. */
function relationToBody(other:FiveElement,body:FiveElement):string{
  if(other===body)return '比和';
  if(GENERATES[other]===body)return '生体';
  if(CONTROLS[other]===body)return '克体';
  if(GENERATES[body]===other)return '体生之';
  return '体克之';
}
/** 当令者旺，令生者相，生令者休，克令者囚，令克者死。 */
export function seasonState(element:FiveElement,month:FiveElement):MeihuaSeasonState{
  if(element===month)return '旺';
  if(GENERATES[month]===element)return '相';
  if(GENERATES[element]===month)return '休';
  if(CONTROLS[element]===month)return '囚';
  return '死';
}

export function deriveMeihuaFacts(r:Pick<MeihuaResult,'bits'|'changedBits'|'moving'|'body'|'use'|'calendar'>):MeihuaAnalysis{
  const monthBranch=(r.calendar?.monthBranch ?? null) as EarthlyBranch|null;
  const month=monthBranch?BRANCH_ELEMENTS[monthBranch]:null;
  const changedTrigram=r.moving<=3?trigramOf(r.changedBits.slice(0,3)):trigramOf(r.changedBits.slice(3,6));
  const roles:[MeihuaRole,TrigramName][]=[
    ['体',r.body as TrigramName],['用',r.use as TrigramName],
    ['互下',trigramOf(r.bits.slice(1,4))],['互上',trigramOf(r.bits.slice(2,5))],['变',changedTrigram],
  ];
  const body=TRIGRAMS[r.body as TrigramName].element;
  const trigrams:MeihuaTrigramFact[]=roles.map(([role,name])=>{
    const t=TRIGRAMS[name];
    return {role,trigram:name,image:t.image,element:LABEL[t.element],relation:role==='体'?null:relationToBody(t.element,body),state:month?seasonState(t.element,month):null};
  });
  const b=trigrams[0]!.trigram;
  const phrase:Record<string,string>={比和:`与体卦${b}比和`,生体:`生体卦${b}`,克体:`克体卦${b}`,体生之:`为体卦${b}所生（体有耗泄）`,体克之:`为体卦${b}所克`};
  const facts=trigrams.map(t=>`${t.role}卦${t.trigram}（象${t.image}，五行${t.element}）${t.relation?'，'+phrase[t.relation]:''}${t.state?`，于${monthBranch}月${t.state}`:''}。`);
  facts.push(month?`起卦月建${monthBranch}，${LABEL[month]}当令（${SEASON[month]}）。`:'本卦未记录起卦时间，不判断卦气旺衰。');
  return {ruleVersion:'meihua-facts-v1',monthBranch,monthElement:month?LABEL[month]:null,trigrams,facts};
}
