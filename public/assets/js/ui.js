(function(){
  'use strict';

  const qs=(selector,root=document)=>root.querySelector(selector);
  const qsa=(selector,root=document)=>[...root.querySelectorAll(selector)];

  function el(tag,attrs={},children=[]){
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(attrs||{})){
      if(value===undefined||value===null||value===false)continue;
      if(key==='class')node.className=String(value);
      else if(key==='text')node.textContent=String(value);
      else if(key==='html')throw new Error('BattingUI.el no acepta HTML sin sanitizar.');
      else if(key==='dataset'&&value&&typeof value==='object')Object.entries(value).forEach(([k,v])=>{node.dataset[k]=String(v)});
      else if(key==='checked'||key==='selected'||key==='disabled'||key==='hidden')node[key]=Boolean(value);
      else if(key in node&&['value','type','placeholder','min','max','step','href','src','alt','loading','decoding','target','rel','name'].includes(key))node[key]=value;
      else node.setAttribute(key,String(value));
    }
    const list=Array.isArray(children)?children:[children];
    for(const child of list.flat(Infinity)){
      if(child===undefined||child===null||child===false)continue;
      node.append(child instanceof Node?child:document.createTextNode(String(child)));
    }
    return node;
  }

  function validHex(value){
    const raw=String(value||'').trim();
    return /^#[0-9a-f]{6}$/i.test(raw)?raw:'#cbd5e1';
  }

  function colorSwatch(hex,label='Color'){
    const wrap=el('span',{class:'color-dot','aria-hidden':'true'});
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 16 16');
    svg.setAttribute('width','15');
    svg.setAttribute('height','15');
    svg.setAttribute('focusable','false');
    const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('cx','8');circle.setAttribute('cy','8');circle.setAttribute('r','7');
    circle.setAttribute('fill',validHex(hex));circle.setAttribute('stroke','#94a3b8');circle.setAttribute('stroke-width','1');
    svg.append(circle);wrap.append(svg);wrap.title=String(label||'Color');
    return wrap;
  }

  function syncFavoriteButton(button,slug){
    if(!button)return;
    const active=Boolean(window.BattingFavorites?.has?.(slug));
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
    button.setAttribute('aria-label',`${active?'Quitar':'Agregar'} ${slug?'este producto':'producto'} ${active?'de':'a'} favoritos`);
  }

  function favoriteButton(product,{className='favorite-button'}={}){
    const button=el('button',{
      class:className,
      type:'button',
      dataset:{favoriteSlug:product.slug},
      'aria-pressed':'false',
      'aria-label':`Agregar ${product.name} a favoritos`
    },el('img',{src:'/assets/icons/heart.svg',alt:''}));
    syncFavoriteButton(button,product.slug);
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      const active=window.BattingFavorites?.toggle?.(product.slug);
      syncFavoriteButton(button,product.slug);
      toast(active?'Agregado a favoritos.':'Quitado de favoritos.');
    });
    return button;
  }

  function productCard(product,{showTag=true}={}){
    const color=window.BattingData.firstAvailableColor(product);
    const available=window.BattingData.isAvailable(product);
    const image=window.BattingData.firstProductImage(product);
    const href=window.BattingData.productUrl(product.slug,color?.name);
    const card=el('article',{class:'product-card'});
    if(showTag&&product.featured)card.append(el('span',{class:'tag',text:'DESTACADO'}));
    card.append(favoriteButton(product,{className:'favorite-button card-favorite'}));
    const link=el('a',{class:'product-card-link',href,'aria-label':`Ver ${product.name}`});
    link.addEventListener('keydown',event=>{
      if(event.key===' '){event.preventDefault();link.click()}
    });
    link.append(el('div',{class:'card-image'},el('img',{
      src:image.url,
      alt:image.alt||product.name,
      loading:'lazy',
      decoding:'async'
    })));
    const body=el('div',{class:'card-body'});
    body.append(
      el('span',{class:`status${available?'':' out'}`,text:available?'Disponible':'Agotado'}),
      el('h3',{class:'card-title',text:product.name})
    );
    const meta=[product.brand,...window.BattingData.cardAttributes(product).map(item=>item.value)].filter(Boolean).join(' · ');
    if(meta)body.append(el('div',{class:'card-meta',text:meta}));
    if((product.colors||[]).length){
      const swatches=el('div',{class:'swatches','aria-label':'Colores o diseños disponibles'});
      product.colors.slice(0,6).forEach(item=>swatches.append(colorSwatch(item.hex,window.BattingData.colorDisplay(item))));
      body.append(swatches);
    }
    body.append(el('div',{class:'price',text:window.BattingData.listingPrice(product).text}));
    link.append(body);card.append(link);
    return card;
  }

  const drawerOpeners=new Map();
  const drawerIds=['#menuDrawer','#cartDrawer','#filtersSheet','#categorySheet'];

  function focusables(root){
    return qsa('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',root)
      .filter(node=>!node.hidden&&node.getAttribute('aria-hidden')!=='true');
  }

  function syncBodyLock(){
    const locked=Boolean(qs('.drawer.open,.cart-drawer.open,.filters-sheet.open,.category-sheet.open'));
    document.body.classList.toggle('drawer-lock',locked);
  }

  function markOpenerExpanded(id,expanded){
    const target=id.replace(/^#/,'');
    qsa(`[aria-controls="${target}"]`).forEach(node=>node.setAttribute('aria-expanded',String(expanded)));
  }

  function closeDrawer(id,{restoreFocus=true}={}){
    const drawer=qs(id);
    if(!drawer||!drawer.classList.contains('open'))return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden','true');
    markOpenerExpanded(id,false);
    syncBodyLock();
    if(restoreFocus){
      const opener=drawerOpeners.get(id);
      requestAnimationFrame(()=>opener?.focus?.({preventScroll:true}));
    }
    drawerOpeners.delete(id);
  }

  function closeOtherDrawers(except){
    drawerIds.filter(id=>id!==except).forEach(id=>closeDrawer(id,{restoreFocus:false}));
  }

  function openDrawer(id,opener=document.activeElement){
    const drawer=qs(id);if(!drawer)return;
    closeOtherDrawers(id);
    if(opener?.focus)drawerOpeners.set(id,opener);
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden','false');
    markOpenerExpanded(id,true);
    syncBodyLock();
    requestAnimationFrame(()=>focusables(drawer)[0]?.focus({preventScroll:true}));
  }

  function closeAllDrawers(){
    drawerIds.forEach(id=>closeDrawer(id,{restoreFocus:false}));
    syncBodyLock();
  }

  function loadError(root,message='No pudimos cargar el catálogo.'){if(!root)return;root.replaceChildren(el('section',{class:'empty-state load-error'},[el('h1',{text:'No pudimos cargar el catálogo'}),el('p',{text:message}),el('button',{class:'btn primary',type:'button',text:'Reintentar'}),el('a',{class:'btn whatsapp',href:`https://wa.me/${window.BATTING_CONFIG.whatsappE164}`,text:'Escríbenos por WhatsApp'})]));root.querySelector('button').addEventListener('click',()=>location.reload())}

  function toast(message,{kind='info',timeout=3200}={}){
    let region=qs('#toastRegion');
    if(!region){
      region=el('div',{id:'toastRegion',class:'toast-region','aria-live':'polite','aria-atomic':'true'});
      document.body.append(region);
    }
    const item=el('div',{class:`toast toast-${kind}`,role:'status',text:message});
    region.append(item);
    setTimeout(()=>item.remove(),timeout);
  }

  let loaderToken=0;
  let loaderShownAt=0;
  function loaderNodes(){return{root:qs('#globalLoader'),state:qs('#loaderState'),error:qs('#loaderError'),retry:qs('#loaderRetry')}}

  function showLoader(){
    const {root,state,error}=loaderNodes();if(!root)return;
    state.hidden=false;error.hidden=true;root.classList.remove('leaving');root.hidden=false;root.setAttribute('aria-hidden','false');loaderShownAt=performance.now();
  }

  async function hideLoader(token){
    if(token!==loaderToken)return;
    const {root}=loaderNodes();if(!root||root.hidden)return;
    const elapsed=performance.now()-loaderShownAt;
    if(elapsed<400)await new Promise(resolve=>setTimeout(resolve,400-elapsed));
    if(token!==loaderToken)return;
    root.classList.add('leaving');
    await new Promise(resolve=>setTimeout(resolve,180));
    if(token!==loaderToken)return;
    root.hidden=true;root.classList.remove('leaving');root.setAttribute('aria-hidden','true');
  }

  function showLoaderError(retry){
    const {root,state,error,retry:button}=loaderNodes();if(!root)return;
    root.classList.remove('leaving');root.hidden=false;root.setAttribute('aria-hidden','false');state.hidden=true;error.hidden=false;
    if(button){
      button.hidden=!retry;
      button.onclick=retry?()=>{
        root.hidden=true;root.setAttribute('aria-hidden','true');
        Promise.resolve(retry()).catch(console.error);
      }:null;
    }
  }

  async function withLoader(promise,{retry=null}={}){
    const token=++loaderToken;
    let settled=false;
    const threshold=setTimeout(()=>{if(!settled&&token===loaderToken)showLoader()},350);
    let timeoutId;
    const timeoutPromise=new Promise((_,reject)=>{
      timeoutId=setTimeout(()=>reject(new Error('La carga tardó demasiado.')),12000);
    });
    try{
      const result=await Promise.race([Promise.resolve(promise),timeoutPromise]);
      settled=true;clearTimeout(threshold);clearTimeout(timeoutId);await hideLoader(token);return result;
    }catch(error){
      settled=true;clearTimeout(threshold);clearTimeout(timeoutId);
      if(token===loaderToken)showLoaderError(retry||(()=>location.reload()));
      throw error;
    }
  }

  let whatsappContext=null;
  function setWhatsappContext(context){whatsappContext=context||null;refreshFloatingWhatsapp()}
  function refreshFloatingWhatsapp(){
    const node=qs('#floatingWhatsapp'),cfg=window.BATTING_CONFIG||{};
    if(!node||!cfg.whatsappE164)return;
    let text='Hola, Batting Shop. Quiero información.';
    if(whatsappContext?.product){
      const pieces=[
        whatsappContext.product,
        whatsappContext.color?`color ${whatsappContext.color}`:'',
        whatsappContext.size?`talla ${whatsappContext.size}`:'',
        ...(whatsappContext.options||[]).map(option=>`${option.label}: ${option.value}`)
      ].filter(Boolean);
      text=`Hola, Batting Shop. Quiero información sobre ${pieces.join(', ')}.`;
    }
    node.href=`https://wa.me/${cfg.whatsappE164}?text=${encodeURIComponent(text)}`;
  }

  async function renderCategorySheet(){
    const root=qs('#mobileCategoryList');if(!root)return;
    root.replaceChildren(el('div',{class:'sheet-loading',text:'Cargando categorías…'}));
    try{
      const hasCache=window.BattingData.catalogCacheState()!=='none';
      const promise=window.BattingData.loadCatalogBundle();
      const bundle=hasCache?await promise:await withLoader(promise,{retry:renderCategorySheet});
      const counts=new Map((bundle.categories||[]).map(category=>[
        category.slug,
        (bundle.products||[]).filter(product=>window.BattingData.categorySlug(product)===category.slug).length
      ]));
      root.replaceChildren();
      for(const category of bundle.categories||[]){
        const count=counts.get(category.slug)||0;
        if(count<1)continue;
        root.append(el('a',{class:'category-sheet-link',href:window.BattingData.categoryUrl(category.slug)},[
          el('strong',{text:category.name}),
          el('span',{text:`${count} ${count===1?'producto':'productos'}`})
        ]));
      }
      if(!root.children.length)root.append(el('div',{class:'empty-state',text:'Las categorías aparecerán cuando publiquemos el inventario.'}));
    }catch(error){
      console.error(error);
      root.replaceChildren(el('div',{class:'empty-state',text:'No pudimos cargar las categorías. Intenta de nuevo.'}));
    }
  }

  function syncMobileNav(){
    const map={home:'home',catalog:'categories',favorites:'favorites',sizes:'sizes'};
    const current=map[document.body.dataset.page||''];
    qsa('[data-mobile-nav]').forEach(node=>{
      if(node.dataset.mobileNav===current)node.setAttribute('aria-current','page');
      else node.removeAttribute('aria-current');
    });
  }

  let chromeWired=false;
  function wireChrome(){
    if(chromeWired)return;chromeWired=true;
    qsa('[data-open-menu]').forEach(button=>{
      button.setAttribute('aria-controls','menuDrawer');button.setAttribute('aria-expanded','false');
      button.addEventListener('click',()=>openDrawer('#menuDrawer',button));
    });
    qsa('[data-close-menu]').forEach(button=>button.addEventListener('click',()=>closeDrawer('#menuDrawer')));
    qsa('[data-open-cart]').forEach(button=>{
      button.setAttribute('aria-controls','cartDrawer');button.setAttribute('aria-expanded','false');
      button.addEventListener('click',async()=>{
        await window.BattingCart?.render?.({revalidate:true});
        openDrawer('#cartDrawer',button);
      });
    });
    qsa('[data-close-cart]').forEach(button=>button.addEventListener('click',()=>closeDrawer('#cartDrawer')));
    qsa('[data-open-categories]').forEach(button=>{
      button.setAttribute('aria-controls','categorySheet');button.setAttribute('aria-expanded','false');
      button.addEventListener('click',async()=>{await renderCategorySheet();openDrawer('#categorySheet',button)});
    });
    qsa('[data-close-categories]').forEach(button=>button.addEventListener('click',()=>closeDrawer('#categorySheet')));
    qsa('.drawer-backdrop').forEach(backdrop=>backdrop.addEventListener('click',closeAllDrawers));
    document.addEventListener('keydown',event=>{
      const open=qs('.drawer.open,.cart-drawer.open,.filters-sheet.open,.category-sheet.open');
      if(event.key==='Escape'&&open){closeDrawer(`#${open.id}`);return}
      if(event.key!=='Tab'||!open)return;
      const items=focusables(open);if(!items.length)return;
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    });
    window.addEventListener('batting:favorites-changed',()=>{
      qsa('.favorite-button[data-favorite-slug]').forEach(button=>syncFavoriteButton(button,button.dataset.favoriteSlug));
      const count=window.BattingFavorites?.count?.()||0;
      qsa('[data-favorite-count]').forEach(node=>{node.textContent=String(count);node.hidden=count===0});
    });
    const productCta=qs('#addOrder');
    if(productCta&&'IntersectionObserver' in window){
      const observer=new IntersectionObserver(entries=>{
        document.body.classList.toggle('product-cta-visible',Boolean(entries[0]?.isIntersecting));
      },{threshold:.2});
      observer.observe(productCta);
    }
    syncMobileNav();refreshFloatingWhatsapp();
  }

  window.BattingUI={
    qs,qsa,el,loadError,colorSwatch,productCard,favoriteButton,syncFavoriteButton,
    openDrawer,closeDrawer,wireChrome,toast,withLoader,setWhatsappContext,
    refreshFloatingWhatsapp,renderCategorySheet
  };
})();
