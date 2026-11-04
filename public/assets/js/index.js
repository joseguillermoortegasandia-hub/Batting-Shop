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

  const catGrid=qs('#categoryGrid');catGrid.replaceChildren();visibleCategories.forEach(c=>{const list=byCategory(c.slug),first=list[0],image=c.imagePath?window.BattingData.storageUrl(c.imagePath):window.BattingData.firstProductImage(first).url;const a=el('a',{class:'category-card visual-category',href:window.BattingData.categoryUrl(c.slug)});a.append(el('img',{src:image,alt:'',loading:'lazy'}),el('span',{},[el('strong',{text:c.name}),el('small',{text:`${list.length} ${list.length===1?'producto':'productos'}`})]));catGrid.append(a)});if(!catGrid.children.length)qs('#categoryBrowse').hidden=true;

  const sections=qs('#homeCategorySections');sections.replaceChildren();visibleCategories.filter(c=>c.showOnHome!==false).forEach((category,index)=>{const all=byCategory(category.slug),section=el('section',{class:`section home-category-section${index%2?' alt-section':''}`}),container=el('div',{class:'container'}),head=el('div',{class:'section-head'}),titleWrap=el('div');titleWrap.append(el('span',{class:'eyebrow',text:index===0?'PRODUCTOS DISPONIBLES':'DESCUBRE MÁS'}),el('h2',{text:category.name}),category.description?el('p',{class:'section-sub',text:category.description}):document.createTextNode(''));head.append(titleWrap,el('a',{class:'text-link',href:window.BattingData.categoryUrl(category.slug),text:'Ver todos →'}));container.append(head);
    const brands=[...new Set(all.map(p=>p.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    const grid=el('div',{class:'product-grid'});
    const render=(brand='all')=>{grid.replaceChildren();const list=all.filter(p=>brand==='all'||p.brand===brand).slice(0,category.homeLimit||8);list.forEach(p=>grid.append(productCard(p)));if(!list.length)grid.append(el('div',{class:'empty-state',text:'No hay productos de esa marca disponibles ahora mismo.'}))};
    if(brands.length>1){const chips=el('div',{class:'chips','aria-label':`Filtrar ${category.name} por marca`}),allButton=el('button',{class:'chip active',type:'button',text:'Todos'});const activate=(button,brand)=>{[...chips.children].forEach(n=>n.classList.remove('active'));button.classList.add('active');render(brand)};allButton.addEventListener('click',()=>activate(allButton,'all'));chips.append(allButton);brands.forEach(brand=>{const b=el('button',{class:'chip',type:'button',text:brand});b.addEventListener('click',()=>activate(b,brand));chips.append(b)});container.append(chips)}
    render();container.append(grid);section.append(container);sections.append(section);
  });

  const search=qs('#homeSearch');search.addEventListener('input',()=>{const q=search.value.trim(),box=qs('#searchResults');box.replaceChildren();if(window.BattingData.normalizeText(q).length<2){box.hidden=true;return}const results=catalog.filter(p=>window.BattingData.matchesSearch(p,q)).slice(0,10);if(!results.length)box.append(el('div',{class:'empty-state',text:'No encontramos productos con esa búsqueda. Prueba una marca, un color, una talla o una categoría.'}));else results.forEach(p=>box.append(productCard(p,{showTag:false})));box.hidden=false});

  const firstCategory=visibleCategories[0],hero=firstCategory?byCategory(firstCategory.slug).slice(0,2):[],visual=qs('#heroVisual');visual.replaceChildren();hero.forEach(p=>{const img=window.BattingData.firstProductImage(p);visual.append(el('a',{class:'hero-product',href:window.BattingData.productUrl(p.slug)},el('img',{src:img.url,alt:img.alt||p.name}))) });

  function showComingSoon(message){const main=qs('#main');if(!main)return;main.replaceChildren(el('section',{class:'container coming-soon-home'},[el('span',{class:'eyebrow',text:'PRÓXIMAMENTE'}),el('h1',{text:'Estamos preparando Batting Shop'}),el('p',{text:message}),el('p',{class:'section-sub',text:'Puedes escribirnos mientras terminamos de cargar el inventario real.'}),el('a',{class:'btn whatsapp',href:`https://wa.me/${window.BATTING_CONFIG.whatsappE164}?text=${encodeURIComponent('Hola, Batting Shop. Quiero información sobre los próximos productos.')}`,target:'_blank',rel:'noopener',text:'Consultar por WhatsApp'})]));const hero=qs('.desktop-hero');if(hero)hero.hidden=true;const intro=qs('.mobile-intro');if(intro)intro.hidden=true}
})();
