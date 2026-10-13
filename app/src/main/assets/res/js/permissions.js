/* 设置页权限管理：亮度、相册全部访问、所有文件访问、文件管理器彼此独立。 */
(function(){
'use strict';
const $=id=>document.getElementById(id);let ui=null,latest=null;
function inspect(){
 const n=ui.bridge();if(!n)return {state:'preview',nativeReady:false,brightnessGranted:false,albumAccess:'denied',storageAccess:'denied',proximityAvailable:null,lightAvailable:null,fileManagerPickerAvailable:null};
 try{
  if(typeof n.permissionInfo==='function'){const raw=JSON.parse(n.permissionInfo());if(typeof raw.brightnessGranted!=='boolean')throw new Error('权限状态无效');return {...raw,state:raw.brightnessGranted?'granted':'missing'};}
  const granted=typeof n.canChangeBrightness==='function'&&n.canChangeBrightness()===true;return {state:granted?'granted':'missing',nativeReady:true,brightnessGranted:granted,albumAccess:n.albumAccess?n.albumAccess():'denied',storageAccess:n.storageAccess?n.storageAccess():'denied',proximityAvailable:n.hasProximity?n.hasProximity()===true:null,lightAvailable:n.hasLight?n.hasLight()===true:null,fileManagerPickerAvailable:n.hasFileManagerPicker?n.hasFileManagerPicker()===true:null};
 }catch(e){console.warn('[Dango] permission check failed',e);return {state:'error',nativeReady:true,brightnessGranted:false,albumAccess:'denied',storageAccess:'denied'};}
}
function actionRow(body,title,description,label,handler,disabled){const row=document.createElement('div');row.className='permission-row';const text=document.createElement('span'),b=document.createElement('b'),small=document.createElement('small'),button=document.createElement('button');b.textContent=title;small.textContent=description;text.append(b,small);button.className='permission-details-button';button.textContent=label;button.disabled=!!disabled;button.onclick=handler;row.append(text,button);body.append(row);}
function details(status,body){
 body.replaceChildren();const intro=document.createElement('p');intro.className='sheet-description';intro.textContent='每个权限入口独立操作。点击一个按钮只打开对应设置或选择器，不会连带申请其他权限。';body.append(intro);
 actionRow(body,'系统亮度','修改系统设置，用于亮度 0 与原值切换',status.brightnessGranted?'已授权':'打开授权',authorizeBrightness,status.brightnessGranted||status.state==='preview');
 const album=status.albumAccess||'denied';actionRow(body,'相册全部照片访问','申请读取全部照片',album==='full'?'已授权':album==='partial'?'仅选中照片 · 去设置改为全部':'申请全部照片访问',authorizeAlbum,album==='full'||status.state==='preview');
 const storage=status.storageAccess||'denied';actionRow(body,'所有文件访问','用于从文件夹导入照片',storage==='full'||storage==='legacy'?'已授权':'打开所有文件授权',authorizeStorage,storage==='full'||storage==='legacy'||status.state==='preview');
 actionRow(body,'文件管理器选择','打开 MT 管理器等支持的文件选择应用','选择文件',openFileManager,status.fileManagerPickerAvailable===false||status.state==='preview');
 const info=document.createElement('p');info.className='permission-detail-note';info.textContent='光线和距离感应无需额外权限；全部照片访问与所有文件访问是两项独立授权。文件管理器选择使用系统选择器，不等同于“使用此文件夹”。';body.append(info);
 body.append(ui.button('重新检查',()=>{refresh();ui.toast('已重新检查各项权限');},'permission-recheck-button'));
}
function refresh(){if(!ui)return null;latest=inspect();if(mountedCard)details(latest,mountedCard);if(ui.isSheet('permissions'))details(latest,$('sheetBody'));return latest;}
function show(){const status=refresh();details(status,ui.openSheet('权限与访问授权','permissions'));}
function authorizeBrightness(){const n=ui.bridge();if(!n||typeof n.requestBrightnessAccess!=='function'){ui.toast('系统亮度授权不可用');return false;}if(n.canChangeBrightness&&n.canChangeBrightness()){ui.toast('系统亮度已授权');refresh();return true;}return n.requestBrightnessAccess()===true;}
function authorizeAlbum(){const n=ui.bridge();if(!n||typeof n.requestAlbumAccess!=='function'){ui.toast('相册全部访问不可用');return false;}if(n.albumAccess&&n.albumAccess()==='full'){ui.toast('相册全部访问已授权');refresh();return true;}return n.requestAlbumAccess()===true;}
function authorizeStorage(){const n=ui.bridge();if(!n||typeof n.requestStorageAccess!=='function'){ui.toast('所有文件授权不可用');return false;}if(n.storageGranted&&n.storageGranted()){ui.toast('所有文件访问已授权');refresh();return true;}return n.requestStorageAccess()===true;}
function openFileManager(){const n=ui.bridge();if(n&&typeof n.hasFileManagerPicker==='function'&&!n.hasFileManagerPicker()){ui.toast('设备没有可用的文件管理器选择入口');return false;}ui.closeSheet();return ui.openPicker('file');}
function init(callbacks){ui=callbacks;refresh();}
let mountedCard=null;
function mount(parent){const card=document.createElement('section');card.id='permissionCard';card.className='permission-card';card.setAttribute('aria-label','设置中的独立权限入口');mountedCard=card;parent.append(card);details(inspect(),card);} 
window.DangoPermissions={init,refresh,show,authorizeBrightness,authorizeAlbum,authorizeStorage,openFileManager,mount,onPause(){},onResume:refresh,getStatus:()=>latest};
})();
