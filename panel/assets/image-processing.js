(function(){
  'use strict';
  const blob=(canvas,type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('No se pudo convertir la imagen.')),type,quality));
  async function prepare(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Usa JPEG, PNG o WebP de hasta 5 MB.');
    const image=await createImageBitmap(file);
    try{
      if(image.width<800||image.height<800)throw new Error('La foto debe medir al menos 800 × 800 px.');
      if(image.width*image.height>40_000_000)throw new Error('La foto supera el máximo de 40 megapíxeles.');
      // Mismo lienzo para todas las fotos: la proporción del producto se conserva.
      const side=1600;
      const canvas=document.createElement('canvas');canvas.width=canvas.height=side;
      const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,side,side);
      const ratio=Math.min(side/image.width,side/image.height);
      context.drawImage(image,(side-image.width*ratio)/2,(side-image.height*ratio)/2,image.width*ratio,image.height*ratio);
      const full=await blob(canvas,'image/webp',.82);
      if(full.type!=='image/webp')throw new Error('Este navegador no puede generar WebP. Usa un navegador actualizado.');
      const thumb=document.createElement('canvas');thumb.width=thumb.height=480;thumb.getContext('2d').drawImage(canvas,0,0,480,480);
      const thumbnail=await blob(thumb,'image/webp',.82);
      let quality=.85,jpg=await blob(canvas,'image/jpeg',quality);
      while(jpg.size>300*1024){
        if(quality>.45)quality-=.1;
        else{const scaled=document.createElement('canvas');scaled.width=Math.floor(canvas.width*.8);scaled.height=Math.floor(canvas.height*.8);scaled.getContext('2d').drawImage(canvas,0,0,scaled.width,scaled.height);canvas.width=scaled.width;canvas.height=scaled.height;canvas.getContext('2d').drawImage(scaled,0,0);quality=.75;}
        jpg=await blob(canvas,'image/jpeg',quality);
      }
      return {full,thumbnail,jpg,width:side,height:side};
    }finally{image.close()}
  }
  window.BattingImages={prepare};
})();
