import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { applyManualEdit, createEmptyBrief } from '../lib/state';
import { CURRENT_ANALYSIS_VERSION, parseSession } from '../lib/session';
process.loadEnvFile('.env.local');
if(process.env.RUN_SUPABASE_VERIFICATION!=='1')throw new Error('Enable isolated FormBridge verification first.');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if(!url.includes('kpawqpouxxrmssepsbag'))throw new Error('Use the dedicated FormBridge project.');
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>fetch(input,{...init,signal:AbortSignal.timeout(20_000)})}};
const owner=createClient(url,key,options),other=createClient(url,key,options),publicClient=createClient(url,key,options);
const checks:{name:string;passed:boolean}[]=[],fixtures={users:[] as string[],workspace:'',case:''};
function check(name:string,passed:boolean){checks.push({name,passed});console.log(`${passed?'PASS':'FAIL'} ${name}`);if(!passed)throw new Error(name);}
async function rpc(client:typeof owner,name:string,args:Record<string,unknown>){const result=await client.rpc(name,args);if(result.error)throw new Error(`${name}: ${result.error.message}`);return result.data;}
try{
 for(const client of [owner,other]){const result=await client.auth.signInAnonymously();check('A device identity signs in through the enabled provider',!result.error&&!!result.data.user?.is_anonymous);if(result.data.user)fixtures.users.push(result.data.user.id);}
 const workspace=await rpc(owner,'fb_create_workspace',{p_name:'Isolated device workflow verification'});fixtures.workspace=workspace;
 let brief=createEmptyBrief();for(const [field,value] of [['restaurantName','Juniper'],['city','Sydney'],['date','18 October 2027'],['time','7:30 pm'],['partySize','4']] as const)brief=applyManualEdit(brief,field,value);
 const session={messages:[{id:'m1',speaker:'customer',text:'Juniper in Sydney, 4 guests on 18 October 2027 at 7:30 pm.'}],brief,referenceDate:'2026-10-13',analysisVersion:CURRENT_ANALYSIS_VERSION,followUp:{dueDate:'2026-10-14',note:'Confirm vegetarian request',done:false},guestCare:{name:'Alex',contact:'',dietary:'One vegetarian guest',seating:'Quiet table requested',occasion:'Birthday'},notes:'Synthetic device workflow record'};
 const id=randomUUID();fixtures.case=id;const args={p_workspace:workspace,p_id:id,p_title:'Synthetic guest-care enquiry',p_payload:{session,notes:session.notes},p_archived:false,p_expected_version:0};
 const saved=await rpc(owner,'fb_save_case',args);check('A device owner saves guest care and a follow-up',saved.version===1);
 const publicRead=await publicClient.from('fb_cases').select('id').eq('id',id);check('An unsigned browser cannot read the enquiry',!!publicRead.error||!publicRead.data?.length);
 const outsiderRead=await other.from('fb_cases').select('id').eq('id',id);check('Another device cannot read the private enquiry',!outsiderRead.error&&!outsiderRead.data?.length);
 check('Another device cannot overwrite the private enquiry',!!(await other.rpc('fb_save_case',{...args,p_expected_version:1})).error);
 const token=await rpc(owner,'fb_create_invite',{p_workspace:workspace});await rpc(other,'fb_join_workspace',{p_token:token});
 const memberRead=await other.from('fb_cases').select('payload').eq('id',id).single();const restored=parseSession(JSON.stringify(memberRead.data?.payload.session));
 check('An invited device reads the complete guest-care and follow-up payload',!memberRead.error&&restored?.guestCare?.dietary==='One vegetarian guest'&&restored?.followUp?.note==='Confirm vegetarian request');
 check('A member cannot issue a workspace invitation',!!(await other.rpc('fb_create_invite',{p_workspace:workspace})).error);
 const completed={...session,followUp:{...session.followUp,done:true}};
 const updated=await rpc(other,'fb_save_case',{...args,p_payload:{session:completed,notes:completed.notes},p_expected_version:1});check('An invited device completes a follow-up with a version check',updated.version===2);
 check('A stale owner cannot silently overwrite the completed task',!!(await owner.rpc('fb_save_case',{...args,p_expected_version:1})).error);
 const final=await owner.from('fb_cases').select('payload').eq('id',id).single();check('Completion persists for the next shift without losing guest requests',final.data?.payload.session.followUp.done===true&&final.data?.payload.session.guestCare.occasion==='Birthday');
}finally{
 await writeFile('evaluation/results/device-team-workflow-20261013.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,fixtures},null,2));
 await owner.auth.signOut();await other.auth.signOut();
}
