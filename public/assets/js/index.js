(async function(){
  'use strict';
  const {qs,el,productCard,withLoader}=window.BattingUI;
  window.BattingUI.wireChrome();window.BattingCart.updateCount();
  let bundle;
  try{const promise=window.BattingData.loadCatalogBundle();bundle=window.BattingData.catalogCacheState()==='none'?await withLoader(promise,{retry:()=>location.reload()}):await promise}catch(error){console.error(error);window.BattingUI.loadError(qs('#main'),'El catálogo no está disponible. Reintenta o escríbenos por WhatsApp.');return}
  const catalog=bundle.products||[],categories=bundle.categories||[];
  if(!catalog.length){showComingSoon('Estamos preparando la primera selección de Batting Shop. Muy pronto podrás consultar productos, tallas y disponibilidad desde aquí.');return}
  const byCategory=slug=>catalog.filter(p=>window.BattingData.categorySlug(p)===slug);
  const visibleCategories=categories.filter(c=>byCategory(c.slug).length>0);

  const catGrid=qs('#categoryGrid');catGrid.replaceChildren();visibleCategories.forEach(c=>{const list=byCategory(c.slug),first=list[0],image=c.imagePath?window.BattingData.storageUrl(c.imagePath):(window.BattingData.firstProductImage(first).thumbnailUrl||window.BattingData.firstProductImage(first).url);const a=el('a',{class:'category-card visual-category',href:window.BattingData.categoryUrl(c.slug)});a.append(el('img',{src:image,alt:'',loading:'lazy'}),el('span',{},[el('strong',{text:c.name}),el('small',{text:`${list.length} ${list.length===1?'producto':'productos'}`})]));catGrid.append(a)});if(!catGrid.children.length)qs('#categoryBrowse').hidden=true;

  const sections=qs('#homeCategorySections');sections.replaceChildren();visibleCategories.filter(c=>c.showOnHome!==false).forEach((category,index)=>{const all=byCategory(category.slug),section=el('section',{class:`section home-category-section${index%2?' alt-section':''}`}),container=el('div',{class:'container'}),head=el('div',{class:'section-head'}),titleWrap=el('div');titleWrap.append(el('span',{class:'eyebrow',text:index===0?'PRODUCTOS DISPONIBLES':'DESCUBRE MÁS'}),el('h2',{text:category.name}),category.description?el('p',{class:'section-sub',text:category.description}):document.createTextNode(''));head.append(titleWrap,el('a',{class:'text-link',href:window.BattingData.categoryUrl(category.slug),text:'Ver todos →'}));container.append(head);
    const brands=[...new Set(all.map(p=>p.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    const grid=el('div',{class:'product-grid'});
    const render=(brand='all')=>{grid.replaceChildren();const list=all.filter(p=>brand==='all'||p.brand===brand).slice(0,category.homeLimit||8);list.forEach(p=>grid.append(productCard(p)));if(!list.length)grid.append(el('div',{class:'empty-state',text:'No hay productos de esa marca disponibles ahora mismo.'}))};
    if(brands.length>1){const chips=el('div',{class:'chips','aria-label':`Filtrar ${category.name} por marca`}),allButton=el('button',{class:'chip active',type:'button',text:'Todos'});const activate=(button,brand)=>{[...chips.children].forEach(n=>n.classList.remove('active'));button.classList.add('active');render(brand)};allButton.addEventListener('click',()=>activate(allButton,'all'));chips.append(allButton);brands.forEach(brand=>{const b=el('button',{class:'chip',type:'button',text:brand});b.addEventListener('click',()=>activate(b,brand));chips.append(b)});container.append(chips)}
    render();container.append(grid);section.append(container);sections.append(section);
  });

  const search=qs('#homeSearch');search.addEventListener('input',()=>{const q=search.value.trim(),box=qs('#searchResults');box.replaceChildren();if(window.BattingData.normalizeText(q).length<2){box.hidden=true;return}const results=catalog.filter(p=>window.BattingData.matchesSearch(p,q)).slice(0,10);if(!results.length)box.append(el('div',{class:'empty-state',text:'No encontramos productos con esa búsqueda. Prueba una marca, un color, una talla o una categoría.'}));else results.forEach(p=>box.append(productCard(p,{showTag:false})));box.hidden=false});

  renderCover(catalog.filter(product=>product.showOnCover));
  function renderCover(products){
    const visual=qs('#heroVisual');
    if(!products.length){
      visual.replaceChildren(el('img',{class:'hero-brand',src:'/assets/images/logo.webp',alt:'Batting Shop',width:500,height:500}));
      return;
    }
    const photo=el('img',{width:480,height:480,decoding:'async',fetchpriority:'high'});
    const link=el('a',{class:'hero-product cover-float'},photo);
    const control=el('button',{class:'cover-control',type:'button',text:'Pausar',hidden:products.length<2});
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    let index=0,paused=motion.matches,hovered=false,focused=false;
    function show(){
      const product=products[index],image=window.BattingData.firstProductImage(product);
      link.href=window.BattingData.productUrl(product.slug);
      link.setAttribute('aria-label',`Ver ${product.name}`);
      photo.alt=product.name;
      photo.src=image.thumbnailUrl||image.url;
    }
    function syncPause(){
      control.textContent=paused?'Reproducir':'Pausar';
      visual.classList.toggle('cover-paused',paused||hovered||focused);
    }
    control.addEventListener('click',()=>{paused=!paused;syncPause()});
    link.addEventListener('pointerenter',()=>{hovered=true;syncPause()});
    link.addEventListener('pointerleave',()=>{hovered=false;syncPause()});
    link.addEventListener('focus',()=>{focused=true;syncPause()});
    link.addEventListener('blur',()=>{focused=false;syncPause()});
    visual.replaceChildren(link,control);
    show();syncPause();
    if(products.length>1)setInterval(()=>{
      if(paused||hovered||focused||document.hidden||!visual.getClientRects().length)return;
      index=(index+1)%products.length;
      photo.fetchPriority='auto';
      show();
    },3000);
  }

  function showComingSoon(message){
    // Mantener el diseño visible aunque el propietario aún no publique productos.
    const root=qs('#homeCategorySections');if(!root)return;
    root.replaceChildren(el('section',{class:'section container coming-soon-home'},[
      el('span',{class:'eyebrow',text:'PRÓXIMAMENTE'}),el('h2',{text:'Estamos preparando Batting Shop'}),
      el('p',{text:message}),el('a',{class:'btn whatsapp',href:`https://wa.me/${window.BATTING_CONFIG.whatsappE164}`,text:'Consultar por WhatsApp'})]));
    qs('#categoryBrowse').hidden=true;
    const search=qs('#homeSearch');search.disabled=true;search.placeholder='Todavía no hay productos publicados';
    const visual=qs('#heroVisual');visual.replaceChildren(el('img',{class:'hero-brand',src:'/assets/images/logo.webp',alt:'Batting Shop',width:500,height:500,fetchpriority:'high'}));
  }
})();
