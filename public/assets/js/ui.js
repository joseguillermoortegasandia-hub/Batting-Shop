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

  function syncFavoriteButton(button,slug,colorId=button?.dataset.favoriteColorId||null){
    if(!button)return;
    const active=Boolean(window.BattingFavorites?.has?.(slug,colorId));
    button.classList.toggle('active',active);
    const icon=button.querySelector('img');if(icon)icon.src=active?'/assets/icons/heart-filled.svg':'/assets/icons/heart.svg';
    button.setAttribute('aria-pressed',String(active));
    button.setAttribute('aria-label',`${active?'Quitar':'Agregar'} ${button.dataset.favoriteLabel||(colorId?'este color':'este producto')} ${active?'de':'a'} favoritos`);
  }

  function favoriteButton(product,{className='favorite-button',color=null}={}){
    const button=el('button',{
      class:className,
      type:'button',
      dataset:{favoriteSlug:product.slug,favoriteColorId:color?.id||'',favoriteLabel:product.name+(color?' · '+window.BattingData.colorDisplay(color):'')},
      'aria-pressed':'false',
      'aria-label':`Agregar ${product.name} a favoritos`
    },el('img',{src:'/assets/icons/heart.svg',alt:''}));
    syncFavoriteButton(button,product.slug);
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      const active=window.BattingFavorites?.toggle?.(product.slug,button.dataset.favoriteColorId||null);
      syncFavoriteButton(button,product.slug);
      toast(active?'Color agregado a favoritos.':'Quitado de favoritos.');
    });
    return button;
  }

  const listingCache=new WeakMap();
  function colorListings(products){
    window.BattingFavorites?.resolve?.(products);
    return products.flatMap(product=>{
      if(product.listingColor||!product.colors?.length)return [product];
      if(!listingCache.has(product))listingCache.set(product,product.colors.map(color=>({...product,modelFeatured:product.featured,featured:colorIsFeatured(product,color),listingColor:color,cardColors:product.colors,colors:[color],variants:[]})));
      return listingCache.get(product);
    });
  }
  function colorIsFeatured(product,color){
    if(typeof color?.featured==='boolean')return color.featured;
    return Boolean((product.modelFeatured??product.featured)&&color?.id===(product.cardColors?.find(item=>window.BattingData.isAvailable({...product,colors:[item],variants:[]}))||product.cardColors?.[0]||window.BattingData.firstAvailableColor(product))?.id);
  }
  function homeListings(products,limit=8){
    const groups=products.map(product=>colorListings([product]).slice().sort((a,b)=>Number(Boolean(b.featured))-Number(Boolean(a.featured))));
    const highlighted=groups.flatMap(group=>group.filter(item=>item.featured));
    const primary=groups.filter(group=>!group.some(item=>item.featured)).map(group=>group[0]).filter(Boolean);
    const required=[...highlighted,...primary];
    const selected=new Set(required);
    const extra=groups.flat().filter(item=>!selected.has(item));
    return [...required,...extra].slice(0,Math.max(required.length,limit));
  }
  function setProductImage(photo,image,{detail=false,alt,sizes}={}){
    const srcset=detail?image.srcset:image.thumbnailSrcset;
    photo.sizes=sizes||(detail?'(min-width:1024px) 470px, (min-width:760px) 310px, 90vw':'(max-width:599px) calc((100vw - 50px)/2), 280px');
    if(srcset)photo.srcset=srcset;else photo.removeAttribute('srcset');
    photo.src=(detail?image.detailUrl||image.url:image.thumbnailUrl||image.url)||'/assets/images/logo.webp';
    if(alt!==undefined)photo.alt=alt;
  }
  function productCard(product,{priority=false}={}){
    const color=product.listingColor||window.BattingData.firstAvailableColor(product);
    const colors=product.cardColors||product.colors||[];
    const available=window.BattingData.isAvailable(product);
    const image=window.BattingData.firstProductImage(product);
    const href=window.BattingData.productUrl(product.slug,color?.name);
    const card=el('article',{class:'product-card'});
    const featuredTag=el('span',{class:'tag',text:'DESTACADO'});featuredTag.hidden=!(color?colorIsFeatured(product,color):product.featured);card.append(featuredTag);
    card.dataset.productSlug=product.slug;card.dataset.colorId=color?.id||'';
    const favorite=favoriteButton(product,{className:'favorite-button card-favorite',color});
    card.append(favorite);
    const link=el('a',{class:'product-card-link',href,'aria-label':`Ver ${product.name}`});
    link.addEventListener('keydown',event=>{
      if(event.key===' '){event.preventDefault();link.click()}
    });
    const photo=el('img',{
      width:image.width||1000,height:image.height||1000,
      alt:image.alt||product.name,
      loading:priority?'eager':'lazy',
      fetchpriority:priority?'high':'auto',
      decoding:'async'
    });
    setProductImage(photo,image,{alt:image.alt||product.name});
    link.append(el('div',{class:'card-image'},photo));
    const preview=colors.length>1?previewCardColors(card,photo,{...product,colors},image):null;
    const body=el('div',{class:'card-body'});
    const titleLink=el('a',{class:'card-title-link',href,text:product.name});
    const price=el('div',{class:'price',text:window.BattingData.listingPrice(product).text});
    const status=el('span',{class:`status${available?'':' out'}`,text:available?'Disponible':'Agotado'});
    const colorName=el('div',{class:'card-color-name',text:color?window.BattingData.colorDisplay(color):''});
    body.append(
      status,
      el('h3',{class:'card-title'},titleLink)
    );
    const meta=[product.brand,...window.BattingData.cardAttributes(product).map(item=>item.value)].filter(Boolean).join(' · ');
    if(meta)body.append(el('div',{class:'card-meta',text:meta}));
    if(color)body.append(colorName);
    if(colors.length){
      const swatches=el('div',{class:'swatches','aria-label':`Colores de ${product.name}`});
      colors.forEach(item=>{
        const name=window.BattingData.colorDisplay(item),inStock=(item.variants||[]).some(variant=>variant.available);
        const button=el('button',{class:'card-color',type:'button',disabled:!inStock,'aria-label':`Ver color ${name}${inStock?'':' (agotado)'}`,'aria-pressed':String(item.id===color?.id),title:name},colorSwatch(item.hex,name));
        button.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation();
          const selected=item.images?.[0]||image;
          preview?.select(selected);
          setProductImage(photo,selected,{alt:selected.alt||`${product.name} · ${name}`});
          colorName.textContent=name;card.dataset.colorId=item.id;
          featuredTag.hidden=!colorIsFeatured(product,item);
          status.className=`status${inStock?'':' out'}`;status.textContent=inStock?'Disponible':'Agotado';
          favorite.dataset.favoriteColorId=item.id;favorite.dataset.favoriteLabel=product.name+' · '+name;syncFavoriteButton(favorite,product.slug);
          link.href=titleLink.href=window.BattingData.productUrl(product.slug,item.name);
          price.textContent=window.BattingData.listingPrice({...product,colors:[item],variants:[]}).text;
          [...swatches.children].forEach(node=>node.setAttribute('aria-pressed',String(node===button)));
        });
        swatches.append(button);
      });
      body.append(swatches);
    }
    body.append(price);
    body.addEventListener('click',event=>{if(!event.target.closest('button,a'))link.click()});
    card.append(link,body);
    return card;
  }

  function previewCardColors(card,photo,product,cover){
    let originalImage=cover;
    let originalSrc=cover.thumbnailUrl||cover.url;
    let originalAlt=photo.alt;
    const seen=new Set();
    const photos=[];
    for(const color of product.colors){
      const image=color.images?.[0];
      const src=image?.thumbnailUrl||image?.url;
      if(!src||seen.has(src))continue;
      seen.add(src);
      photos.push({src,image,alt:image.alt||`${product.name} · ${window.BattingData.colorDisplay(color)}`});
    }
    if(photos.length<2)return;
    let coverIndex=photos.findIndex(image=>image.src===originalSrc);

    const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    let timer;
    let run=0;
    function stop(){
      run++;
      clearTimeout(timer);
      if(photo.getAttribute('src')!==originalSrc)setProductImage(photo,originalImage);
      photo.alt=originalAlt;
    }
    card.addEventListener('pointerenter',event=>{
      if(event.pointerType==='touch'||reducedMotion.matches)return;
      const currentRun=++run;
      let nextIndex=(coverIndex+1)%photos.length;
      async function advance(){
        if(currentRun!==run||!card.isConnected)return;
        if(document.hidden||reducedMotion.matches){stop();return;}
        const next=photos[nextIndex];
        nextIndex=(nextIndex+1)%photos.length;
        const preview=new Image();
        preview.sizes=photo.sizes;
        if(next.image.thumbnailSrcset)preview.srcset=next.image.thumbnailSrcset;
        preview.src=next.src;
        try{
          await preview.decode();
          if(currentRun!==run||!card.isConnected)return;
          setProductImage(photo,next.image);
          photo.alt=next.alt;
        }catch{
          // A missing preview leaves the current photo visible.
        }
        if(currentRun===run&&card.isConnected)timer=setTimeout(advance,1200);
      }
      timer=setTimeout(advance,650);
    });
    card.addEventListener('pointerleave',stop);
    card.addEventListener('pointercancel',stop);
    return {select(image){stop();originalImage=image;originalSrc=image.thumbnailUrl||image.url;originalAlt=image.alt||product.name;coverIndex=photos.findIndex(photo=>photo.src===originalSrc)}};
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

  async function withLoader(promise,{retry=null,delay=350,showError=true}={}){
    const token=++loaderToken;
    if(delay===0)showLoader();
    const threshold=delay>0?setTimeout(()=>{if(token===loaderToken)showLoader()},delay):null;
    let timeoutId;
    const timeoutPromise=new Promise((_,reject)=>{
      timeoutId=setTimeout(()=>reject(new Error('La carga tardó demasiado.')),12000);
    });
    try{
      const result=await Promise.race([Promise.resolve(promise),timeoutPromise]);
      clearTimeout(threshold);clearTimeout(timeoutId);await hideLoader(token);return result;
    }catch(error){
      clearTimeout(threshold);clearTimeout(timeoutId);
      if(showError){
        if(token===loaderToken)showLoaderError(retry||(()=>location.reload()));
      }else{
        await hideLoader(token);
      }
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
        openDrawer('#cartDrawer',button);
        await window.BattingCart?.render?.({revalidate:true});
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
    qs,qsa,el,loadError,colorSwatch,colorListings,homeListings,setProductImage,productCard,favoriteButton,syncFavoriteButton,
    openDrawer,closeDrawer,wireChrome,toast,withLoader,setWhatsappContext,
    refreshFloatingWhatsapp,renderCategorySheet
  };
})();
