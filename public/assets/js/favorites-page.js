(async function(){
  'use strict';
  const {qs,el,productCard,colorListings,withLoader}=window.BattingUI;
  window.BattingUI.wireChrome();window.BattingCart.updateCount();
  const root=qs('#favoritesGrid');let version=0;
  async function render(){
    const current=++version;
    root.replaceChildren();
    if(!window.BattingFavorites.count()){
      root.append(el('section',{class:'coming-soon'},[el('h2',{text:'Todavía no tienes favoritos'}),el('p',{text:'Toca el corazón del color que te guste para guardarlo en este dispositivo.'}),el('a',{class:'btn primary',href:'/catalogo.html',text:'Explorar catálogo'})]));return;
    }
    try{
      const promise=window.BattingData.loadCatalogBundle();
      const bundle=window.BattingData.catalogCacheState()==='none'?await withLoader(promise,{retry:render}):await promise;
      if(current!==version)return;
      window.BattingFavorites.resolve(bundle.products||[]);
      const listings=colorListings(bundle.products||[]);
      const products=window.BattingFavorites.entries().map(entry=>listings.find(product=>product.slug===entry.slug&&(product.listingColor?.id||null)===entry.colorId)).filter(Boolean);
      if(!products.length){root.append(el('div',{class:'empty-state',text:'Tus colores favoritos ya no están disponibles en el catálogo.'}));return;}
      const fragment=document.createDocumentFragment();
      products.forEach((product,index)=>fragment.append(productCard(product,{priority:index<2})));
      root.replaceChildren(fragment);
    }catch(error){if(current!==version)return;console.error(error);root.append(el('div',{class:'empty-state',text:'No pudimos cargar tus favoritos en este momento.'}));}
  }
  window.addEventListener('batting:favorites-changed',render);await render();
})();
