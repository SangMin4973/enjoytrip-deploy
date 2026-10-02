import { loadKakaoSdk } from './kakao-sdk.js';
import { LOGIN_MAP_CONFIG } from './map-config.js';

export function initLoginScene() {
  const page=document.querySelector('.login-page'),canvas=document.querySelector('#food-canvas'),ctx=canvas.getContext('2d');
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const crops=[[76,98,370,377],[403,101,701,377],[742,139,1035,377],[1107,126,1372,378],[77,449,371,664],[421,453,710,682],[760,427,1028,704],[1091,424,1365,697],[78,754,371,1007],[444,778,661,967],[803,793,985,988]];
  const sprite=new Image();sprite.src='resources/food-login/food-reference.png';
  let width=0,height=0,bodies=[],lastTime=0,totalTime=0,recycled=0,grabbed=null,grabPointer=null,mapStatus='pending';
  const random=(min,max)=>min+Math.random()*(max-min),gravity=350;
  let active=!page.hidden,frameId=0,map=null,mapStarted=false,mapKey=LOGIN_MAP_CONFIG.appKey;
  const masks=[];
  function newBody(initial=false){
    const size=width<600?random(48,73):random(65,100),y=initial?random(-height*.2,height):random(-200,-size);
    return{x:random(size*.6,width-size*.6),y,size,vx:random(-14,14),vy:initial?Math.sqrt(Math.max(0,y)*gravity*2)+20:random(5,35),angle:random(-.65,.65),spin:random(-.2,.2),cell:Math.floor(random(0,crops.length)),holdUntil:0,held:false};
  }
  function resize(){
    const r=page.getBoundingClientRect();if(!r.width||!r.height)return;width=r.width;height=r.height;
    const scale=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);ctx.setTransform(scale,0,0,scale,0,0);ctx.imageSmoothingEnabled=false;
    bodies=Array.from({length:width<600?7:14},()=>newBody(true));grabbed=null;grabPointer=null;render();if(map)map.relayout();
  }
  function draw(body,target=ctx,overrideSize=null){
    if(!sprite.complete||!sprite.naturalWidth)return;
    const b=crops[body.cell],pad=4,sx=b[0]-pad,sy=b[1]-pad,sw=b[2]-b[0]+1+pad*2,sh=b[3]-b[1]+1+pad*2,scale=(overrideSize||body.size)/Math.max(sw,sh);
    target.save();target.translate(Math.round(body.x),Math.round(body.y));target.rotate(body.angle);target.drawImage(sprite,sx,sy,sw,sh,-sw*scale/2,-sh*scale/2,sw*scale,sh*scale);target.restore();
  }
  function render(){ctx.clearRect(0,0,width,height);bodies.forEach(body=>draw(body));}
  function buildMasks(){
    crops.forEach((b,index)=>{const pad=4,w=b[2]-b[0]+1+pad*2,h=b[3]-b[1]+1+pad*2,off=document.createElement('canvas');off.width=w;off.height=h;const c=off.getContext('2d',{willReadFrequently:true});c.drawImage(sprite,b[0]-pad,b[1]-pad,w,h,0,0,w,h);try{masks[index]={w,h,data:c.getImageData(0,0,w,h).data};}catch{masks[index]={w,h};}});
  }
  function hitBody(x,y){
    for(let i=bodies.length-1;i>=0;i--){const body=bodies[i],dx=x-body.x,dy=y-body.y,cos=Math.cos(body.angle),sin=Math.sin(body.angle),rx=dx*cos+dy*sin,ry=-dx*sin+dy*cos,b=crops[body.cell],pad=4,sw=b[2]-b[0]+1+pad*2,sh=b[3]-b[1]+1+pad*2,scale=body.size/Math.max(sw,sh),px=Math.floor(rx/scale+sw/2),py=Math.floor(ry/scale+sh/2);
      if(px<0||py<0||px>=sw||py>=sh)continue;const mask=masks[body.cell];if(!mask?.data||mask.data[(py*sw+px)*4+3]>32)return body;
    }return null;
  }
  function point(event){const r=canvas.getBoundingClientRect();return{x:(event.clientX-r.left)*width/r.width,y:(event.clientY-r.top)*height/r.height};}
  canvas.addEventListener('pointerdown',event=>{
    const p=point(event),body=hitBody(p.x,p.y);if(!body)return;
    grabbed=body;grabPointer=event.pointerId;body.held=true;body.holdUntil=totalTime+2.8;canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing';render();
  });
  canvas.addEventListener('pointermove',event=>{
    const p=point(event);
    if(grabbed&&event.pointerId===grabPointer){grabbed.x=Math.max(grabbed.size*.3,Math.min(width-grabbed.size*.3,p.x));grabbed.y=Math.max(grabbed.size*.3,Math.min(height-grabbed.size*.3,p.y));render();return;}
    canvas.style.cursor=hitBody(p.x,p.y)?'grab':'default';
  });
  function release(event){if(grabbed&&event.pointerId===grabPointer){grabbed.held=false;grabbed.holdUntil=totalTime+1.7;grabbed.vy=60;grabbed=null;grabPointer=null;canvas.style.cursor='grab';}}
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  async function loadKakaoMap(){
    if(mapStarted||!active)return;
    mapStarted=true;mapStatus='loading';
    try{
      await loadKakaoSdk(mapKey);
      const center=LOGIN_MAP_CONFIG.center;
      map=new window.kakao.maps.Map(document.querySelector('#kakao-map'),{center:new window.kakao.maps.LatLng(center.lat,center.lng),level:LOGIN_MAP_CONFIG.level,draggable:false,scrollwheel:false});
      map.setDraggable(false);map.setZoomable(false);
      window.kakao.maps.event.addListener(map,'tilesloaded',()=>{page.classList.add('kakao-ready');mapStatus='ready';});
      const started=performance.now();
      const movement=setInterval(()=>{
        if(!active||document.hidden||reducedMotion.matches||mapStatus!=='ready')return;
        const phase=(performance.now()-started)/75000*Math.PI*2;
        map.setCenter(new window.kakao.maps.LatLng(center.lat+Math.sin(phase)*.001,center.lng+Math.cos(phase)*.0015));
      },200);
      addEventListener('pagehide',()=>clearInterval(movement),{once:true});
    }catch{mapStatus='sdk-error';}
  }
  function frame(timestamp){
    if(!active){lastTime=0;return;}
    const dt=Math.min((timestamp-lastTime)/1000||0,.032);lastTime=timestamp;
    if(!document.hidden&&!reducedMotion.matches){
      totalTime+=dt;
      for(const body of bodies){
        if(body.held||body.holdUntil>totalTime)continue;
        body.vy+=gravity*dt;body.y+=body.vy*dt;body.x+=body.vx*dt;body.angle+=body.spin*dt;
        if(body.y>height+body.size){Object.assign(body,newBody());recycled++;}
        body.x=Math.max(body.size*.4,Math.min(width-body.size*.4,body.x));
      }
      render();
    }
    frameId=requestAnimationFrame(frame);
  }
  sprite.addEventListener('load',()=>{buildMasks();render();});sprite.addEventListener('error',()=>{document.querySelector('#asset-error').hidden=false;});
  reducedMotion.addEventListener('change',render);
  new ResizeObserver(resize).observe(page);resize();if(active)frameId=requestAnimationFrame(frame);
  window.matjip={get mapStatus(){return mapStatus;},get assetsLoaded(){return sprite.complete&&sprite.naturalWidth>0;},get count(){return bodies.length;},get recycled(){return recycled;},get gravity(){return gravity;},get reducedMotion(){return reducedMotion.matches;},get bodies(){return bodies.map(b=>({x:b.x,y:b.y,size:b.size,vy:b.vy,cell:b.cell,held:b.held}));}};
  return {
    configureMap(key){mapKey=key||LOGIN_MAP_CONFIG.appKey;loadKakaoMap();},
    setActive(next){
      if(active===next)return;
      active=next;cancelAnimationFrame(frameId);lastTime=0;
      if(active){resize();loadKakaoMap();frameId=requestAnimationFrame(frame);}
      else{
        if(grabbed)grabbed.held=false;
        grabbed=null;grabPointer=null;
      }
    }
  };
}
