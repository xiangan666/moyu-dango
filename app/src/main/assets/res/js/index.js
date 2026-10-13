/* 摸鱼团子：离线照片首页、全屏手势与 Android 亮度桥接。 */
(function(){
'use strict';
const C=window.DangoCore,S=C.state,$=id=>document.getElementById(id);
const bridge=()=>{try{return typeof window.DangoNative!=='undefined'?window.DangoNative:null;}catch(e){return null;}};
let editing=false,importSlot=-1,importBusy=false,renderVersion=0,currentSheet='',pendingPhoto=null;
let starting=false,session=null,tickTimer=null,hintTimer=null,controlsTimer=null,lastTap=null,pressTimer=null,pointer=null,lastToggle=0,wakeLock=null,backFirstAt=null,backTimer=null;
const imageCache=new Map();
function appVersion(){try{const n=bridge();if(n&&typeof n.appVersion==='function'){const v=n.appVersion();if(v)return String(v);}}catch(e){}return '';}
function toast(text){const e=$('toast');e.textContent=text;e.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove('visible'),2800);}
function persist(){try{C.save();return true;}catch(e){toast('保存失败：本地空间不足，请删除一个旧预设');console.error('Dango save',e);return false;}}
async function source(p,cache=true){if(!p)return null;if(!p.src.startsWith('photo:'))return p.src;const id=p.src.slice(6);if(cache&&imageCache.has(id))return imageCache.get(id);const data=await C.photos.get(id);if(data&&cache)imageCache.set(id,data);return data;}
function button(text,handler,cls){const b=document.createElement('button');b.type='button';b.className=cls||'sheet-option';b.textContent=text;b.onclick=handler;return b;}
function openSheet(title,key){clearTimeout(controlsTimer);$('sheetTitle').textContent=title;$('sheetBody').replaceChildren();$('sheetBackdrop').hidden=false;currentSheet=key||'';$('closeSheetButton').focus();return $('sheetBody');}
function closeSheet(){if(currentSheet==='replace')pendingPhoto=null;$('sheetBackdrop').hidden=true;currentSheet='';}
function option(body,title,subtitle,handler,checked,danger){const b=document.createElement('button');b.className='sheet-option'+(danger?' danger':'');b.type='button';const text=document.createElement('span'),label=document.createElement('b'),desc=document.createElement('small'),mark=document.createElement('span');label.textContent=title;desc.textContent=subtitle||'';mark.className='option-check';mark.textContent=checked?'✓':'›';text.append(label,desc);b.append(text,mark);b.onclick=handler;body.append(b);return b;}
function stats(){const day=C.dayKey(Date.now());$('todayMinutes').textContent=(S.stats.day===day?Math.floor(S.stats.daySeconds/60):0)+' 分钟';$('totalSessions').textContent=S.stats.count+' 次';$('levelLabel').textContent=S.stats.count>=30?'认证松弛团子':S.stats.count>=10?'资深偷闲小团子':S.stats.count>=3?'快乐充电小团子':'初来乍到的小团子';}
async function render(){
 const used=new Set([...S.presets,...S.history].filter(Boolean).map(p=>p.src));for(const id of imageCache.keys())if(!used.has('photo:'+id))imageCache.delete(id);const v=++renderVersion;const grid=$('presetGrid');grid.replaceChildren();grid.classList.toggle('editing',editing);$('editButton').textContent=editing?'完成':'管理';$('presetCount').textContent=S.presets.filter(Boolean).length+' / 5';
 S.presets.forEach((p,i)=>{
  const b=document.createElement('button');b.type='button';b.className='preset-card'+(p?'':' empty')+(i===S.selected&&p?' selected':'');b.setAttribute('aria-label',p?(editing?'管理预设：':'选择预设：')+p.name:'向预设 '+(i+1)+' 加入照片');b.setAttribute('aria-pressed',String(i===S.selected&&!!p));
  if(p){const img=document.createElement('img');img.className='preset-picture';img.alt=p.name;img.src='res/img/dango.svg';img.loading='lazy';const name=document.createElement('span');name.className='preset-name';name.textContent=p.name;const meta=document.createElement('span');meta.className='preset-meta';meta.textContent=p.builtin?'团子的小插画':'我的照片';const badge=document.createElement('span');badge.className='preset-badge';badge.textContent=editing?'···':'✓';b.append(img,badge,name,meta);source(p).then(src=>{if(v!==renderVersion)return;if(src)img.src=src;else{img.alt='照片暂时无法读取';meta.textContent='照片无法读取 · 可重新导入';}}).catch(()=>{});b.onclick=()=>editing?presetMenu(i):select(i,b);}
  else{const plus=document.createElement('span');plus.className='empty-plus';plus.textContent='+';const label=document.createElement('span');label.className='empty-label';label.textContent='放一张小快乐';b.append(plus,label);b.onclick=()=>pickPhoto(i);}
  grid.append(b);
 });
 const note=document.createElement('div');note.className='collection-note';note.innerHTML='<span class="mini-dango">◡</span><b>小小的快乐</b><small>都替你<br>好好收藏了 ♡</small>';grid.append(note);
 const selected=S.presets[S.selected];$('selectedLabel').textContent=selected?'已选：'+selected.name:'先选一张喜欢的照片';$('startButton').disabled=!selected||importBusy;$('fitButton').textContent=S.settings.fit==='cover'?'铺满屏幕':'完整显示';$('timerLabel').innerHTML='';$('timerLabel').append(document.createTextNode(S.settings.timerEnabled&&S.settings.timer?S.settings.timer+' 分钟休息':'不限时休息'));const sm=document.createElement('small');sm.textContent=S.settings.timerEnabled&&S.settings.timer?'到点团子轻轻提醒':'也可以定个小闹钟';$('timerLabel').append(sm);stats();renderHistory(v);
}
function select(i,anchor){if(!S.presets[i])return;S.selected=i;persist();render();if(anchor&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){const r=anchor.getBoundingClientRect(),h=document.createElement('span');h.className='floating-heart';h.textContent='♡';h.style.left=(r.left+r.width/2)+'px';h.style.top=(r.top+20)+'px';document.body.append(h);setTimeout(()=>h.remove(),1100);}}
async function renderHistory(v){const list=$('historyList');list.replaceChildren();$('clearHistoryButton').hidden=S.history.length===0;if(!S.history.length){list.innerHTML='<div class="history-empty"><span>☁</span><div><b>这里还没有偷闲的足迹</b><small>开始一次小休息，团子帮你记住它</small></div></div>';return;}
 S.history.forEach(r=>{const row=document.createElement('button');row.className='history-row';row.type='button';row.setAttribute('aria-label','使用历史照片：'+r.name);const img=document.createElement('img');img.src='res/img/dango.svg';img.alt=r.name;const copy=document.createElement('span');copy.className='history-copy';const title=document.createElement('b');title.textContent=r.name||'我的小快乐';const sub=document.createElement('small');const d=new Date(r.started);sub.textContent=(C.dayKey(r.started)===C.dayKey(Date.now())?'今天':(d.getMonth()+1)+'月'+d.getDate()+'日')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');copy.append(title,sub);const duration=document.createElement('span');duration.className='history-time';duration.textContent=r.finished?(r.seconds<60?r.seconds+' 秒':Math.floor(r.seconds/60)+' 分钟'):'最近使用';const detail=document.createElement('span');detail.textContent=r.toggles?r.toggles+' 次亮度切换':'继续偷个闲 ↗';duration.append(detail);row.append(img,copy,duration);source(r).then(src=>{if(v===renderVersion&&src)img.src=src;}).catch(()=>{});row.onclick=()=>historyMenu(r);list.append(row);});}
function presetMenu(i){const p=S.presets[i];if(!p)return;const body=openSheet(p.name,'preset');option(body,'使用这张预设','选中后点击首页的「开始摸鱼」',()=>{closeSheet();select(i);});option(body,'换一张照片','从相册挑选，保存到这个槽位',()=>{closeSheet();pickPhoto(i);});option(body,'裁剪成全屏照片','拖动、缩放、旋转，保留原图重新构图',()=>{closeSheet();recrop(i);});option(body,'取个可爱的名字','最多 24 个字',()=>rename(i));option(body,'恢复团子插画','这个槽位的默认小插画',()=>{S.presets[i]=C.defaults().presets[i];persist();closeSheet();render();C.garbageCollect();});option(body,'腾出这个槽位','历史中的照片会继续保留',()=>{S.presets[i]=null;if(S.selected===i){const next=S.presets.findIndex(Boolean);S.selected=next<0?0:next;}persist();closeSheet();render();C.garbageCollect();},false,true);}
function rename(i){const p=S.presets[i],body=openSheet('给快乐起个名字','rename');const input=document.createElement('input');input.className='rename-input';input.maxLength=24;input.value=p.name;input.placeholder='例如：老板以为我很忙';body.append(input);body.append(button('就叫这个名字',()=>{const name=input.value.trim();if(!name){toast('名字还没写好呢');return;}p.name=name;persist();closeSheet();render();},'sheet-primary'));setTimeout(()=>{input.focus();input.select();},100);}
function historyMenu(r){const body=openSheet(r.name||'最近的偷闲','history');option(body,'用这张照片开始休息','再次进入全屏照片',()=>{closeSheet();begin(r);});option(body,'存入我的预设','选择一个预设槽位',()=>slots({id:'reused-'+Date.now(),name:r.name,src:r.src,builtin:r.builtin,originalSrc:r.originalSrc,crop:r.crop,width:r.width,height:r.height},true));}
function slots(photo,reuse){pendingPhoto=photo;const body=openSheet(reuse?'收藏这张小快乐':'存到哪个预设？','replace');const desc=document.createElement('p');desc.className='sheet-description';desc.textContent='共有 5 个预设槽位。选中的槽位会换成这张照片，历史记录仍保留原来的照片。';body.append(desc);S.presets.forEach((p,i)=>{const row=document.createElement('button');row.className='slot-option';const img=document.createElement('img');img.src=p?p.src.startsWith('photo:')?'res/img/dango.svg':p.src:'res/img/dango.svg';if(p)source(p).then(src=>{if(src)img.src=src;});const label=document.createElement('span');const b=document.createElement('b');b.textContent=p?p.name:'空预设 '+(i+1);const s=document.createElement('small');s.textContent='槽位 '+(i+1)+(p?' · 替换此预设':' · 放进这里');label.append(b,s);const end=document.createElement('span');end.textContent=p?'替换':'加入';row.append(img,label,end);row.onclick=()=>commitPhoto(photo,i,reuse);body.append(row);});}
function openPicker(mode){
 const n=bridge();if(n&&typeof n.setPickerMode==='function')n.setPickerMode(mode==='file'?'file':'album');
 if(n&&mode==='album'&&typeof n.hasFullAlbumAccess==='function'&&!n.hasFullAlbumAccess()){toast('请先授权相册全部访问');if(typeof n.requestAlbumAccess==='function')n.requestAlbumAccess();return false;}
 if(n&&mode==='file'&&typeof n.storageGranted==='function'&&!n.storageGranted()){toast('请先授权所有文件访问，授权后可用 MT 管理器等选择照片');if(typeof n.requestStorageAccess==='function')n.requestStorageAccess();return false;}
 const input=$('photoInput');input.accept=mode==='file'?'*/*':'image/*';input.value='';input.click();return true;
}
function pickPhoto(slot){if(importBusy)return;importSlot=Number.isInteger(slot)?slot:-1;return openPicker('album');}
function pickFromFiles(slot){if(importBusy)return;importSlot=Number.isInteger(slot)?slot:-1;return openPicker('file');}
function albumAccessRequired(){toast('请先授权相册全部访问');const n=bridge();if(n&&typeof n.requestAlbumAccess==='function')n.requestAlbumAccess();}
function storageAccessRequired(){toast('请先授权所有文件访问，授权后可用 MT 管理器等选择照片');const n=bridge();if(n&&typeof n.requestStorageAccess==='function')n.requestStorageAccess();}
function albumAccessChanged(){if(window.DangoPermissions)window.DangoPermissions.refresh();}
function permissionsChanged(){if(window.DangoPermissions)window.DangoPermissions.refresh();}
async function readOriginal(file){
 if(!file)throw new Error('没有选到照片');
 if(file.type&&!file.type.startsWith('image/'))throw new Error('请选择图片文件');
 if(file.size>40*1024*1024)throw new Error('请选择小于 40 MB 的照片');
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('照片读取失败'));reader.readAsDataURL(file);});
}
function makePhoto(name,result,originalData,originalSrc){
 const id='p'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
 return {id,name:name.slice(0,24),src:'photo:'+id,data:result.data,builtin:false,crop:result.crop,width:result.width,height:result.height,originalSrc:originalSrc||'photo:'+id+'-original',originalData};
}
async function recrop(slot){
 const p=S.presets[slot];if(!p||importBusy)return;
 try{
  const originalSrc=p.originalSrc||p.src,data=await source({src:originalSrc},false);
  if(!data)throw new Error('原图无法读取，请从相册重新导入');
  const result=await window.DangoCropper.open(data,{crop:p.originalSrc?p.crop:null});
  if(result)await commitPhoto(makePhoto(p.name,result,null,originalSrc),slot,false);
 }catch(e){toast(e.message||'裁剪失败');}
}
async function commitPhoto(photo,slot,reuse){if(importBusy)return;importBusy=true;$('importButton').disabled=true;const old=S.presets[slot],previousSelected=S.selected;try{if(!reuse&&photo.originalData){await C.photos.put(photo.originalSrc.slice(6),photo.originalData);}if(!reuse&&photo.data){await C.photos.put(photo.id,photo.data);imageCache.set(photo.id,photo.data);}const saved={id:photo.id,name:photo.name,src:photo.src,builtin:!!photo.builtin,originalSrc:photo.originalSrc,crop:photo.crop,width:photo.width,height:photo.height};S.presets[slot]=saved;S.selected=slot;C.save();pendingPhoto=null;closeSheet();toast('全屏照片已无损保存 ♡');C.garbageCollect();}catch(e){S.presets[slot]=old;S.selected=previousSelected;toast(e.message||'保存照片失败');}finally{importBusy=false;$('importButton').disabled=false;render();}}
$('photoInput').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;const slot=importSlot;
 toast('正在读取原图，准备全屏裁剪…');
 try{
  const data=await readOriginal(file),result=await window.DangoCropper.open(data);
  if(!result)return;
  const name=(file.name.replace(/\.[^.]+$/,'').trim()||'我的小快乐'),photo=makePhoto(name,result,data);
  const empty=S.presets.findIndex(p=>!p);
  if(slot>=0)await commitPhoto(photo,slot,false);else if(empty>=0)await commitPhoto(photo,empty,false);else slots(photo,false);
 }catch(err){toast(err.message||'导入失败，换张照片试试');}finally{e.target.value='';}
});
function timerMenu(){const body=openSheet('给休息留一点时间','timer');[0,5,10,15,25,30].forEach(n=>option(body,n?n+' 分钟':'不限时',n?'到点自动结束，恢复亮度':'想休息多久，就休息多久',()=>{S.settings.timer=n;S.settings.timerEnabled=n>0;persist();closeSheet();render();if(!$('settingsPage').hidden)renderSettings();},S.settings.timer===n));}
function haptic(){if(!S.settings.haptic)return;const n=bridge();if(n&&typeof n.dangoHaptic==='function'){try{n.dangoHaptic();return;}catch(e){}}if(navigator.vibrate)navigator.vibrate(18);}
function fit(){S.settings.fit=S.settings.fit==='contain'?'cover':'contain';persist();$('viewer').classList.toggle('cover',S.settings.fit==='cover');$('fitButton').textContent=S.settings.fit==='cover'?'铺满屏幕':'完整显示';toast(S.settings.fit==='cover'?'照片铺满屏幕':'完整保留整张照片');}
async function acquireWake(){const n=bridge();if(n&&typeof n.setKeepAwake==='function'){n.setKeepAwake(S.settings.keepAwake);return;}if(S.settings.keepAwake&&navigator.wakeLock)try{wakeLock=await navigator.wakeLock.request('screen');}catch(e){}}
function releaseWake(){if(wakeLock){wakeLock.release().catch(()=>{});wakeLock=null;}}
function brightnessPermission(){window.DangoPermissions.show();}
async function begin(p){
 if(window.DangoDeveloperWelcome&&window.DangoDeveloperWelcome.isOpen())return;
 if(session||starting)return;p=p||S.presets[S.selected];if(!p){toast('先放一张喜欢的照片吧');return;}
 const n=bridge(),permissions=window.DangoPermissions.refresh();
 if(n&&permissions.state!=='granted'){settingsMenu();toast('请在设置页开启系统亮度权限');return;}
 starting=true;
 try{
  const src=await source(p);if(!src){toast('这张照片无法读取，请重新导入');return;}
  const img=$('viewerImage');img.src=src;img.alt=p.name;
  await new Promise(resolve=>{if(img.complete)resolve();else{img.onload=resolve;img.onerror=resolve;}});
  if(!img.naturalWidth){toast('这张照片暂时打不开，请换一张试试');return;}
  const started=Date.now();let native=false;
  if(n&&typeof n.beginBreak==='function'){
   applyDetectionOptions();
   native=n.beginBreak(S.settings.keepAwake)===true;
   if(!native){toast('系统亮度功能未启动，请检查修改系统设置授权');return;}
  }
  let record;
  try{record=C.addRecord(p,started);}catch(e){if(native)n.endBreak();throw e;}
  session={preset:{...p},record,started,activeStart:started,accumulated:0,dim:false,toggles:0,native,suspended:false,timer:(S.settings.timerEnabled?S.settings.timer:0)*60};
  resetReturnHome();lastTap=null;lastToggle=0;$('viewer').hidden=false;$('viewer').classList.toggle('cover',S.settings.fit==='cover');document.body.classList.add('session-active');$('viewerControls').hidden=true;$('viewerHint').style.opacity='1';
  const hasDetection=n&&typeof n.sensorActive==='function'&&n.sensorActive();
  $('viewerHint').firstChild.textContent=native?(hasDetection?'光线 / 距离任一遮挡：亮度 0 · '+(S.settings.doubleTapToggle?'双击切换':'菜单切换亮度'):(S.settings.doubleTapToggle?'双击切换亮度 · 长按菜单可手动调节':'长按照片打开菜单调节亮度')):'照片全屏预览';
  if(!S.settings.showHints)$('viewerHint').style.opacity='0';
  session.dim=native&&n&&typeof n.brightnessState==='function'?n.brightnessState()===true:false;
  updateDimUI();
  if(!native&&$('viewer').requestFullscreen)try{await $('viewer').requestFullscreen({navigationUI:'hide'});}catch(e){}
  history.pushState({dangoViewer:true},'','#relax');acquireWake();
  clearTimeout(hintTimer);hintTimer=setTimeout(()=>$('viewerHint').style.opacity='0',3500);tickTimer=setInterval(tick,500);tick();haptic();renderHistory(renderVersion);
  if(!native)toast('网页预览无法调节系统亮度，请运行 Android 版');
 }catch(e){toast(e.message||'进入全屏失败');}finally{starting=false;}
}
function seconds(){return session?Math.floor((session.accumulated+(session.suspended?0:Date.now()-session.activeStart))/1000):0;}
function tick(){if(!session)return;const sec=seconds();$('sessionClock').textContent=session.timer?'剩余 '+C.clock(Math.max(0,session.timer-sec)):C.clock(sec);if(session.timer&&sec>=session.timer){finish(true);return;}if(session.record){session.record.seconds=sec;session.record.toggles=session.toggles;}}
function updateDimUI(){if(!session)return;$('brightnessStatus').textContent=session.dim?'系统亮度 0':'原系统亮度';$('brightnessButton').textContent=session.dim?'恢复系统亮度':'亮度设为 0';}
function restoreBrightness(){
 if(!session||session.suspended)return;
 if(!session.native){toast('请在 Android 应用中恢复系统亮度');return;}
 const n=bridge();let wasDark=session.dim;
 if(n&&typeof n.brightnessState==='function')wasDark=n.brightnessState()===true;
 try{if(!n||n.setDim(false)!==true){toast('恢复亮度失败，请检查设置中的授权');return;}}catch(e){toast('系统亮度接口暂时不可用');return;}
 session.dim=false;if(wasDark)session.toggles++;lastTap=null;updateDimUI();$('viewerControls').hidden=true;$('viewerHint').style.opacity='0';haptic();toast('系统亮度恢复原值 ♡');
}
function sharedBrightnessState(fallback){
 const n=bridge();
 try{if(n&&typeof n.brightnessState==='function')return n.brightnessState()===true;}catch(e){console.warn('[Dango] 读取亮度状态失败',e);}
 return !!fallback;
}
function toggleDim(){
 if(!session||session.suspended)return;
 if(!session.native){toast('当前为照片预览，无法调节系统亮度');return;}
 const n=bridge();let next;
 try{
  if(!n){toast('系统亮度接口暂时不可用');return;}
  if(typeof n.toggleBrightness==='function'){
   if(n.toggleBrightness()!==true){toast('调节亮度失败，请检查设置中的授权');return;}
   next=sharedBrightnessState(!session.dim);
  }else{
   // 兼容旧入口时也读取原生状态，不仅根据页面缓存判断。
   next=!sharedBrightnessState(session.dim);
   if(n.setDim(next)!==true){toast('调节亮度失败，请检查设置中的授权');return;}
   next=sharedBrightnessState(next);
  }
 }catch(e){toast('系统亮度接口暂时不可用');return;}
 session.dim=next;session.toggles++;lastTap=null;updateDimUI();$('viewerControls').hidden=true;$('viewerHint').style.opacity='0';haptic();
 if(!next)toast('系统亮度恢复原值 ♡');
}
function showControls(){if(!session)return;$('viewerControls').hidden=false;clearTimeout(controlsTimer);controlsTimer=setTimeout(()=>{$('viewerControls').hidden=true;},6000);haptic();}
function nativeBrightness(dim){if(!session)return;session.dim=sharedBrightnessState(dim);updateDimUI();}
function nativeCover(dim,source){
 if(!session||session.suspended)return;const current=sharedBrightnessState(dim);session.dim=current;updateDimUI();if(!current)return;session.toggles++;lastTap=null;$('viewerHint').style.opacity='0';$('viewerControls').hidden=true;haptic();
}
function applyDetectionOptions(){
 const n=bridge();if(n&&typeof n.setDetectionOptions==='function')return n.setDetectionOptions(S.settings.lightCover,S.settings.proximity,S.settings.lightSensitivity,S.settings.coverDelay,S.settings.proximityDistance)===true;
 return false;
}
function suspend(){resetReturnHome();window.DangoPermissions.onPause();if(!session||session.suspended)return;session.accumulated+=Date.now()-session.activeStart;session.suspended=true;session.dim=false;const n=bridge();if(session.native&&n)try{n.pauseBreak();}catch(e){}updateDimUI();releaseWake();try{C.save();}catch(e){} }
function resume(){window.DangoPermissions.onResume();if(!session||!session.suspended)return;session.suspended=false;session.activeStart=Date.now();session.dim=false;const n=bridge();if(session.native&&n)try{n.resumeBreak();if(typeof n.brightnessState==='function')session.dim=n.brightnessState()===true;}catch(e){}updateDimUI();acquireWake();tick();}
function resetReturnHome(){clearTimeout(backTimer);backTimer=null;backFirstAt=null;}
function backClock(){return window.performance&&typeof window.performance.now==='function'?window.performance.now():Date.now();}
function armReturnHome(){
 resetReturnHome();backFirstAt=backClock();toast('再按一次返回首页 · 团子会恢复亮度');
 backTimer=setTimeout(resetReturnHome,S.settings.backWindow);
}
function returnFromViewer(fromPop){
 if(!S.settings.confirmBack){finish(false,fromPop===true,true);return true;}
 if(backFirstAt!==null&&backClock()-backFirstAt<=S.settings.backWindow){finish(false,fromPop===true,true);}
 else{armReturnHome();}
 return true;
}
function finish(auto,fromPop,quiet){if(!session)return;const sec=seconds(),finished=session;session=null;resetReturnHome();clearInterval(tickTimer);tickTimer=null;clearTimeout(hintTimer);clearTimeout(controlsTimer);clearTimeout(pressTimer);lastTap=null;pointer=null;const n=bridge();if(finished.native&&n)try{n.endBreak();}catch(e){console.error('Dango restore brightness',e);}releaseWake();closeSettings();$('viewer').hidden=true;document.body.classList.remove('session-active');if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(()=>{});C.finishRecord(finished.record,sec,finished.toggles);render();if(!fromPop&&location.hash==='#relax')history.back();if(!quiet&&S.settings.showSummary)summary(sec,finished.toggles,auto);}
function summary(sec,toggles,auto){const body=openSheet(auto?'休息到点啦':'这份松弛，收好啦','summary');const art=document.createElement('img');art.src='res/img/dango.svg';art.className='summary-art';art.alt='开心的小团子';const title=document.createElement('p');title.className='summary-title';title.textContent=auto?'团子轻轻叫醒你 ♡':'又充了一点电 ♡';const text=document.createElement('p');text.className='summary-text';text.textContent='休息过的小团子，也会继续闪闪发光。';const group=document.createElement('div');group.className='summary-stats';[[sec<60?sec+' 秒':Math.floor(sec/60)+' 分钟','本次小休息'],[toggles+' 次','亮度来回切换']].forEach(([value,label])=>{const div=document.createElement('div'),b=document.createElement('b'),s=document.createElement('small');b.textContent=value;s.textContent=label;div.append(b,s);group.append(div);});body.append(art,title,text,group,button('带着一点甜，继续出发',closeSheet,'sheet-primary'));if(auto)haptic();}
function settingsMenu(){
 resetReturnHome();clearTimeout(pressTimer);pointer=null;lastTap=null;
 $('settingsPage').hidden=false;document.body.classList.add('settings-open');renderSettings();
}
function closeSettings(){if($('settingsPage'))$('settingsPage').hidden=true;document.body.classList.remove('settings-open');}
function renderSettings(){
 const body=$('settingsBody');body.replaceChildren();const status=window.DangoPermissions.refresh();
 function group(title,note){const el=document.createElement('section');el.className='settings-group';const h=document.createElement('h3');h.className='settings-group-title';h.textContent=title;el.append(h);if(note){const p=document.createElement('p');p.className='settings-group-note';p.textContent=note;el.append(p);}body.append(el);return el;}
 function setting(parent,key,label,sub,available){
  const row=document.createElement('div');row.className='setting-row';const t=document.createElement('span'),b=document.createElement('b'),small=document.createElement('small'),sw=document.createElement('button');b.textContent=label;small.textContent=sub;t.append(b,small);sw.className='switch'+(S.settings[key]?' on':'');sw.role='switch';sw.setAttribute('aria-checked',String(S.settings[key]));sw.setAttribute('aria-label',label);sw.dataset.setting=key;
  if(available===false){sw.disabled=true;small.textContent+=' · 此设备未提供';small.dataset.unavailable='true';}
  sw.onclick=()=>{const previous=S.settings[key];S.settings[key]=!previous;if(!persist()){S.settings[key]=previous;return;}
   if(['lightCover','proximity'].includes(key))applyDetectionOptions();
   if(key==='keepAwake'&&session){if(S.settings.keepAwake)acquireWake();else{const n=bridge();if(n&&typeof n.setKeepAwake==='function')n.setKeepAwake(false);releaseWake();}}
   if(key==='confirmBack')resetReturnHome();if(key==='showHints'&&!S.settings.showHints)$('viewerHint').style.opacity='0';
   if(key==='timerEnabled'&&session){session.timer=S.settings.timerEnabled?S.settings.timer*60:0;tick();}
   sw.classList.toggle('on',S.settings[key]);sw.setAttribute('aria-checked',String(S.settings[key]));render();};row.append(t,sw);parent.append(row);
 }
 function choose(title,key,choices,suffix,onChange){const b=openSheet(title,'preference');choices.forEach(item=>{const v=Array.isArray(item)?item[0]:item,label=Array.isArray(item)?item[1]:String(item)+(suffix||'');option(b,label,'',()=>{S.settings[key]=v;persist();if(onChange)onChange();closeSheet();renderSettings();render();},S.settings[key]===v);});}
 const detection=group('01 · 遮挡检测','光线与距离独立生效，任意一种满足就调暗。环境太暗时光线通道可能无法区分遮挡，距离通道仍可单独工作。');
 setting(detection,'lightCover','光线遮挡调暗','检测光线骤降，无法定位屏幕上的遮挡区域',status.lightAvailable);
 option(detection,'光线灵敏度',['稳妥','标准','敏感'][S.settings.lightSensitivity],()=>choose('光线灵敏度','lightSensitivity',[[0,'稳妥 · 减少环境变化误触'],[1,'标准 · 日常使用'],[2,'敏感 · 更容易触发']],null,applyDetectionOptions));
 option(detection,'遮挡确认时间',S.settings.coverDelay+' 毫秒',()=>choose('遮挡确认时间','coverDelay',[150,350,600,1000],' 毫秒',applyDetectionOptions));
 setting(detection,'proximity','距离遮挡调暗','距离感应区按硬件位置工作',status.proximityAvailable);
 option(detection,'距离触发阈值',S.settings.proximityDistance+' 厘米',()=>choose('距离触发阈值','proximityDistance',[[1,'约 1 厘米 · 贴近触发'],[3,'约 3 厘米'],[5,'约 5 厘米']],null,applyDetectionOptions));
 const note=document.createElement('p');note.className='settings-info';note.textContent='光线或距离只负责调暗，移开遮挡不会恢复。双击按照共享亮度状态在 0 与原值之间切换。恢复后须先解除两种已启用检测的遮挡，再接受下一次自动调暗。光线感应启动时会短暂学习环境光，请先保持屏幕不被遮住。部分距离传感器只返回远/近，厘米设置受硬件精度限制。';detection.append(note);
 const gestures=group('02 · 全屏操作');
 setting(gestures,'doubleTapToggle','双击切换亮度','亮度为 0 时恢复原值，否则调为 0');
 setting(gestures,'longPressMenu','长按显示全屏菜单','全屏菜单通过长按照片打开；关闭后仍可返回首页设置');
 setting(gestures,'confirmBack','连续返回两次才回首页','默认开启，第一次返回只提示');
 option(gestures,'返回确认间隔',(S.settings.backWindow/1000)+' 秒',()=>choose('返回确认间隔','backWindow',[[1000,'1 秒'],[2000,'2 秒'],[3000,'3 秒']],null,resetReturnHome));
 setting(gestures,'showHints','显示全屏操作提示','进入全屏短暂显示，之后自动隐藏');
 const rest=group('03 · 休息偏好');
 setting(rest,'keepAwake','全屏保持唤醒','只在摸鱼全屏中保持亮屏');setting(rest,'haptic','触感反馈','开始、遮挡调暗和恢复时轻轻震动');
 setting(rest,'timerEnabled','启用休息计时','使用下方的时长，到点恢复亮度并结束');
 option(rest,'休息时长',S.settings.timer?S.settings.timer+' 分钟':'不限时',()=>choose('休息时长','timer',[[0,'不限时'],[5,'5 分钟'],[10,'10 分钟'],[15,'15 分钟'],[25,'25 分钟'],[30,'30 分钟']],null,()=>{if(session){session.timer=S.settings.timerEnabled?S.settings.timer*60:0;tick();}}));
 option(rest,'照片显示方式',S.settings.fit==='cover'?'铺满屏幕':'完整显示',()=>choose('照片显示方式','fit',[['cover','铺满屏幕 · 边缘可能裁切'],['contain','完整显示 · 保留整张照片']],null,()=>{$('viewer').classList.toggle('cover',S.settings.fit==='cover');}));
 setting(rest,'recordHistory','记录最近五次休息','关闭后不再新增记录，已有历史仍保留');setting(rest,'showSummary','显示结束小卡片','结束按钮或计时到点后显示休息统计');setting(rest,'welcome','启动时显示开发者介绍','默认每次启动显示一次，可在这里关闭');
 const permissions=group('04 · 权限与关于');window.DangoPermissions.mount(permissions);
 option(permissions,'团子的使用说明','遮挡调暗、双击切换、连续返回两次结束',help);
 option(permissions,'项目与开发者','相安 · 3199912548@qq.com',()=>{closeSettings();if(window.DangoDeveloperWelcome)window.DangoDeveloperWelcome.showAbout();});
 const foot=document.createElement('p');foot.className='settings-footer';const ver=appVersion();foot.textContent='相安开发 · '+(ver?'v'+ver+' · ':'')+'每一份小习惯，都记在本机 ♡';body.append(foot);
}
function help(){const body=openSheet('团子的偷闲指南','help'),steps=document.createElement('div');steps.className='help-steps';[['导入并裁剪照片','从相册读取原图，拖动、缩放、旋转到本机全屏比例，无损保存。预设管理里可以重新裁剪。'],['开始摸鱼，进入全屏','首页的粉色按钮会展开所选照片。'],['双击切换亮度','光线或距离检测到遮挡会调暗；双击在 0 与原亮度之间切换。开关可在设置页调整。'],['两种遮挡独立生效','光线骤降或距离变近，任意一种满足就调暗；两种检测可以分别关闭。移开遮挡保持当前亮度。双击恢复后先解除遮挡，才能再次自动调暗。'],['长按照片','唤出调节亮度、显示方式和结束休息菜单。'],['返回首页，自动恢复','默认连续两次返回才回首页，间隔和开关可在设置页调整。结束按钮或计时到点仍可直接结束。进入后台也恢复亮度。']].forEach(([title,text],i)=>{const row=document.createElement('div');row.className='help-step';const n=document.createElement('span');n.textContent=i+1;const t=document.createElement('div');t.textContent=title;const sub=document.createElement('small');sub.textContent=text;t.append(sub);row.append(n,t);steps.append(row);});body.append(steps);}
const viewer=$('viewer');
function down(x,y,id){if(!session||!$('settingsPage').hidden)return;pointer={x,y,id,time:Date.now(),moved:false,long:false};clearTimeout(pressTimer);if(!S.settings.longPressMenu)return;pressTimer=setTimeout(()=>{if(pointer&&!pointer.moved){pointer.long=true;lastTap=null;showControls();}},650);}
function move(x,y){if(pointer&&Math.hypot(x-pointer.x,y-pointer.y)>18){pointer.moved=true;clearTimeout(pressTimer);lastTap=null;}}
function up(x,y,id){clearTimeout(pressTimer);if(!pointer||pointer.id!==id)return;const p=pointer;pointer=null;if(p.moved||p.long||Date.now()-p.time>500)return;const now=Date.now();if(lastTap&&now-lastTap.time<=320&&Math.hypot(x-lastTap.x,y-lastTap.y)<=48){lastTap=null;if(S.settings.doubleTapToggle)toggleDim();}else lastTap={x,y,time:now};}
if(window.PointerEvent){viewer.addEventListener('pointerdown',e=>{if(e.target.closest('button,.viewer-controls')||!e.isPrimary)return;viewer.setPointerCapture(e.pointerId);down(e.clientX,e.clientY,e.pointerId);});viewer.addEventListener('pointermove',e=>move(e.clientX,e.clientY));viewer.addEventListener('pointerup',e=>up(e.clientX,e.clientY,e.pointerId));viewer.addEventListener('pointercancel',()=>{clearTimeout(pressTimer);pointer=null;lastTap=null;});}
else{viewer.addEventListener('touchstart',e=>{if(e.target.closest('button,.viewer-controls')||e.touches.length!==1){clearTimeout(pressTimer);pointer=null;return;}e.preventDefault();const t=e.touches[0];down(t.clientX,t.clientY,t.identifier);},{passive:false});viewer.addEventListener('touchmove',e=>{if(e.touches.length===1){const t=e.touches[0];move(t.clientX,t.clientY);}else{clearTimeout(pressTimer);pointer=null;}},{passive:false});viewer.addEventListener('touchend',e=>{const t=e.changedTouches[0];if(t)up(t.clientX,t.clientY,t.identifier);});viewer.addEventListener('touchcancel',()=>{clearTimeout(pressTimer);pointer=null;lastTap=null;});}
viewer.addEventListener('contextmenu',e=>e.preventDefault());
$('viewerSettingsButton').onclick=settingsMenu;$('settingsBackButton').onclick=closeSettings;$('brightnessButton').onclick=toggleDim;$('viewerFitButton').onclick=fit;$('exitButton').onclick=()=>finish(false);
$('startButton').onclick=()=>begin();$('importButton').onclick=()=>pickPhoto(-1);$('fileImportButton').onclick=()=>pickFromFiles(-1);$('fitButton').onclick=fit;$('timerButton').onclick=timerMenu;$('settingsButton').onclick=settingsMenu;$('editButton').onclick=()=>{editing=!editing;render();};$('randomButton').onclick=()=>{const list=S.presets.map((p,i)=>p?i:-1).filter(i=>i>=0&&i!==S.selected);if(!list.length){toast(S.presets.some(Boolean)?'这一张已经很好啦 ♡':'先加入一张照片吧');return;}select(list[Math.floor(Math.random()*list.length)]);toast('团子挑中了：'+S.presets[S.selected].name);};
$('closeSheetButton').onclick=closeSheet;$('sheetBackdrop').onclick=e=>{if(e.target===$('sheetBackdrop'))closeSheet();};$('clearHistoryButton').onclick=()=>{const body=openSheet('清空最近的偷闲？','clear');const p=document.createElement('p');p.className='sheet-description';p.textContent='会清空最近 5 条记录。照片预设和累计休息时间会继续保留。';body.append(p);body.append(button('清空这些足迹',()=>{S.history=[];persist();closeSheet();render();C.garbageCollect();toast('新的偷闲旅程，开始啦');},'sheet-primary'));};
window.addEventListener('popstate',()=>{if(!session)return;window.DangoApp.nativeBack(true);if(session)history.pushState({dangoViewer:true},'','#relax');});document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else resume();});document.addEventListener('fullscreenchange',()=>{if(session&&!session.native&&!document.fullscreenElement&&backFirstAt===null)window.DangoApp.nativeBack();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.repeat&&window.DangoApp.nativeBack())e.preventDefault();});
window.addEventListener('pagehide',()=>{if(session){const n=bridge();if(n)try{n.endBreak();}catch(e){}try{C.save();}catch(e){}}});
window.DangoApp={nativePaused:suspend,nativeResumed:resume,nativeBrightness,nativeCover,nativeBack:function(fromPop){if(window.DangoDeveloperWelcome&&window.DangoDeveloperWelcome.isOpen()){resetReturnHome();window.DangoDeveloperWelcome.hide();return true;}if(window.DangoCropper.isOpen()){resetReturnHome();window.DangoCropper.cancel();return true;}if(!$('sheetBackdrop').hidden){resetReturnHome();closeSheet();return true;}if(!$('settingsPage').hidden){resetReturnHome();closeSettings();return true;}if(session)return returnFromViewer(fromPop);return false;},permissionsChanged:()=>window.DangoPermissions.onResume(),openPicker,albumAccessRequired,storageAccessRequired,albumAccessChanged,restoreBrightness,toggleDim,showControls,begin,finish,isRunning:()=>!!session,hasNative:()=>!!bridge()};
const messages=['世界很忙，团子陪你慢半拍。','认真生活，也认真给自己充电。','把烦恼捏成团子，明天再处理。','今天的快乐配额：多一点发呆。','不必时刻满格，小团子也会累。'];$('dailyMessage').textContent=messages[new Date().getDate()%messages.length];
window.DangoPermissions.init({bridge,toast,button,openSheet,closeSheet,openPicker,isSheet:key=>currentSheet===key&&!$('sheetBackdrop').hidden});
render();C.garbageCollect();console.info('[Dango] 首页加载完成；原生亮度接口：'+(bridge()?'已连接':'界面预览'));
})();
