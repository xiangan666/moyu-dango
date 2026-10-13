/* 保留导入原图；全屏比例裁剪预览、拖动、双指缩放与无损导出。 */
(function(){
'use strict';
const M=window.DangoCropMath,$=id=>document.getElementById(id);
let editing=null;
const points=new Map();let drag=null,pinch=null;
function native(){return window.DangoNative||null;}
function screenSize(){
 try{const n=native();if(n&&typeof n.screenInfo==='function'){const s=JSON.parse(n.screenInfo());if(s.width>0&&s.height>0)return s;}}catch(e){}
 const scale=window.devicePixelRatio||1;return {width:Math.round((window.screen.width||window.innerWidth)*scale),height:Math.round((window.screen.height||window.innerHeight)*scale)};
}
function update(){
 if(!editing)return;
 const e=editing,d=M.dimensions(e.image.naturalWidth,e.image.naturalHeight,e.rotation),stage=$('cropStage');
 e.rect=M.rectangle(d.width,d.height,e.ratio,e);
 e.cx=e.rect.cx;e.cy=e.rect.cy;e.zoom=e.rect.zoom;
 const b=stage.getBoundingClientRect(),scale=b.width/e.rect.width;
 const image=$('cropImage');
 image.style.width=e.image.naturalWidth*scale+'px';image.style.height=e.image.naturalHeight*scale+'px';
 image.style.left=(d.width/2-e.rect.x)*scale+'px';image.style.top=(d.height/2-e.rect.y)*scale+'px';
 image.style.transform='translate(-50%,-50%) rotate('+e.rotation+'deg)';
 $('cropZoom').value=e.zoom;$('cropZoomValue').textContent=e.zoom.toFixed(1)+'×';
 const out=M.outputSize(e.rect,e.ratio,Math.max(4096,Math.max(e.screen.width,e.screen.height)*1.3),12000000);
 $('cropResolution').textContent=out.width+' × '+out.height+' · PNG 无损';
 $('cropQualityNote').textContent=e.rect.width<e.screen.width||e.rect.height<e.screen.height?'当前区域像素低于屏幕分辨率；减少放大可以保留更多细节。':'保存原图，裁剪结果无损导出；之后仍可重新构图。';
}
function fitStage(){if(!editing)return;const maxW=Math.min(window.innerWidth-52,470),maxH=Math.max(140,window.innerHeight-292);const width=Math.min(maxW,maxH*editing.ratio);$('cropStage').style.width=width+'px';$('cropStage').style.height=(width/editing.ratio)+'px';update();}
async function open(data,options){
 if(editing)cancel();
 const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('这张图片格式暂不支持，可以选择 JPG 或 PNG'));i.src=data;});
 if(!image.naturalWidth||!image.naturalHeight)throw new Error('图片无法读取');
 const screen=screenSize(),saved=options&&options.crop||{};
 return new Promise(resolve=>{
  editing={data,image,screen,ratio:screen.width/screen.height,cx:Number.isFinite(saved.cx)?saved.cx:.5,cy:Number.isFinite(saved.cy)?saved.cy:.5,zoom:saved.zoom||1,rotation:M.angle(saved.rotation),resolve};
  $('cropImage').src=data;$('cropper').hidden=false;document.body.classList.add('crop-active');
  $('cropRatioLabel').textContent=screen.width+' : '+screen.height+' · 适配本机全屏';
  $('cropSaveButton').disabled=false;$('cropSaveButton').textContent='裁好啦，保存这张';fitStage();
 });
}
function finish(result){const e=editing;if(!e)return;editing=null;points.clear();drag=null;pinch=null;$('cropper').hidden=true;$('cropImage').removeAttribute('src');document.body.classList.remove('crop-active');e.resolve(result);}
function cancel(){finish(null);}
function save(){
 if(!editing)return;const e=editing;$('cropSaveButton').disabled=true;$('cropSaveButton').textContent='正在保存高清裁剪…';
 setTimeout(()=>{
  try{
   if(editing!==e)return;
   const r=e.rect,d=M.dimensions(e.image.naturalWidth,e.image.naturalHeight,e.rotation);
   const out=M.outputSize(r,e.ratio,Math.max(4096,Math.max(e.screen.width,e.screen.height)*1.3),12000000);
   const canvas=document.createElement('canvas');canvas.width=out.width;canvas.height=out.height;
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法创建高清裁剪画布');
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   ctx.scale(out.width/r.width,out.height/r.height);ctx.translate(-r.x,-r.y);
   ctx.translate(d.width/2,d.height/2);ctx.rotate(e.rotation*Math.PI/180);
   ctx.drawImage(e.image,-e.image.naturalWidth/2,-e.image.naturalHeight/2);
   const data=canvas.toDataURL('image/png');canvas.width=1;canvas.height=1;
   if(!data.startsWith('data:image/png;'))throw new Error('高清裁剪导出失败');
   finish({data,width:out.width,height:out.height,crop:{cx:r.cx,cy:r.cy,zoom:r.zoom,rotation:e.rotation,ratio:e.ratio},screen:e.screen});
  }catch(err){$('cropSaveButton').disabled=false;$('cropSaveButton').textContent='裁好啦，保存这张';$('cropQualityNote').textContent=err.message||'保存失败，请调整后重试';}
 },30);
}
function state(){return {cx:editing.cx,cy:editing.cy,zoom:editing.zoom};}
function assign(r){editing.cx=r.cx;editing.cy=r.cy;editing.zoom=r.zoom;update();}
function geometry(){return M.dimensions(editing.image.naturalWidth,editing.image.naturalHeight,editing.rotation);}
const stage=$('cropStage');
function resetGesture(){
 if(!editing)return;const values=Array.from(points.values()),b=stage.getBoundingClientRect();
 if(values.length>=2){const [a,c]=values;pinch={distance:Math.hypot(c.x-a.x,c.y-a.y),x:(a.x+c.x)/2,y:(a.y+c.y)/2,state:state(),box:b};drag=null;}
 else if(values.length===1){drag={x:values[0].x,y:values[0].y,state:state(),box:b};pinch=null;}
 else{drag=null;pinch=null;}
}
function moveGesture(){
 if(!editing)return;const d=geometry(),v=Array.from(points.values());
 if(pinch&&v.length>=2){const [a,c]=v,dist=Math.hypot(c.x-a.x,c.y-a.y),b=pinch.box;if(pinch.distance<1)return;
 assign(M.anchoredZoom(d.width,d.height,editing.ratio,pinch.state,pinch.state.zoom*dist/pinch.distance,(pinch.x-b.left)/b.width,(pinch.y-b.top)/b.height,((a.x+c.x)/2-b.left)/b.width,((a.y+c.y)/2-b.top)/b.height));}
 else if(drag&&v.length===1)assign(M.pan(d.width,d.height,editing.ratio,drag.state,v[0].x-drag.x,v[0].y-drag.y,drag.box.width,drag.box.height));
}
if(window.PointerEvent){
 stage.addEventListener('pointerdown',e=>{if(!editing)return;e.preventDefault();stage.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});resetGesture();});
 stage.addEventListener('pointermove',e=>{if(!points.has(e.pointerId))return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});moveGesture();});
 ['pointerup','pointercancel'].forEach(type=>stage.addEventListener(type,e=>{points.delete(e.pointerId);resetGesture();}));
}else{
 stage.addEventListener('touchstart',e=>{e.preventDefault();points.clear();Array.from(e.touches).forEach(t=>points.set(t.identifier,{x:t.clientX,y:t.clientY}));resetGesture();},{passive:false});
 stage.addEventListener('touchmove',e=>{e.preventDefault();points.clear();Array.from(e.touches).forEach(t=>points.set(t.identifier,{x:t.clientX,y:t.clientY}));moveGesture();},{passive:false});
 ['touchend','touchcancel'].forEach(type=>stage.addEventListener(type,e=>{points.clear();Array.from(e.touches).forEach(t=>points.set(t.identifier,{x:t.clientX,y:t.clientY}));resetGesture();}));
}
$('cropZoom').addEventListener('input',()=>{if(!editing)return;editing.zoom=Number($('cropZoom').value);update();});
$('cropRotateButton').onclick=()=>{if(!editing)return;editing.rotation=M.angle(editing.rotation+90);editing.cx=.5;editing.cy=.5;editing.zoom=1;fitStage();};
$('cropResetButton').onclick=()=>{if(!editing)return;editing.cx=.5;editing.cy=.5;editing.zoom=1;editing.rotation=0;fitStage();};
$('cropCancelButton').onclick=cancel;$('cropSaveButton').onclick=save;stage.addEventListener('contextmenu',e=>e.preventDefault());window.addEventListener('resize',fitStage);
window.DangoCropper={open,cancel,isOpen:()=>!!editing};
})();
