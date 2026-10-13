import {expect,it} from 'vitest';
import {reviewSubmission,approvedAnswers,type ReviewSnapshot} from '@/lib/guest-portal';
import {emptyDesk} from '@/lib/restaurant-desk';
const snapshot:ReviewSnapshot={restaurantName:'Juniper',city:'Sydney',date:'18 October 2027',time:'8:30 pm',partySize:'5',guestCare:{name:'Alex',dietary:'',seating:'Quiet table',occasion:'Birthday'}};
const values={date:'2027-10-18',time:'20:30',partySize:'5',dietary:'',seating:'Quiet table',occasion:'Birthday',message:'',consent:true};
it('does not create a correction for equivalent date and time formats',()=>expect(reviewSubmission(snapshot,values).changed).toBe(false));
it('returns changed preferences to staff review and preserves explicit clearing',()=>{const result=reviewSubmission(snapshot,{...values,seating:''});expect(result.changed).toBe(true);expect(result.message).toContain('Please remove this request');});
it('rejects impossible dates, invalid counts and missing guest consent',()=>{expect(()=>reviewSubmission(snapshot,{...values,date:'2027-02-30'})).toThrow();expect(()=>reviewSubmission(snapshot,{...values,partySize:'0'})).toThrow();expect(()=>reviewSubmission(snapshot,{...values,consent:false})).toThrow();});
it('never supplies unapproved restaurant information to the guest assistant',()=>{const restaurant={...emptyDesk().restaurant,facts:[{id:'one',title:'Hours',category:'hours' as const,text:'Dinner from 5 pm.',approved:true},{id:'two',title:'Draft',category:'hours' as const,text:'Private staff note.',approved:false}]};expect(approvedAnswers(restaurant,'What are your opening hours?').map(f=>f.text)).toEqual(['Dinner from 5 pm.']);expect(approvedAnswers(restaurant,'Who is the CEO?')).toEqual([]);});
