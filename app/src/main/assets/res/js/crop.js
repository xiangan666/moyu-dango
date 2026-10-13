/* 全屏裁剪几何：与预览和 JPEG 导出共用同一组边界。 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DangoCropMath=api;})(typeof window!=='undefined'?window:this,function(){
'use strict';
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function angle(value){return ((Math.round((Number(value)||0)/90)*90)%360+360)%360;}
function dimensions(width,height,rotation){return angle(rotation)%180?{width:height,height:width}:{width,height};}
function rectangle(width,height,ratio,state){
 if(!(width>0&&height>0&&ratio>0))throw new Error('照片或屏幕尺寸无效');
 const zoom=clamp(Number(state&&state.zoom)||1,1,6);
 const cropWidth=Math.min(width,height*ratio)/zoom,cropHeight=cropWidth/ratio;
 const rawX=Number(state&&state.cx),rawY=Number(state&&state.cy);
 const cx=clamp(Number.isFinite(rawX)?rawX:.5,cropWidth/(2*width),1-cropWidth/(2*width));
 const cy=clamp(Number.isFinite(rawY)?rawY:.5,cropHeight/(2*height),1-cropHeight/(2*height));
 return {x:cx*width-cropWidth/2,y:cy*height-cropHeight/2,width:cropWidth,height:cropHeight,cx,cy,zoom};
}
function pan(width,height,ratio,state,dx,dy,viewWidth,viewHeight){
 const r=rectangle(width,height,ratio,state);
 return rectangle(width,height,ratio,{zoom:r.zoom,cx:r.cx-dx*r.width/(viewWidth*width),cy:r.cy-dy*r.height/(viewHeight*height)});
}
function anchoredZoom(width,height,ratio,state,newZoom,anchorX,anchorY,newAnchorX,newAnchorY){
 const r=rectangle(width,height,ratio,state),next=rectangle(width,height,ratio,{zoom:newZoom,cx:r.cx,cy:r.cy});
 const nx=newAnchorX===undefined?anchorX:newAnchorX,ny=newAnchorY===undefined?anchorY:newAnchorY;
 const x=r.x+anchorX*r.width,y=r.y+anchorY*r.height;
 return rectangle(width,height,ratio,{zoom:next.zoom,cx:(x-(nx-.5)*next.width)/width,cy:(y-(ny-.5)*next.height)/height});
}
function outputSize(rect,ratio,maxSide,maxPixels){
 const scale=Math.min(1,(maxSide||4096)/Math.max(rect.width,rect.height),Math.sqrt((maxPixels||12000000)/(rect.width*rect.height)));
 return {width:Math.max(1,Math.round(rect.width*scale)),height:Math.max(1,Math.round(rect.height*scale))};
}
return {clamp,angle,dimensions,rectangle,pan,anchoredZoom,outputSize};
});
