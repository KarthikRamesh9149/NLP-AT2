import { createClient } from '@supabase/supabase-js';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { applyManualEdit, createEmptyBrief } from '../lib/state';
process.loadEnvFile('.env.local');
if (process.env.RUN_SUPABASE_VERIFICATION !== '1') throw new Error('Set RUN_SUPABASE_VERIFICATION=1 to create isolated verification records.');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!; const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if (!url.includes('kpawqpouxxrmssepsbag')) throw new Error('Use only the FormBridge project for this verification.');
const options={auth:{persistSession:false,autoRefreshToken:false}, global:{fetch:(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}};
const admin=createClient(url,process.env.SUPABASE_SECRET_KEY!,options); const anonymous=createClient(url,key,options);
const clients=[createClient(url,key,options),createClient(url,key,options)];
const checks:{name:string;passed:boolean}[]=[]; const cleanup={users:[] as string[],workspaces:[] as string[],cases:[] as string[]};
function check(name:string,passed:boolean){ checks.push({name,passed}); if(!passed) throw new Error(name); console.log(`PASS ${name}`); }
async function rpc(client:typeof admin,name:string,args:Record<string,unknown>){const result=await client.rpc(name,args); if(result.error)throw new Error(`${name}: ${result.error.message}`); return result.data;}
const folder='../outputs/product-upgrade-2026-10-12'; await mkdir(folder,{recursive:true});
try {
  for(const client of clients){ const email=`formbridge-check-${randomUUID()}@example.invalid`; const password=`${randomUUID()}!`;
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true}); if(created.error)throw created.error;
    cleanup.users.push(created.data.user.id); const signed=await client.auth.signInWithPassword({email,password}); check('Verified fixture account signs in without sending email',!signed.error);
  }
  const owner=clients[0],other=clients[1]; const wid=await rpc(owner,'fb_create_workspace',{p_name:'Isolated workspace verification'}); cleanup.workspaces.push(wid);
  check('An authenticated staff member can create a private team',typeof wid==='string');
  const caseId=randomUUID(); cleanup.cases.push(caseId); let brief=createEmptyBrief(); brief=applyManualEdit(brief,'partySize','4');
  const payload={session:{messages:[{id:'m1',speaker:'customer',text:'A table for four people.'}],brief,referenceDate:'2026-10-13'},notes:'Synthetic verification record'};
  const args={p_workspace:wid,p_id:caseId,p_title:'Synthetic enquiry',p_payload:payload,p_archived:false,p_expected_version:0};
  const initial=await rpc(owner,'fb_save_case',args); check('Owner can save a case',initial.version===1);
  const publicRead=await anonymous.from('fb_cases').select('id'); check('Public browser keys cannot read private cases',!!publicRead.error||publicRead.data?.length===0);
  const foreignRead=await other.from('fb_cases').select('id').eq('id',caseId); check('Another signed-in user cannot read the case',!foreignRead.error&&foreignRead.data?.length===0);
  const forbiddenSave=await other.rpc('fb_save_case',{...args,p_title:'Unauthorised overwrite',p_expected_version:1}); check('Another signed-in user cannot write the case',!!forbiddenSave.error);
  const forbiddenInvite=await other.rpc('fb_create_invite',{p_workspace:wid}); check('Only an owner can issue a team invitation',!!forbiddenInvite.error);
  const forbiddenBudget=await other.rpc('fb_reserve_usage',{p_identity:'0'.repeat(64),p_max_cost:0}); check('Staff cannot call the privileged budget function',!!forbiddenBudget.error);
  const token=await rpc(owner,'fb_create_invite',{p_workspace:wid}); await rpc(other,'fb_join_workspace',{p_token:token});
  const joinedAgain=await other.rpc('fb_join_workspace',{p_token:token}); check('Joining the same workspace again is idempotent',!joinedAgain.error&&joinedAgain.data===wid);
  const joinedRead=await other.from('fb_cases').select('id').eq('id',caseId); check('An invited member can read the shared case',joinedRead.data?.length===1);
  const editArgs={...args,p_expected_version:1};
  const candidates=[{...editArgs,p_payload:{...payload,notes:'Owner update'}},{...editArgs,p_payload:{...payload,notes:'Member update'}}];
  const edits=await Promise.all([owner.rpc('fb_save_case',candidates[0]),other.rpc('fb_save_case',candidates[1])]);
  check('Simultaneous edits permit one update and reject the stale version',edits.filter(result=>!result.error).length===1&&edits.filter(result=>!!result.error).length===1);
  const winner=edits[0].error?1:0; const repeat=await clients[winner].rpc('fb_save_case',candidates[winner]); check('Retrying an identical save is idempotent',!repeat.error&&repeat.data.version===2);
  const badPayload=await owner.rpc('fb_save_case',{...args,p_id:randomUUID(),p_payload:{},p_expected_version:0}); check('Missing session payload is rejected',!!badPayload.error);
  const workspaceAttempts=await Promise.all(Array.from({length:5},(_,i)=>owner.rpc('fb_create_workspace',{p_name:`Isolated concurrent workspace ${i}`})));
  for(const attempt of workspaceAttempts)if(!attempt.error)cleanup.workspaces.push(attempt.data);
  check('Concurrent workspace creation enforces the three-workspace owner limit',workspaceAttempts.filter(result=>!result.error).length===2);
  const identity=createHash('sha256').update(`verification-${randomUUID()}`).digest('hex');
  const reservations=await Promise.all(Array.from({length:3},()=>admin.rpc('fb_reserve_usage',{p_identity:identity,p_max_cost:400_000})));
  check('The shared daily budget is reserved atomically across parallel calls',reservations.filter(result=>result.data?.allowed).length<=2&&reservations.some(result=>result.data?.reason==='budget'));
  for(const reservation of reservations)if(reservation.data?.allowed)await rpc(admin,'fb_settle_usage',{p_id:reservation.data.reservationId,p_actual_cost:0});
  const rateIdentity=createHash('sha256').update(`rate-${randomUUID()}`).digest('hex');
  const rateChecks=await Promise.all(Array.from({length:31},()=>rpc(admin,'fb_reserve_usage',{p_identity:rateIdentity,p_max_cost:0})));
  await Promise.all(rateChecks.filter(result=>result.allowed).map(result=>rpc(admin,'fb_settle_usage',{p_id:result.reservationId,p_actual_cost:0})));
  check('A durable per-minute quota permits thirty concurrent requests and rejects the extra request',rateChecks.filter(result=>result.allowed).length===30&&rateChecks.filter(result=>result.reason==='rate').length===1);
} finally {
  await writeFile(`${folder}/team-backend-verification-${Date.now()}.json`,JSON.stringify({checkedAt:new Date().toISOString(),checks,cleanup},null,2));
  for(const client of clients)await client.auth.signOut();
}
