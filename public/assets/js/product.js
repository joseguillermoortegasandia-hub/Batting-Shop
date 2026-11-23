(async function(){
  'use strict';
  const {qs,el,productCard,colorSwatch,withLoader}=window.BattingUI;
  window.BattingUI.wireChrome();window.BattingCart.updateCount();
  const legacyParams=new URLSearchParams(location.search);
  function slugFromLocation(){const parts=location.pathname.split('/').filter(Boolean);if(parts[0]==='producto'&&parts[1]){try{return decodeURIComponent(parts[1])}catch{return parts[1]}}return legacyParams.get('slug')||''}
  const requestedSlug=slugFromLocation();if(!requestedSlug){showError('Este producto no está disponible.');return}
  let p;
  try{const promise=window.BattingData.loadProduct(requestedSlug);p=window.BattingData.productCacheState(requestedSlug)==='none'?await withLoader(promise,{retry:()=>location.reload()}):await promise}catch(error){console.error(error);showError('No pudimos cargar este producto en este momento.');return}
  if(!p){showError('Este producto no está disponible.');return}
  const currentParams=new URLSearchParams(location.search),requestedColor=currentParams.get('color');
  if(requestedSlug!==p.slug||location.pathname!==`/producto/${encodeURIComponent(p.slug)}/`){const u=new URL(window.BattingData.productUrl(p.slug,requestedColor),location.origin);history.replaceState({},'',u.pathname+u.search)}
  document.title=`${p.name} | Batting Shop`;qs('#breadcrumbProduct').textContent=p.name;qs('#productName').textContent=p.name;const cardAttrs=window.BattingData.cardAttributes(p).map(x=>x.value);qs('#productBrand').textContent=[p.brand,...cardAttrs].filter(Boolean).join(' · ');qs('#productDescription').textContent=p.description||'Consulta disponibilidad y detalles por WhatsApp.';
  const favorite=qs('#favoriteProduct');if(favorite){favorite.dataset.favoriteSlug=p.slug;window.BattingUI.syncFavoriteButton(favorite,p.slug);favorite.addEventListener('click',()=>{window.BattingFavorites.toggle(p.slug);window.BattingUI.syncFavoriteButton(favorite,p.slug)})}

  let color=(p.colors||[]).find(c=>window.BattingData.normalizeText(c.name)===window.BattingData.normalizeText(requestedColor))||(p.colors||[]).find(c=>(c.variants||[]).some(v=>v.available))||(p.colors||[])[0]||null;
  let variant=null,selectedSize='',selectedAttrs={};
  const variantAttrs=(p.category?.attributes||[]).filter(a=>a.scope==='variant');
  function activeVariants(){return color?(color.variants||[]):(p.variants||[])}
  function firstAvailable(){return activeVariants().find(v=>v.available)||null}
  function syncSelectionFromVariant(v){variant=v||null;selectedSize=v?.normalizedSize||v?.sizeLabel||'';selectedAttrs={};variantAttrs.forEach(a=>{const value=v?.attributes?.[a.key];if(value!==undefined&&value!==null&&value!=='')selectedAttrs[a.key]=String(value)})}
  syncSelectionFromVariant(firstAvailable());
  function matchingVariants({size=selectedSize,attrs=selectedAttrs}={}){return activeVariants().filter(v=>v.available).filter(v=>!size||String(v.normalizedSize||v.sizeLabel||'')===String(size)).filter(v=>Object.entries(attrs||{}).every(([key,value])=>!value||String(v.attributes?.[key]??'')===String(value)))}
  function currentPrice(){return window.BattingData.variantPrice(p,variant)}

  function selectColor(next){const previousSize=selectedSize;color=next;syncSelectionFromVariant(activeVariants().find(v=>v.available&&String(v.normalizedSize||v.sizeLabel||'')===String(previousSize))||firstAvailable())}
  function renderColorOptions(){const root=qs('#colorOptions'),wrap=qs('#colorOptionWrap');root.replaceChildren();if(!(p.colors||[]).length){wrap.hidden=true;return}wrap.hidden=false;p.colors.forEach(c=>{const available=(c.variants||[]).some(v=>v.available),label=window.BattingData.colorDisplay(c),button=el('button',{class:`color-option${c.id===color?.id?' active':''}${available?'':' out'}`,type:'button','aria-pressed':String(c.id===color?.id),'aria-label':`${label}${available?' disponible':' agotado'}`});button.append(colorSwatch(c.hex,label),el('span',{text:label}));button.addEventListener('click',()=>{selectColor(c);const u=new URL(location.href);u.searchParams.set('color',c.name);history.replaceState({},'',u.pathname+u.search);renderAll()});root.append(button)})}
  function renderSizes(){const root=qs('#sizeOptions'),wrap=qs('#sizeOptionWrap');root.replaceChildren();const variants=activeVariants().filter(v=>v.sizeLabel).slice().sort((a,b)=>(a.sizeSortOrder||500)-(b.sizeSortOrder||500)||(a.sortOrder||0)-(b.sortOrder||0));const unique=[];const seen=new Set();variants.forEach(v=>{const key=String(v.normalizedSize||v.sizeLabel);if(!seen.has(key)){seen.add(key);unique.push({key,label:v.sizeLabel,order:v.sizeSortOrder})}});const meaningful=unique.filter(x=>x.key!=='ONE'&&x.label!=='Talla única');if(!meaningful.length){wrap.hidden=true;return}wrap.hidden=false;meaningful.forEach(item=>{const candidates=activeVariants().filter(v=>String(v.normalizedSize||v.sizeLabel||'')===item.key&&v.available),button=el('button',{class:`size-option${String(selectedSize)===item.key?' active':''}`,type:'button',disabled:!candidates.length,text:item.label,'aria-label':`${item.label}${candidates.length?' disponible':' agotado'}`});button.addEventListener('click',()=>{const exact=matchingVariants({size:item.key,attrs:selectedAttrs})[0]||candidates[0];syncSelectionFromVariant(exact);renderAll()});root.append(button)})}
  function renderVariantAttributes(){const root=qs('#variantAttributeOptions');root.replaceChildren();for(const attr of variantAttrs){const values=[];for(const v of activeVariants().filter(v=>v.available)){const raw=v.attributes?.[attr.key];if(raw!==undefined&&raw!==null&&raw!==''&&!values.some(x=>String(x)===String(raw)))values.push(raw)}if(!values.length)continue;const wrap=el('div',{class:'variant-attribute-group'}),label=el('div',{class:'option-label',text:attr.label}),buttons=el('div',{class:'size-options'});const ordered=(attr.options||[]).map(o=>o.value??o.label).filter(v=>values.some(x=>String(x)===String(v)));values.forEach(v=>{if(!ordered.some(x=>String(x)===String(v)))ordered.push(v)});ordered.forEach(value=>{const matches=activeVariants().filter(v=>v.available&&String(v.attributes?.[attr.key]??'')===String(value)),display=window.BattingData.attributeDisplayValue(p.category,attr.key,value)||String(value),button=el('button',{class:`size-option${String(selectedAttrs[attr.key]??'')===String(value)?' active':''}`,type:'button',disabled:!matches.length,text:display});button.addEventListener('click',()=>{const attrs={...selectedAttrs,[attr.key]:String(value)},exact=matchingVariants({size:selectedSize,attrs})[0]||matches[0];syncSelectionFromVariant(exact);renderAll()});buttons.append(button)});wrap.append(label,buttons);root.append(wrap)}}
  let galleryKey;
  function renderGallery(){const main=qs('#mainProductImage'),images=color?.images?.length?color.images:(p.images||[]),first=images[0]||window.BattingData.firstProductImage(p);const key=JSON.stringify([color?.id,images.map(image=>image.url)]);if(key===galleryKey)return;galleryKey=key;main.src=first?.url||'/assets/images/logo.webp';main.alt=first?.alt||`${p.name}${color?` ${window.BattingData.colorDisplay(color)}`:''}`;const thumbs=qs('#thumbs');thumbs.replaceChildren();images.forEach((image,index)=>{const button=el('button',{class:`thumb${index===0?' active':''}`,type:'button','aria-label':`Ver imagen ${index+1} de ${p.name}`},el('img',{src:image.thumbnailUrl||image.url,alt:image.alt||'',loading:'lazy'}));button.addEventListener('click',()=>{main.src=image.url;main.alt=image.alt||p.name;[...thumbs.children].forEach(x=>x.classList.remove('active'));button.classList.add('active')});thumbs.append(button)})}
  function renderAttributes(){const root=qs('#productAttributes'),details=qs('#productAttributesDetails');root.replaceChildren();for(const attr of (p.category?.attributes||[]).filter(a=>a.scope==='product')){const raw=p.attributes?.[attr.key];if(raw===undefined||raw===null||raw==='')continue;const value=window.BattingData.attributeDisplayValue(p.category,attr.key,raw);if(!value)continue;root.append(el('dt',{text:attr.label}),el('dd',{text:value}))}details.hidden=!root.children.length}
  function updateAvailability(){const any=activeVariants().some(v=>v.available),status=qs('#productStatus');status.className=`status${any?'':' out'}`;status.textContent=any?'Disponible':'Agotado';if(!variant||!variant.available)syncSelectionFromVariant(firstAvailable());qs('#addOrder').disabled=!variant;qs('#waSingle').classList.toggle('disabled',!variant);qs('#waSingle').setAttribute('aria-disabled',String(!variant));qs('#productPrice').textContent=window.BattingData.formatPrice(currentPrice());syncQuantity()}
  function updateLinks(){const link=qs('#waSingle');if(!variant||!availableQuantity()){link.href='#';window.BattingUI.setWhatsappContext({product:p.name,color:color?window.BattingData.colorDisplay(color):''});return}const price=currentPrice(),priceText=window.BattingData.isKnownPrice(price)?window.BattingData.formatPrice(price):'por confirmar',options=window.BattingData.variantOptionSummary(p,variant,color);const optionText=options.map(x=>`${x.label}: ${x.value}`).join(', '),msg=`Hola, Batting Shop. Estoy interesado en ${p.name}${optionText?`, ${optionText}`:''}. Cantidad: ${selectedQuantity()}. Precio por unidad: ${priceText}. ¿Está disponible?`;link.href=`https://wa.me/${window.BATTING_CONFIG.whatsappE164}?text=${encodeURIComponent(msg)}`;window.BattingUI.setWhatsappContext({product:p.name,color:color?window.BattingData.colorDisplay(color):'',size:variant.sizeLabel&&variant.normalizedSize!=='ONE'?variant.sizeLabel:'',options:options.filter(x=>!['Color',p.category?.optionLabel||'Talla'].includes(x.label))})}
  function renderSameModel(){const root=qs('#sameModel'),section=qs('#sameModelSection');root.replaceChildren();const others=(p.colors||[]).filter(c=>c.id!==color?.id);section.hidden=others.length===0;others.forEach(c=>{const available=(c.variants||[]).some(v=>v.available),label=window.BattingData.colorDisplay(c),button=el('button',{class:`color-option${available?'':' out'}`,type:'button','aria-label':`${label}${available?' disponible':' agotado'}`});button.append(colorSwatch(c.hex,label),el('span',{text:label}));button.addEventListener('click',()=>{selectColor(c);const u=new URL(location.href);u.searchParams.set('color',c.name);history.replaceState({},'',u.pathname+u.search);renderAll();scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})});root.append(button)})}
  function renderAll(){renderColorOptions();renderSizes();renderVariantAttributes();renderGallery();renderSameModel();renderAttributes();qs('#selectedColor').textContent=color?window.BattingData.colorDisplay(color):'';updateAvailability()}
  const quantityInput=qs('#productQuantity'),maxQuantity=Math.max(1,Math.min(99,Number(p.maxQuantity)||99));
  const currentOrderOption=()=>({variantId:variant?.id,productId:p.id,maxQuantity,maxAvailableQuantity:variant?.maxAvailableQuantity??99});
  const availableQuantity=()=>variant?window.BattingCart.remaining(currentOrderOption()):0;
  const selectedQuantity=()=>Math.min(availableQuantity(),Math.max(1,Math.floor(Number(quantityInput.value)||1)));
  function syncQuantity(){
    const available=availableQuantity(),quantity=selectedQuantity();
    quantityInput.min=available?'1':'0';
    quantityInput.max=String(available);
    quantityInput.value=String(quantity);
    quantityInput.disabled=!available;
    qs('#quantityMinus').disabled=quantity<=1;
    qs('#quantityPlus').disabled=quantity>=available;
    qs('#addOrder').disabled=!available;
    qs('#waSingle').classList.toggle('disabled',!available);
    qs('#waSingle').setAttribute('aria-disabled',String(!available));
    qs('#quantityHint').textContent=available
      ? `Puedes agregar hasta ${available} ${available===1?'unidad':'unidades'}.`
      : variant?'Ya tienes el máximo disponible en tu pedido.':'Esta opción está agotada.';
    updateLinks();
  }
  qs('#quantityMinus').addEventListener('click',()=>{quantityInput.value=String(selectedQuantity()-1);syncQuantity()});
  qs('#quantityPlus').addEventListener('click',()=>{quantityInput.value=String(selectedQuantity()+1);syncQuantity()});
  quantityInput.addEventListener('change',syncQuantity);
  document.addEventListener('batting:cart-change',syncQuantity);
  qs('#addOrder').addEventListener('click',()=>{
    const qty=selectedQuantity();if(!qty)return;
    const photo=color?.images?.[0]||p.images?.[0]||window.BattingData.firstProductImage(p);
    window.BattingCart.add({...currentOrderOption(),qty,slug:p.slug,name:p.name,options:window.BattingData.variantOptionSummary(p,variant,color),price:currentPrice(),image:photo.thumbnailUrl||photo.url});
  });
  qs('#waSingle').addEventListener('click',event=>{if(!availableQuantity())event.preventDefault()});
  qs('#copyLink').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);window.BattingUI.toast('Enlace copiado.')}catch{window.BattingUI.toast('Copia la URL desde la barra del navegador.',{kind:'warning'})}});

  const hasSizes=window.BattingData.allVariants(p).some(option=>option.sizeLabel&&option.normalizedSize!=='ONE'&&option.sizeLabel.toLowerCase()!=='talla única');
  const isBattingGlove=window.BattingData.categorySlug(p)==='guantines'||p.category?.aliases?.includes('guantines');
  if(isBattingGlove&&hasSizes)window.BattingSizeGuides.load().then(guides=>{
    const brand=window.BattingSizeGuides.findBrand(guides,p.brand);
    if(!brand)return;
    qs('#productGuideTitle').textContent=`Guía de tallas ${brand}`;
    window.BattingSizeGuides.render(guides[brand],qs('#productGuideContent'));
    qs('#productSizeGuide').hidden=false;
  }).catch(error=>console.warn('No se pudo cargar la guía de tallas.',error));
  renderAll();
  qs('.product-layout').hidden=false;
  qs('.product-details').hidden=false;
  const relatedGrid=qs('#relatedGrid');
  try{
    const related=await window.BattingData.loadRelated(p.id,10);
    relatedGrid.replaceChildren();
    for(const item of related)relatedGrid.append(productCard(item));
    if(related.length)wireRelatedControls();
    else relatedGrid.append(el('div',{class:'empty-state',text:'No hay productos relacionados disponibles ahora mismo.'}));
  }catch(error){
    console.warn('No se pudieron cargar relacionados.',error);
    relatedGrid.replaceChildren(el('div',{class:'empty-state',text:'Los productos relacionados no están disponibles ahora mismo.'}));
  }

  function wireRelatedControls(){
    const previous=qs('#relatedPrev'),next=qs('#relatedNext'),controls=qs('#relatedControls');
    const sync=()=>{
      const end=relatedGrid.scrollWidth-relatedGrid.clientWidth;
      controls.hidden=end<=1;
      previous.disabled=relatedGrid.scrollLeft<=1;
      next.disabled=relatedGrid.scrollLeft>=end-1;
    };
    function scroll(direction){
      const step=relatedGrid.firstElementChild.getBoundingClientRect().width+parseFloat(getComputedStyle(relatedGrid).columnGap);
      relatedGrid.scrollBy({left:direction*step,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    }
    previous.addEventListener('click',()=>scroll(-1));
    next.addEventListener('click',()=>scroll(1));
    relatedGrid.addEventListener('scroll',sync,{passive:true});
    new ResizeObserver(sync).observe(relatedGrid);
    sync();
  }
  function showError(message){document.title='Producto no disponible | Batting Shop';const root=qs('#productRoot');if(root)root.replaceChildren(el('section',{class:'coming-soon'},[el('h1',{text:'Producto no disponible'}),el('p',{text:message}),el('a',{class:'btn primary',href:'/catalogo.html',text:'Volver al catálogo'})]))}
})();
