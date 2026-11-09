(function(){
  'use strict';
  const KEY='batting-shop-order-v4-final';
  const {el,qs,toast}=window.BattingUI;
  const fmt=p=>window.BattingData.formatPrice(p),known=p=>window.BattingData.isKnownPrice(p);
  let memoryItems=[],warnedStorage=false,lastVerifiedAt=0,lastVerifiedSignature='',validationChanged=false,validationPending=false;
  const signature=items=>JSON.stringify(items);
  const fresh=()=>Date.now()-lastVerifiedAt<120000&&lastVerifiedSignature===signature(read());

  function safeImage(value){const raw=String(value||'').trim();if(!raw)return '/assets/images/logo.webp';if(raw.startsWith('/')&&!raw.startsWith('//'))return raw;try{const u=new URL(raw,location.origin);if(u.origin===location.origin)return u.href;if(u.protocol==='https:'&&u.origin===new URL(window.BATTING_CONFIG.supabaseUrl).origin)return u.href}catch{}return '/assets/images/logo.webp'}
  function sanitizeOptions(value){return (Array.isArray(value)?value:[]).map(x=>({label:String(x?.label||'').trim(),value:String(x?.value||'').trim()})).filter(x=>x.value).slice(0,8)}
  function stockLimit(value){
    return value==null?99:Math.max(0,Math.min(99,Math.floor(Number(value)||0)));
  }
  function remaining(item,items=read()){
    let productLimit=item.maxQuantity,variantLimit=stockLimit(item.maxAvailableQuantity);
    let productUnits=0,variantUnits=0;
    for(const row of items){
      if(row.productId===item.productId){
        productUnits+=row.qty;
        productLimit=Math.min(productLimit,row.maxQuantity);
      }
      if(row.variantId===item.variantId){
        variantUnits+=row.qty;
        variantLimit=Math.min(variantLimit,row.maxAvailableQuantity);
      }
    }
    return Math.max(0,Math.min(productLimit-productUnits,variantLimit-variantUnits));
  }
  function sanitizeItem(item){if(!item||typeof item!=='object'||!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(item.variantId||''))||!/^[a-z0-9-]{1,160}$/.test(String(item.slug||'')))return null;return {productId:String(item.productId||item.slug),maxQuantity:Math.max(1,Math.min(99,Math.floor(Number(item.maxQuantity)||99))),maxAvailableQuantity:stockLimit(item.maxAvailableQuantity),variantId:String(item.variantId),slug:String(item.slug),name:String(item.name||'Producto'),options:sanitizeOptions(item.options),price:known(item.price)?Number(item.price):null,image:safeImage(item.image),qty:Math.max(1,Math.min(99,Math.floor(Number(item.qty)||1)))}}
  function cleanItems(items){
    const rows=(Array.isArray(items)?items:[]).slice(0,50).map(sanitizeItem).filter(Boolean),limits=new Map(),counts=new Map();
    for(const row of rows)limits.set(row.productId,Math.min(limits.get(row.productId)||99,row.maxQuantity));
    return rows.filter(row=>{const used=counts.get(row.productId)||0;row.maxQuantity=limits.get(row.productId);row.qty=Math.min(row.qty,row.maxAvailableQuantity,Math.max(0,row.maxQuantity-used));counts.set(row.productId,used+row.qty);return row.qty>0});
  }
  function read(){const result=window.BattingStorage.getJSON(KEY,null);if(Array.isArray(result.value)){const clean=cleanItems(result.value);memoryItems=clean;return clean}return cleanItems(memoryItems)}
  function write(items){const clean=cleanItems(items);memoryItems=clean;const persisted=window.BattingStorage.setJSON(KEY,clean);if(!persisted&&!warnedStorage){warnedStorage=true;toast('Tu navegador no permite guardar el pedido de forma permanente. Se mantendrá mientras esta pestaña siga abierta.',{kind:'warning',timeout:5000})}updateCount();document.dispatchEvent(new Event('batting:cart-change'));return clean}
  function updateCount(){const n=read().reduce((sum,item)=>sum+Math.max(0,Number(item.qty)||0),0);document.querySelectorAll('[data-cart-count]').forEach(node=>{node.textContent=String(n);node.hidden=n===0})}
  function add(item){
    const clean=sanitizeItem(item);if(!clean)return;
    const items=read(),existing=items.find(row=>row.variantId===clean.variantId);
    const available=remaining(clean,items);
    if(!available)return toast('Ya tienes el máximo disponible de este producto en tu pedido.',{kind:'info'});
    clean.qty=Math.min(clean.qty,available);
    if(existing){
      existing.maxQuantity=clean.maxQuantity;
      existing.maxAvailableQuantity=clean.maxAvailableQuantity;
      existing.qty+=clean.qty;
    }else if(items.length<50)items.push(clean);
    else return toast('El pedido admite un máximo de 50 variantes.',{kind:'warning'});
    write(items);window.BattingUI.openDrawer('#cartDrawer');render({revalidate:true});
  }
  function remove(id){write(read().filter(x=>x.variantId!==String(id)));render({revalidate:false})}
  function qty(id,delta){const items=read(),item=items.find(x=>x.variantId===String(id));if(!item)return;const others=items.filter(i=>i.productId===item.productId&&i.variantId!==item.variantId).reduce((n,i)=>n+i.qty,0);item.qty=Math.max(0,Math.min(item.maxAvailableQuantity,item.maxQuantity-others,(Number(item.qty)||0)+delta));write(items.filter(x=>x.qty>0));render({revalidate:false})}
  function optionText(item){return (item.options||[]).map(x=>`${x.label}: ${x.value}`).join(' · ')}

  async function fallbackRevalidate(items){const products=new Map();await Promise.all([...new Set(items.map(i=>i.slug))].map(async slug=>{try{products.set(slug,await window.BattingData.loadProduct(slug,{force:true}))}catch{products.set(slug,undefined)}}));const rows=[];for(const item of items){const p=products.get(item.slug);if(p===undefined){rows.push({variantId:item.variantId,unverified:true});continue}if(!p)continue;let match=null,color=null;for(const c of p.colors||[]){const v=(c.variants||[]).find(x=>String(x.id)===item.variantId);if(v){match=v;color=c;break}}if(!match)match=(p.variants||[]).find(x=>String(x.id)===item.variantId)||null;if(!match)continue;rows.push({variantId:item.variantId,productId:p.id,maxQuantity:p.maxQuantity||99,slug:p.slug,name:p.name,available:match.available,maxAvailableQuantity:match.maxAvailableQuantity,price:window.BattingData.variantPrice(p,match),imageUrl:(color?.images?.[0]||p.images?.[0]||window.BattingData.firstProductImage(p)).url,options:window.BattingData.variantOptionSummary(p,match,color)})}return rows}
  async function revalidateItems(items){lastVerifiedAt=0;validationChanged=false;if(!items.length)return[];let states;try{states=await window.BattingData.revalidateCart(items.map(i=>i.variantId))}catch(error){console.warn('RPC de carrito no disponible; usando verificación por producto.',error);states=await fallbackRevalidate(items)}if(signature(items)!==signature(read()))return revalidateItems(read());const byId=new Map(states.map(s=>[String(s.variantId),s]));const next=[];let removed=0,updated=0,unverified=0;for(const item of items){const state=byId.get(item.variantId);if(!state){removed++;continue}if(state.unverified){next.push(item);unverified++;continue}if(!state.available){removed++;continue}const refreshed=sanitizeItem({...item,productId:state.productId||item.productId,maxQuantity:state.maxQuantity||99,maxAvailableQuantity:state.maxAvailableQuantity??item.maxAvailableQuantity,slug:state.slug||item.slug,name:state.name||item.name,options:state.options||item.options,price:known(state.price)?Number(state.price):null,image:state.imageUrl||item.image});if(item.price!==refreshed.price||item.name!==refreshed.name||JSON.stringify(item.options)!==JSON.stringify(refreshed.options))updated++;next.push(refreshed)}const limited=write(next);if(signature(limited)!==signature(next))updated++;validationChanged=Boolean(removed||updated);if(!unverified){lastVerifiedAt=Date.now();lastVerifiedSignature=signature(limited)}if(removed)toast(`${removed} artículo${removed===1?' agotado o retirado':'s agotados o retirados'} se eliminó${removed===1?'':'n'} de tu pedido.`,{kind:'warning',timeout:5200});if(updated)toast('Actualizamos disponibilidad, opciones o precios de tu pedido.',{kind:'info'});if(unverified)toast('No pudimos verificar algunos artículos ahora. Confirma disponibilidad por WhatsApp antes de pagar.',{kind:'warning',timeout:5200});return limited}

  function message(items){const lines=['Hola, Batting Shop. Quiero consultar este pedido:',''];let allKnown=true,total=0;items.forEach((item,index)=>{const amount=Math.max(1,Number(item.qty)||1),linePrice=known(item.price)?Number(item.price)*amount:null;if(linePrice===null)allKnown=false;else total+=linePrice;const details=optionText(item);lines.push(`${index+1}. ${item.name}${details?` — ${details}`:''} × ${amount} — ${linePrice===null?'precio por confirmar':fmt(linePrice)}`)});lines.push('',allKnown?`Total: ${fmt(total)}`:'Total: por confirmar','','¿Me confirmas disponibilidad y opciones de entrega/envío?');return `https://wa.me/${window.BATTING_CONFIG.whatsappE164}?text=${encodeURIComponent(lines.join('\n'))}`}

  async function render({revalidate=false}={}){const root=qs('#cartItems'),totalEl=qs('#cartTotal'),send=qs('#cartWhatsapp');if(!root||!totalEl||!send)return;let items=read();if(revalidate&&items.length){validationPending=true;send.setAttribute('aria-disabled','true');try{items=await revalidateItems(items)}finally{validationPending=false}}root.replaceChildren();if(!items.length){root.append(el('div',{class:'empty-state',text:'Tu pedido está vacío. Agrega productos y luego envíalo por WhatsApp.'}));totalEl.textContent='—';send.href='#';send.setAttribute('aria-disabled','true');return}let total=0,allKnown=true;items.forEach(item=>{const row=el('div',{class:'cart-item'}),img=el('img',{src:safeImage(item.image),alt:''}),info=el('div',{class:'cart-item-info'});info.append(el('strong',{text:item.name}),el('span',{text:optionText(item)}),el('span',{text:known(item.price)?`${fmt(item.price)} c/u`:'Consultar precio'}));const actions=el('div',{class:'cart-item-actions'}),counter=el('div',{class:'qty-control'}),minus=el('button',{type:'button','aria-label':`Quitar una unidad de ${item.name}`,text:'−'}),number=el('span',{text:String(item.qty)}),plus=el('button',{type:'button','aria-label':`Agregar una unidad de ${item.name}`,text:'+'}),del=el('button',{class:'remove-item',type:'button',text:'Quitar','aria-label':`Quitar ${item.name} del pedido`});plus.disabled=remaining(item,items)===0;minus.addEventListener('click',()=>qty(item.variantId,-1));plus.addEventListener('click',()=>qty(item.variantId,1));del.addEventListener('click',()=>remove(item.variantId));counter.append(minus,number,plus);actions.append(counter,del);row.append(img,info,actions);root.append(row);if(known(item.price))total+=Number(item.price)*item.qty;else allKnown=false});totalEl.textContent=allKnown?fmt(total):'Por confirmar';send.removeAttribute('aria-disabled');send.href=message(items)}

  document.addEventListener('click',async event=>{
    const link=event.target.closest?.('#cartWhatsapp:not([aria-disabled="true"])');if(!link)return;
    if(fresh())return; // Enlace wa.me nativo: sin popup, sin await en el caso habitual.
    event.preventDefault();if(validationPending)return;validationPending=true;
    try{const before=signature(read()),items=await revalidateItems(read());await render({revalidate:false});
      if(!items.length||!fresh())return;
      if(validationChanged||before!==signature(items)){toast('Tu pedido cambió. Revisa los precios y pulsa Enviar otra vez.',{kind:'warning',timeout:6000});return}
      location.assign(message(items));
    }catch{toast('No pudimos verificar el pedido. Reintenta antes de enviarlo.',{kind:'warning'})}finally{validationPending=false}
  });
  document.addEventListener('click',event=>{if(event.target.closest?.('#cartWhatsapp[aria-disabled="true"]'))event.preventDefault()});
  window.BattingCart={add,render,read,write,updateCount,revalidateItems,remaining};document.addEventListener('DOMContentLoaded',updateCount);
})();
