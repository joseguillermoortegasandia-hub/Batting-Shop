(async function(){
  'use strict';
  const {qs,el,productCard,withLoader}=window.BattingUI;window.BattingUI.wireChrome();window.BattingCart.updateCount();
  const root=qs('#favoritesGrid');
  async function render(){const slugs=window.BattingFavorites.list();root.replaceChildren();if(!slugs.length){root.append(el('section',{class:'coming-soon'},[el('h2',{text:'Todavía no tienes favoritos'}),el('p',{text:'Toca el corazón de cualquier producto para guardarlo en este dispositivo.'}),el('a',{class:'btn primary',href:'/catalogo.html',text:'Explorar catálogo'})]));return}try{const promise=window.BattingData.loadCatalogBundle();const bundle=window.BattingData.catalogCacheState()==='none'?await withLoader(promise,{retry:render}):await promise;const map=new Map((bundle.products||[]).map(p=>[p.slug,p]));const products=slugs.map(s=>map.get(s)).filter(Boolean);if(!products.length){root.append(el('div',{class:'empty-state',text:'Tus favoritos ya no están disponibles en el catálogo.'}));return}products.forEach(p=>root.append(productCard(p)))}catch(error){console.error(error);root.append(el('div',{class:'empty-state',text:'No pudimos cargar tus favoritos en este momento.'}))}}
  window.addEventListener('batting:favorites-changed',render);await render();
})();
