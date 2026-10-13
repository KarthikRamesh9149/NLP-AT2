import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { extractGroundedState, EXTRACTION_VERSION, formbridgeModel } from '../lib/ai';
import { reconcileGroundedState, withExplicitClears } from '../lib/grounding';
import { analyzeConversation } from '../lib/engine';
import { createEmptyBrief, FIELD_KEYS, approveBrief, type FieldKey } from '../lib/state';
import { isCancelledBooking } from '../lib/cancellation-status';
import { fieldMatches } from '../lib/evaluation-match';
import { bookingMessages } from '../lib/booking-intent';
import { loadEligible } from './sgd';
import { featureCases } from '../evaluation/report-feature-cases';

const kind=process.argv[2];
const tag=process.argv.find(a=>a.startsWith('--tag='))?.slice(6);
if (!['component','features'].includes(kind) || !tag || !/^[a-zA-Z0-9_-]+$/.test(tag)) throw new Error('Use component|features --tag=unique-tag, plus the SGD path for component.');
const out='evaluation/results/report-'+kind+'-'+tag;
async function files(dir:string):Promise<string[]> {
  const result:string[]=[];
  for(const item of await readdir(dir,{withFileTypes:true})) {
    const path=dir+'/'+item.name;
    if(item.isDirectory()) result.push(...await files(path)); else if(path.endsWith('.ts')) result.push(path);
  }
  return result;
}
async function fingerprint() {
  const paths=[...await files('lib'),'scripts/report-evidence.ts','scripts/sgd.ts','evaluation/report-feature-cases.ts'].sort();
  const hash=createHash('sha256');
  for(const path of paths) hash.update(path).update(await readFile(path));
  return hash.digest('hex');
}
const hash=await fingerprint();
const metadata={generatedAt:new Date().toISOString(), sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), extractionVersion:EXTRACTION_VERSION, sourceFingerprint:hash, configuration:{primary:formbridgeModel(),repair:process.env.FORMBRIDGE_REPAIR_MODEL||'gpt-6.1-sol'}, kind};
async function save(path:string,data:unknown, exclusive=false) { await writeFile(path,JSON.stringify(data,null,2)+'\n',exclusive?{flag:'wx'}:{}); }

if(kind==='component') {
  const dataDir=process.argv[3];
  if(!dataDir || dataDir.startsWith('--')) throw new Error('Pass the SGD checkout path.');
  const selection=JSON.parse(await readFile('evaluation/results/selection-report-v18-20261013-development.json','utf8'));
  const data=await loadEligible(dataDir,'dev');
  const chosen=selection.selectedIds.map((id:string)=>{const found=data.eligible.find(d=>d.id===id);if(!found) throw new Error('Missing '+id);return found;}) as typeof data.eligible;
  await save(out+'-selection.json',{...metadata,protocol:'One primary call per final visible prefix. The same parsed proposal is scored directly and after deterministic explicit-clearing and reconciliation. No repair, earlier predicted state or prompt difference. This isolates postprocessing of these proposals, not the complete incremental product.',selectedIds:selection.selectedIds},true);
  const results=[];
  for(const dialogue of chosen) {
    const start=performance.now();
    try {
      const visible=bookingMessages(dialogue.messages);
      const candidate=await extractGroundedState(visible,null);
      const guarded=reconcileGroundedState(createEmptyBrief(),withExplicitClears(candidate.state,visible,null),visible,null);
      const fields=Object.fromEntries(FIELD_KEYS.map(key=>[key,{gold:dialogue.gold[key]??[],raw:candidate.state[key],guarded:guarded.fields[key],rawMatch:fieldMatches(candidate.state[key].value,dialogue.gold[key]??[],key),guardedMatch:fieldMatches(guarded.fields[key].value,dialogue.gold[key]??[],key)}]));
      results.push({id:dialogue.id,messages:dialogue.messages,fields,usage:candidate.usage,latencyMs:Math.round(performance.now()-start)});
      process.stdout.write('COMPONENT '+dialogue.id+'\n');
    } catch(error) {
      results.push({id:dialogue.id,error:error instanceof Error?error.message:String(error),latencyMs:Math.round(performance.now()-start)});
      process.stdout.write('FAILED '+dialogue.id+'\n');
    }
    await save(out+'-progress.json',{...metadata,results});
  }
  let rawCorrect=0,guardedCorrect=0,rawComplete=0,guardedComplete=0,helped=0,harmed=0,changed=0;
  for(const r of results) if('fields'in r && r.fields) {
    const fields=Object.values(r.fields);
    rawCorrect+=fields.filter(f=>f.rawMatch).length;guardedCorrect+=fields.filter(f=>f.guardedMatch).length;
    rawComplete+=Number(fields.every(f=>f.rawMatch));guardedComplete+=Number(fields.every(f=>f.guardedMatch));
    helped+=fields.filter(f=>!f.rawMatch&&f.guardedMatch).length;harmed+=fields.filter(f=>f.rawMatch&&!f.guardedMatch).length;
    changed+=fields.filter(f=>f.raw.value!==f.guarded.value||f.raw.status!==f.guarded.status||f.raw.constraint!==f.guarded.constraint).length;
  }
  if(await fingerprint()!==hash) throw new Error('Sources changed during the run; inspect retained progress.');
  const summary={attemptedDialogues:chosen.length,failures:results.filter(r=>'error'in r).length,fieldPositions:chosen.length*5,rawCorrect,guardedCorrect,rawComplete,guardedComplete,helped,harmed,changed,providerAttempts:chosen.length};
  await save(out+'.json',{...metadata,summary,results},true);process.stdout.write(JSON.stringify(summary)+'\n');
} else {
  await save(out+'-protocol.json',{...metadata,protocol:'Twenty pre-specified constructed English transcripts. One complete transcript is passed to the current FormBridge pipeline from an empty brief, as in pasted-transcript analysis. Gold values, statuses, source bundles and clarification targets are not model inputs. All cases and failures are retained. Approval uses the application function; cancellation suppresses clarification as in the deployed route. Source metrics concern message links, not independently rated quotation wording. No user participants.',cases:featureCases},true);
  const results=[];
  for(const item of featureCases) {
    const start=performance.now();
    try {
      const prediction=await analyzeConversation(item.messages,createEmptyBrief(),'formbridge',item.referenceDate);
      const question=isCancelledBooking(prediction.brief,item.messages)?null:prediction.clarification;
      let canApprove=true;try {approveBrief(prediction.brief);}catch {canApprove=false;}
      const fields=Object.fromEntries(FIELD_KEYS.map((key:FieldKey)=>{
        const got=prediction.brief.fields[key], expected=item.expected[key];
        const valueMatch=fieldMatches(got.value,expected.value===null?[]:[expected.value],key);
        const statusMatch=got.status===expected.status;
        const constraintMatch=!expected.constraint||!!got.constraint&&new RegExp(expected.constraint,'i').test(got.constraint);
        const contentPresent=!!(got.value||got.constraint);
        const sourceSupported=contentPresent&&valueMatch&&statusMatch&&constraintMatch&&expected.support.some(bundle=>bundle.every(id=>got.evidenceIds.includes(id)));
        const links=got.evidenceIds.map(id=>({id,relevant:expected.allowed.includes(id),known:item.messages.some(m=>m.id===id)}));
        return [key,{expected,actual:got,valueMatch,statusMatch,constraintMatch,contentPresent,sourceSupported,links}];
      }));
      const questionMatch=item.question===null?question===null:!!question&&new RegExp(item.question,'i').test(question);
      const approvalMatch=canApprove===item.approval;
      const allFields=Object.values(fields);
      const pass=allFields.every(f=>f.valueMatch&&f.statusMatch&&f.constraintMatch)&&questionMatch&&approvalMatch;
      results.push({id:item.id,purpose:item.purpose,fields,question,questionMatch,canApprove,approvalMatch,passed:pass,usage:prediction.usage,warning:prediction.warning??null,latencyMs:Math.round(performance.now()-start)});
      process.stdout.write((pass?'PASS ':'FAIL ')+item.id+' '+item.purpose+'\n');
    }catch(error){results.push({id:item.id,error:error instanceof Error?error.message:String(error)});process.stdout.write('FAILED '+item.id+'\n');}
    await save(out+'-progress.json',{...metadata,results});
  }
  const successful=results.filter(r=>'fields'in r && r.fields);
  const fields=successful.flatMap(r=>Object.values(r.fields!));
  const links=fields.flatMap(f=>f.links);
  const uncertainty=fields.filter(f=>f.expected.status==='needs_clarification');
  const summary={
    cases:featureCases.length,failures:results.filter(r=>'error'in r).length,passedCases:successful.filter(r=>r.passed).length,
    fieldPositions:featureCases.length*5,correctValues:fields.filter(f=>f.valueMatch).length,correctStatuses:fields.filter(f=>f.statusMatch).length,
    populatedFields:fields.filter(f=>f.contentPresent).length,supportedFields:fields.filter(f=>f.sourceSupported).length,
    linkedMessages:links.length,knownLinks:links.filter(l=>l.known).length,relevantLinks:links.filter(l=>l.relevant).length,
    uncertaintyPositions:featureCases.reduce((n,c)=>n+Object.values(c.expected).filter(f=>f.status==='needs_clarification').length,0),
    uncertaintyCorrect:uncertainty.filter(f=>f.statusMatch&&f.valueMatch&&f.constraintMatch).length,
    clarificationDecisions:featureCases.length,correctClarificationDecisions:successful.filter(r=>r.questionMatch).length,
    necessaryQuestions:featureCases.filter(c=>c.question!==null).length,
    correctNecessaryQuestions:successful.filter(r=>featureCases.find(c=>c.id===r.id)!.question!==null&&r.questionMatch).length,
    approvalDecisions:featureCases.length,correctApprovalDecisions:successful.filter(r=>r.approvalMatch).length,
    providerAttempts:successful.reduce((n,r)=>n+(r.usage?.attemptedCalls??r.usage?.calls?.length??1),0),
    observedInputTokens:successful.reduce((n,r)=>n+(r.usage?.inputTokens??0),0),observedOutputTokens:successful.reduce((n,r)=>n+(r.usage?.outputTokens??0),0)
  };
  if(await fingerprint()!==hash) throw new Error('Sources changed during the run; inspect retained progress.');
  await save(out+'.json',{...metadata,summary,results},true);process.stdout.write(JSON.stringify(summary)+'\n');
}

