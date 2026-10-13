(function(){
 'use strict';
 var script=document.currentScript,slug=script&&script.getAttribute('data-restaurant');
 if(!script||!slug||!/^[a-f0-9]{16}$/.test(slug)||document.getElementById('formbridge-guest-widget'))return;
 var origin=new URL(script.src).origin,button=document.createElement('button'),panel=document.createElement('div'),iframe=document.createElement('iframe'),close=document.createElement('button');
 panel.id='formbridge-guest-widget';panel.hidden=true;
 Object.assign(button.style,{position:'fixed',bottom:'24px',right:'24px',zIndex:'2147483600',border:'0',borderRadius:'999px',padding:'16px 22px',background:'#154d3e',color:'#fffefb',font:'600 14px system-ui',cursor:'pointer',boxShadow:'0 8px 30px #163e3b30'});
 button.type='button';button.textContent='Plan your visit';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',panel.id);
 Object.assign(panel.style,{position:'fixed',bottom:'84px',right:'16px',width:'min(520px, calc(100vw - 32px))',height:'min(720px, calc(100dvh - 110px))',zIndex:'2147483601',borderRadius:'16px',overflow:'hidden',boxShadow:'0 14px 60px #163e3b40',background:'#fffefb'});
 iframe.src=origin+'/guest/'+slug;iframe.title='Restaurant enquiry assistant';iframe.setAttribute('referrerpolicy','no-referrer');Object.assign(iframe.style,{width:'100%',height:'100%',border:'0'});
 close.type='button';close.textContent='×';close.setAttribute('aria-label','Close restaurant assistant');Object.assign(close.style,{position:'absolute',top:'8px',right:'8px',zIndex:'2',borderRadius:'50%',width:'36px',height:'36px',border:'1px solid #d7e1d9',background:'#fffefb',color:'#154d3e',font:'24px system-ui',cursor:'pointer'});
 function hide(){panel.hidden=true;button.setAttribute('aria-expanded','false');button.focus();}
 button.onclick=function(){panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)close.focus();};close.onclick=hide;
 panel.addEventListener('keydown',function(event){if(event.key==='Escape')hide();});
 panel.append(iframe,close);document.body.append(panel,button);
})();
