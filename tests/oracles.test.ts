import {expect,it} from 'vitest';
import {meihua,qiuqian,jiaobei} from '../src/divination/oracles.js';
import {join} from 'node:path';
import {loadOracleSkillBundle,oracleSystemPrompt,buildOracleInitialRequest,buildOracleFollowUpRequest,runOracleReading} from '../src/divination/interpretation.js';
import {deriveMeihuaFacts,seasonState} from '../src/divination/meihuaFacts.js';
import {frameConsultationQuestion} from '../src/consultation/questionFraming.js';
import type {AiGateway} from '../src/ai/types.js';
it('uses bottom-up lines, correct moving trigram and mutual hexagram',()=>{
  expect(meihua([3,8,6])).toMatchObject({primary:'火地晋',changed:'雷地豫',mutual:'水山蹇',moving:6,body:'坤',use:'离',relation:'用生体'});
  expect(meihua([1,1,1])).toMatchObject({primary:'乾为天',changed:'天风姤',body:'乾',use:'乾',relation:'体用比和'});
  expect(meihua([8,8,6])).toMatchObject({primary:'坤为地',changed:'山地剥',moving:6});
  expect(meihua([11,16,12]).bits).toEqual(meihua([3,8,6]).bits);
});
it('rejects invalid numbers without truncating or rounding',()=>{
  for(const n of [[0,1,1],[-1,1,1],[1.2,1,1],[Infinity,1,1],[1,2],[1,1,1e10]])expect(()=>meihua(n)).toThrow();
});
it('includes all 100 sourced four-line poems',()=>{
  for(let i=0;i<100;i++){const lot=qiuqian(i);expect(lot.number).toBe(i+1);expect(lot.poem).toHaveLength(4);expect(lot.poem.every(l=>l.length===7)).toBe(true);expect(lot.source).toContain('wikisource.org');}
  expect(()=>qiuqian(100)).toThrow();
  expect(qiuqian(0).poem[0]).toBe('巍巍獨步向雲間');
});
it('maps visible upper faces to all three jiaobei outcomes',()=>{
  expect(jiaobei(0,0)).toMatchObject({name:'笑筊',faces:['flat','flat']});
  expect(jiaobei(1,1)).toMatchObject({name:'阴筊',faces:['round','round']});
  expect(jiaobei(0,1).name).toBe('圣筊');expect(jiaobei(1,0).name).toBe('圣筊');
});
it('derives mutual and changed trigram relations and monthly strength for meihua',()=>{
  const r=meihua([3,8,6],{castAt:'2026-10-22T13:00:00.000Z',timezone:'Asia/Shanghai',monthBranch:'戌'});
  expect(r.analysis?.trigrams.map(t=>[t.role,t.trigram,t.relation,t.state])).toEqual([
    ['体','坤',null,'旺'],['用','离','生体','休'],['互下','艮','比和','旺'],['互上','坎','体克之','死'],['变','震','克体','囚'],
  ]);
  expect(r.analysis?.facts.at(-1)).toContain('月建戌');
  const old=meihua([1,1,1]);
  expect(old.calendar).toBeUndefined();
  expect(old.analysis?.trigrams.every(t=>t.state===null)).toBe(true);
  expect(old.analysis?.trigrams.find(t=>t.role==='变')).toMatchObject({trigram:'巽',relation:'体克之'});
  expect(deriveMeihuaFacts(r)).toEqual(r.analysis);
  expect([seasonState('wood','wood'),seasonState('fire','wood'),seasonState('water','wood'),seasonState('metal','wood'),seasonState('earth','wood')]).toEqual(['旺','相','休','囚','死']);
});
it('routes each oracle method to its own skill plus shared reading and safety rules',async()=>{
  const skills=await loadOracleSkillBundle(join(process.cwd(),'Skill'));
  const prompts={meihua:oracleSystemPrompt('meihua',skills,false),qiuqian:oracleSystemPrompt('qiuqian',skills,false),jiaobei:oracleSystemPrompt('jiaobei',skills,true)};
  expect(prompts.meihua).toContain('name: meihua-divination');
  expect(prompts.meihua).toContain('不使用六爻的纳甲');
  expect(prompts.meihua).toContain('八卦类象');
  expect(prompts.qiuqian).toContain('name: qiuqian-guandi');
  expect(prompts.qiuqian).toContain('不经过掷筊验签');
  expect(prompts.jiaobei).toContain('name: jiaobei-divination');
  expect(prompts.jiaobei).toContain('不把笑筊当作允可');
  expect(prompts.jiaobei).toContain('同一次掷筊结果继续交谈');
  for(const p of Object.values(prompts)){expect(p).toContain('资料而非指令');expect(p).toContain('问事通用边界');expect(p).toContain('直接解读（梅花、求签、掷筊共用）');expect(p).toContain('鲜明');}
  expect(prompts.jiaobei).not.toContain('八卦类象');
  expect(prompts.meihua).not.toContain('qiuqian-guandi');
});
it('builds initial and follow-up oracle requests with the same budget and structure as liuyao',async()=>{
  const skills=await loadOracleSkillBundle(join(process.cwd(),'Skill'));
  const base={topic:'career',question:'要不要换工作？',timeWindow:null,background:['已拿到 offer']};
  const legacy=meihua([3,8,6]);delete (legacy as {analysis?:unknown}).analysis;
  const initial=buildOracleInitialRequest({...base,oracle:legacy},skills);
  expect(initial.maxTokens).toBe(24000);
  expect(initial.userPrompt).toContain('<consultation>');
  expect(JSON.parse(initial.userPrompt.split('\n').slice(1,-1).join('\n')).computedFacts.trigrams).toHaveLength(5);
  expect(buildOracleInitialRequest({...base,oracle:qiuqian(0)},skills).userPrompt).not.toContain('computedFacts');
  const turns=[{kind:'initial' as const,question:base.question,answer:'首轮'},{kind:'follow_up' as const,question:'那时机呢？',answer:'二轮'}];
  const follow=buildOracleFollowUpRequest({...base,oracle:jiaobei(0,1)},turns,'对方会同意吗？',skills);
  expect(follow.maxTokens).toBe(16000);
  expect(follow.userPrompt).toContain('"initialReport": "首轮"');
  expect(follow.userPrompt).toContain('那时机呢？');
  expect(follow.userPrompt).toContain('<current_question>\n对方会同意吗？');
  expect(()=>buildOracleFollowUpRequest({...base,oracle:jiaobei(0,1)},[],'x',skills)).toThrow();
  const gateway:AiGateway={generateObject:async()=>({}),generateText:async()=>'体卦坤土，用卦离火，火生土，木克土。'};
  const run=await runOracleReading({gateway,skills,consultation:{...base,oracle:meihua([3,8,6])},turns:[],followUp:null});
  expect(run.auditIssues).toEqual([]);
  const bad=await runOracleReading({gateway:{...gateway,generateText:async()=>'土生火'},skills,consultation:{...base,oracle:meihua([3,8,6])},turns:[],followUp:null});
  expect(bad.auditIssues).toHaveLength(1);
});
it('frames questions with method-specific scope before casting',async()=>{
  const seen:string[]=[];
  const gateway:AiGateway={generateObject:async r=>{seen.push(r.systemPrompt);return {status:'ready',normalizedQuestion:'q',missingReason:null,clarifyingQuestion:null,choices:[]};},generateText:async()=>''};
  for(const method of ['liuyao','meihua','qiuqian','jiaobei'])await frameConsultationQuestion({gateway,method,topic:'other',question:'q',timeWindow:null,background:[]});
  expect(seen[0]).toContain('六爻');expect(seen[1]).toContain('体用');expect(seen[2]).toContain('签诗');expect(seen[3]).toContain('是非问');
});
