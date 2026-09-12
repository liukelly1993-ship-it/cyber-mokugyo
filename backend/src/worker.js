import bcrypt from 'bcryptjs';
const ORIGIN='https://liukelly1993-ship-it.github.io';
const DAY=86400000;
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const digest=async s=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const date=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const query=(db,sql,...args)=>db.prepare(sql).bind(...args);
function result(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Vary':'Origin','X-Content-Type-Options':'nosniff'}});}
async function body(request){const raw=await request.text();if(raw.length>2048)throw new HttpError(413,'内容太长，请精简后重试。');try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value;}catch{throw new HttpError(400,'请检查填写内容。');}}
async function throttle(db,key,max,period){const now=Date.now(),bucket=Math.floor(now/period);const row=await query(db,'INSERT INTO limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',key+':'+bucket,now+period).first();if(row.count>max)throw new HttpError(429,'稍作休息，请过一会再试。');}
async function identify(request,db){const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)throw new HttpError(401,'请先登录，继续积攒云端好运。');const hash=await digest(token);const u=await query(db,'SELECT u.id,u.username,u.nickname,u.total FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?',hash,Date.now()).first();if(!u)throw new HttpError(401,'请重新登录，接着积攒好运。');return{...u,tokenHash:hash};}
async function profile(db,u){const current=await query(db,'SELECT id,username,nickname,total FROM users WHERE id=?',u.id).first();const today=await query(db,'SELECT count FROM daily WHERE user_id=? AND day=?',u.id,date()).first();return{...current,today:today?.count??0,day:date()};}
async function createSession(db,user){const token=random();await query(db,'INSERT INTO sessions(token_hash,user_id,expires) VALUES (?,?,?)',await digest(token),user.id,Date.now()+30*DAY).run();return{token,user:await profile(db,user)};}
async function handle(request,env){const db=env.DB,url=new URL(request.url),path=url.pathname;
if(request.headers.has('Origin')&&request.headers.get('Origin')!==ORIGIN&&request.headers.get('Origin')!==url.origin)throw new HttpError(403,'请从木鱼游戏页面访问。');
if(request.method==='OPTIONS')return result({ok:true});
if(path==='/api/health'&&request.method==='GET'){await query(db,'SELECT 1 FROM users LIMIT 1').first();return result({ok:true,service:'cyber-mokugyo',day:date()});}
if(!path.startsWith('/api/'))return new Response(null,{status:302,headers:{Location:ORIGIN+'/cyber-mokugyo/'}});
if(request.method==='POST'&&!request.headers.get('Content-Type')?.startsWith('application/json'))throw new HttpError(415,'请使用 JSON 格式。');
if((path==='/api/register'||path==='/api/login')&&request.method==='POST'){
 const b=await body(request),username=typeof b.username==='string'?b.username.trim().toLowerCase():'';
 if(!/^[a-z0-9_]{3,20}$/.test(username)||typeof b.password!=='string'||b.password.length<8||encoder.encode(b.password).length>72)throw new HttpError(400,'账号需为 3–20 位字母、数字或下划线；密码需至少 8 位，最多 72 字节。');
 const ip=await digest(request.headers.get('CF-Connecting-IP')||'unknown');
 await throttle(db,'auth-ip:'+ip,30,15*60000);await throttle(db,'auth-user:'+username,15,15*60000);
 if(path==='/api/register'){
  await throttle(db,'register:'+ip,5,3600000);
  const nickname=typeof b.nickname==='string'?b.nickname.trim():'';if(nickname.length<1||nickname.length>16||/[\u0000-\u001f\u007f]/.test(nickname))throw new HttpError(400,'游戏名请填写 1–16 个字符。');
  const existing=await query(db,'SELECT id FROM users WHERE username=?',username).first();if(existing)throw new HttpError(409,'这个账号已有人使用，换一个喜欢的名字吧。');
  const user={id:crypto.randomUUID()},now=Date.now(),hash=await bcrypt.hash(b.password,12);
  try{await query(db,'INSERT INTO users(id,username,nickname,password_hash,credit_at,created_at) VALUES (?,?,?,?,?,?)',user.id,username,nickname,hash,now,now).run();}catch(e){if(String(e.message).includes('UNIQUE'))throw new HttpError(409,'这个账号已有人使用，换一个名字吧。');throw e;}
  return result(await createSession(db,user),201);
 }
 const user=await query(db,'SELECT id,password_hash FROM users WHERE username=?',username).first();
 // 不存在的账号也执行密码校验，避免快捷返回泄露账号状态。
 const valid=await bcrypt.compare(b.password,user?.password_hash??'$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW');
 if(!user||!valid)throw new HttpError(401,'请核对账号和密码，再试一次。');return result(await createSession(db,user));
}
const u=await identify(request,db);
if(path==='/api/me'&&request.method==='GET')return result({user:await profile(db,u)});
if(path==='/api/logout'&&request.method==='POST'){await query(db,'DELETE FROM sessions WHERE token_hash=?',u.tokenHash).run();return result({ok:true});}
if(path==='/api/taps'&&request.method==='POST'){
 const b=await body(request),count=b.count,id=b.id,now=Date.now();
 if(!Number.isInteger(count)||count<1||count>120||typeof id!=='string'||!/^\d{13}-[a-f0-9-]{36}$/.test(id))throw new HttpError(400,'请重新发送本次敲击。');
 const created=Number(id.slice(0,13));if(created>now+60000||created<now-2*DAY)throw new HttpError(422,'这批离线敲击已超过两天，本地好运仍然保留。');
 const rows=await db.batch([
  query(db,'INSERT OR IGNORE INTO events(user_id,id,count,created_at) SELECT ?,?,?,? WHERE (SELECT MIN(200,credits+MAX(0,?-credit_at)*0.02) FROM users WHERE id=?)>=?',u.id,id,count,now,now,u.id,count),
  query(db,'UPDATE users SET total=total+?,credits=MIN(200,credits+MAX(0,?-credit_at)*0.02)-?,credit_at=? WHERE id=? AND EXISTS(SELECT 1 FROM events WHERE user_id=? AND id=? AND applied=0)',count,now,count,now,u.id,u.id,id),
  query(db,'INSERT INTO daily(user_id,day,count) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE user_id=? AND id=? AND applied=0) ON CONFLICT(user_id,day) DO UPDATE SET count=count+excluded.count',u.id,date(),count,u.id,id),
  query(db,'UPDATE events SET applied=1 WHERE user_id=? AND id=?',u.id,id),
  query(db,'SELECT count FROM events WHERE user_id=? AND id=?',u.id,id)
 ]);
 const event=rows[4].results[0];if(!event)throw new HttpError(429,'好运正在同步，稍后自动接着保存。');if(event.count!==count)throw new HttpError(409,'这批敲击已经保存。');
 return result({ok:true,user:await profile(db,u)});
}
if(path==='/api/leaderboard'&&request.method==='GET'){
 const today=url.searchParams.get('period')!=='total',currentDay=date();
 const sql=today?'SELECT u.id,u.nickname,COALESCE(d.count,0) AS score FROM users u LEFT JOIN daily d ON d.user_id=u.id AND d.day=? ORDER BY score DESC,u.created_at ASC,u.id ASC LIMIT 50':'SELECT id,nickname,total AS score FROM users ORDER BY total DESC,created_at ASC,id ASC LIMIT 50';
 const ranking=await query(db,sql,...(today?[currentDay]:[])).all();
 const me=await profile(db,u);const score=today?me.today:me.total;
 const above=today?await query(db,'SELECT COUNT(*) AS n FROM daily WHERE day=? AND count>?',currentDay,score).first():await query(db,'SELECT COUNT(*) AS n FROM users WHERE total>?',score).first();
 const total=await query(db,'SELECT COUNT(*) AS n FROM users').first();
 return result({day:currentDay,period:today?'today':'total',rows:ranking.results.map((r,i)=>({...r,position:i+1})),me:{id:u.id,nickname:u.nickname,score,rank:above.n+1},participants:total.n});
}
throw new HttpError(404,'这里的好运还在路上。');}
export default{async fetch(request,env,ctx){try{return await handle(request,env);}catch(e){if(!(e instanceof HttpError))console.error('muyu_api_error',e.message);return result({error:e instanceof HttpError?e.message:'云端正在休息，本地敲击照常。请稍后重试。'},e.status??503);}}};
