import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
test('page registration, queued taps, retry idempotency, leaderboard and logout',async()=>{
 const dom=new JSDOM(html,{url:'https://liukelly1993-ship-it.github.io/cyber-mokugyo/',runScripts:'outside-only'});const w=dom.window;const $=id=>w.document.getElementById(id);const intervals=[];const received=new Map();let total=0,offline=false,valid=true;
 w.matchMedia=()=>({matches:true});w.Element.prototype.getAnimations=()=>[];w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.setInterval=(fn,ms)=>{intervals.push({fn,ms});return intervals.length;};
 const user=()=>({id:'user1',username:'demo_user',nickname:'<好友>',total,today:total,day:'2026-09-12'});
 w.fetch=async(url,options={})=>{if(offline)throw new Error('offline');const path=new URL(url).pathname;const data=options.body?JSON.parse(options.body):{};let response,status=200;
 if(path.endsWith('/register')||path.endsWith('/login'))response={token:'a'.repeat(64),user:user()};
 else if(!valid){status=401;response={error:'请重新登录'};}
 else if(path.endsWith('/taps')){if(!received.has(data.id)){received.set(data.id,data.count);total+=data.count;}response={ok:true,user:user()};}
 else if(path.endsWith('/leaderboard'))response={rows:[{id:'user1',nickname:'<好友>',score:total,position:1}],me:{id:'user1',nickname:'<好友>',score:total,rank:1},participants:1};
 else response={ok:true,user:user()};
 return new Response(JSON.stringify(response),{status});};
 w.eval(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
 $('account').click();$('auth-switch').click();$('auth-username').value='demo_user';$('auth-nickname').value='<好友>';$('auth-password').value='password123';$('auth-confirm').value='password123';$('auth-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
 assert.equal($('modal').open,false);assert.equal($('account').textContent,'◉ <好友>');
 offline=true;for(let i=0;i<7;i++)$('fish').click();await intervals.find(i=>i.ms===3000).fn();await tick();assert.equal(total,0);assert.ok($('cloud-status').textContent.includes('待同步'));assert.equal($('today').textContent,'7');
 offline=false;await intervals.find(i=>i.ms===3000).fn();await tick();assert.equal(total,7);await intervals.find(i=>i.ms===3000).fn();await tick();assert.equal(total,7);
 $('leaderboard').click();await tick();assert.ok($('board-data').textContent.includes('<好友>'));assert.equal($('board-data').querySelector('好友'),null);
 $('close').click();$('account').click();$('logout').click();await tick();assert.equal(w.sessionStorage.getItem('muyu-session-v1'),null);assert.equal($('today').textContent,'7');
 $('account').click();$('auth-username').value='demo_user';$('auth-password').value='password123';$('auth-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();valid=false;$('fish').click();await intervals.find(i=>i.ms===3000).fn();await tick();assert.equal($('account').textContent,'◉ 登录 / 注册');$('account').click();assert.ok($('auth-form'));
 dom.window.close();
});
