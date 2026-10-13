/* 摸鱼团子：五个预设、五条历史、照片与元数据持久化。 */
(function (root) {
'use strict';
const names = ['团子放空中','薄荷小森林','月亮打个盹','奶茶续命中','云朵发呆日'];
const key = 'moyu_dango_state_v1';
const defaults = () => ({version:4, presets:names.map((name,i)=>({id:'builtin-'+i,name,src:'res/img/preset-'+(i+1)+'.svg',builtin:true})),history:[],selected:0,settings:{fit:'cover',timer:0,timerEnabled:true,haptic:true,keepAwake:true,lightCover:true,proximity:true,lightSensitivity:1,coverDelay:350,proximityDistance:5,doubleTapToggle:true,longPressMenu:true,confirmBack:true,backWindow:2000,showHints:true,welcome:true,recordHistory:true,showSummary:true},stats:{count:0,seconds:0,day:'',daySeconds:0}});
const dayKey = time => {const d=new Date(time);return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();};
function normalize(input) {
  const s=defaults();
  if(!input || typeof input!=='object')return s;
  if(Array.isArray(input.presets))s.presets=Array.from({length:5},(_,i)=>{const p=input.presets[i];return p&&typeof p.id==='string'&&typeof p.name==='string'&&typeof p.src==='string'?{id:p.id,name:p.name.slice(0,24),src:p.src,builtin:p.builtin===true,originalSrc:typeof p.originalSrc==='string'?p.originalSrc:undefined,crop:p.crop&&typeof p.crop==='object'?p.crop:undefined,width:Number(p.width)||undefined,height:Number(p.height)||undefined}:null;});
  if(Array.isArray(input.history))s.history=input.history.filter(r=>r&&typeof r.id==='string'&&typeof r.src==='string'&&Number.isFinite(r.started)).slice(0,5);
  if(Number.isInteger(input.selected)&&input.selected>=0&&input.selected<5)s.selected=input.selected;
  const cfg=input.settings||{};
  s.settings={fit:cfg.fit==='contain'?'contain':'cover',timer:[0,5,10,15,25,30].includes(cfg.timer)?cfg.timer:0,timerEnabled:cfg.timerEnabled!==false,
    haptic:cfg.haptic!==false,keepAwake:cfg.keepAwake!==false,lightCover:cfg.lightCover!==false,proximity:cfg.proximity!==false,
    lightSensitivity:[0,1,2].includes(cfg.lightSensitivity)?cfg.lightSensitivity:1,coverDelay:[150,350,600,1000].includes(cfg.coverDelay)?cfg.coverDelay:350,
    proximityDistance:[1,3,5].includes(cfg.proximityDistance)?cfg.proximityDistance:5,doubleTapToggle:typeof cfg.doubleTapToggle==='boolean'?cfg.doubleTapToggle:cfg.doubleTapRestore!==false,
    longPressMenu:cfg.longPressMenu!==false,confirmBack:cfg.confirmBack!==false,backWindow:[1000,2000,3000].includes(cfg.backWindow)?cfg.backWindow:2000,
    showHints:cfg.showHints!==false,welcome:cfg.welcome!==false,recordHistory:cfg.recordHistory!==false,showSummary:cfg.showSummary!==false};
  if(input.stats){['count','seconds','daySeconds'].forEach(k=>{s.stats[k]=Math.max(0,Number(input.stats[k])||0);});s.stats.day=typeof input.stats.day==='string'?input.stats.day:'';}
  if(!s.presets[s.selected]){const i=s.presets.findIndex(Boolean);s.selected=i<0?0:i;}
  return s;
}
let state;
try{state=normalize(JSON.parse(root.localStorage.getItem(key)));}catch(e){state=defaults();}
let dbPromise;
function database(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    if(!root.indexedDB){reject(new Error('此环境不支持照片存储'));return;}
    const req=root.indexedDB.open('moyu_dango_photos',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('photos');
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('无法打开照片存储'));
    req.onblocked=()=>reject(new Error('照片存储正在被另一个窗口使用'));
  });return dbPromise;
}
function nativeStore(){try{if(typeof root.DangoNative!=='undefined'&&typeof root.DangoNative.savePhoto==='function')return root.DangoNative;return null;}catch(e){return null;}}
const photos={
  async put(id,data){
    const n=nativeStore();
    if(n){if(n.savePhoto(id,data)!==true)throw new Error('照片写入失败');return;}
    try{const db=await database();await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put(data,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('照片保存中断'));});}
    catch(e){try{root.localStorage.setItem('dango_photo_'+id,data);}catch(err){throw new Error('空间不足，请先删除一个自定义预设');}}
  },
  async get(id){
    const n=nativeStore();if(n){const data=n.loadPhoto(id);if(data)return data;}
    try{const db=await database();const result=await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readonly');const req=tx.objectStore('photos').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});if(result)return result;}catch(e){}
    try{return root.localStorage.getItem('dango_photo_'+id);}catch(e){return null;}
  },
  async remove(id){
    const n=nativeStore();if(n)try{n.deletePhoto(id);}catch(e){}
    try{const db=await database();await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}catch(e){}
    try{root.localStorage.removeItem('dango_photo_'+id);}catch(e){}
  }
};
function save(){root.localStorage.setItem(key,JSON.stringify(state));}
function setPreset(slot,preset){if(!Number.isInteger(slot)||slot<0||slot>4)throw new Error('预设槽位不存在');state.presets[slot]=preset;state.selected=slot;save();}
function addRecord(preset,started){const r={id:'session-'+started,name:preset.name,src:preset.src,builtin:preset.builtin,originalSrc:preset.originalSrc,crop:preset.crop,width:preset.width,height:preset.height,started,seconds:0,toggles:0,finished:false};if(state.settings.recordHistory){state.history.unshift(r);state.history=state.history.slice(0,5);save();}return r;}
function finishRecord(record,seconds,toggles){record.seconds=Math.max(0,Math.round(seconds));record.toggles=toggles;record.finished=true;state.stats.count++;state.stats.seconds+=record.seconds;const day=dayKey(Date.now());if(state.stats.day!==day){state.stats.day=day;state.stats.daySeconds=0;}state.stats.daySeconds+=record.seconds;save();}
async function garbageCollect(){const used=new Set([...state.presets,...state.history].filter(Boolean).flatMap(p=>[p.src,p.originalSrc]).filter(src=>typeof src==='string'&&src.startsWith('photo:')).map(src=>src.slice(6)));const n=nativeStore();if(n&&typeof n.prunePhotos==='function')try{n.prunePhotos(JSON.stringify(Array.from(used)));}catch(e){}try{const db=await database();const tx=db.transaction('photos','readwrite');const store=tx.objectStore('photos');const req=store.openCursor();req.onsuccess=()=>{const cursor=req.result;if(cursor){if(!used.has(cursor.key))cursor.delete();cursor.continue();}};}catch(e){}try{for(let i=root.localStorage.length-1;i>=0;i--){const k=root.localStorage.key(i);if(k&&k.startsWith('dango_photo_')&&!used.has(k.slice(12)))root.localStorage.removeItem(k);}}catch(e){} }
function elapsed(start,now){return Math.max(0,Math.floor(((now||Date.now())-start)/1000));}
function clock(seconds){seconds=Math.max(0,Math.floor(seconds));const m=Math.floor(seconds/60);const s=seconds%60;return(m<10?'0':'')+m+':'+(s<10?'0':'')+s;}
root.DangoCore={state,defaults,normalize,save,setPreset,addRecord,finishRecord,photos,garbageCollect,elapsed,clock,dayKey,names};
})(window);
