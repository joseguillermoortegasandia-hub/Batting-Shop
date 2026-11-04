(function(){
  'use strict';
  const cfg=window.BATTING_CONFIG||{};
  const CATALOG_KEY='batting-shop-public-catalog-v5';
  const PRODUCT_PREFIX='batting-shop-public-product-v5:';
  const CACHE_FRESH_MS=60_000,CACHE_STALE_MS=120_000;
  let inFlight=null;

  function validConfigValue(value){const text=String(value||'').trim();return Boolean(text&&!/^__.+__$/.test(text))}
  function configured(){return Boolean(cfg.useSupabase&&validConfigValue(cfg.supabaseUrl)&&validConfigValue(cfg.supabaseAnonKey))}
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  async function rpc(name,args={}){
    if(!configured())throw new Error('El catálogo todavía no está conectado.');
    for(let attempt=0;attempt<2;attempt++){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
      try{const response=await fetch(`${cfg.supabaseUrl.replace(/\/+$/,'')}/rest/v1/rpc/${name}`,{
        method:'POST',signal:controller.signal,headers:{apikey:cfg.supabaseAnonKey,...(cfg.supabaseAnonKey.startsWith('eyJ')?{Authorization:`Bearer ${cfg.supabaseAnonKey}`}:{ }),'Content-Type':'application/json'},body:JSON.stringify(args)
      });if(!response.ok){const error=new Error('No pudimos cargar los datos.');error.retryable=response.status>=500||response.status===429;throw error}return {data:await response.json(),error:null};
      }catch(error){if(attempt||error.retryable===false)throw error}finally{clearTimeout(timer)}
    }
  }
  function getClient(){return configured()?{rpc}:null}
  function normalizeText(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
  function storageUrl(path){const value=String(path||'').trim();if(!value)return '/assets/images/logo.webp';if(value.startsWith('/')&&!value.startsWith('//'))return value;if(value.startsWith('//'))return '/assets/images/logo.webp';if(!configured())return '/assets/images/logo.webp';return `${String(cfg.supabaseUrl).replace(/\/+$/,'')}/storage/v1/object/public/product-images/${value.split('/').map(encodeURIComponent).join('/')}`}
  function normalizeImage(image){return {...image,url:storageUrl(image?.storagePath),thumbnailUrl:storageUrl(image?.thumbnailPath||image?.storagePath)}}
  function optionSort(options){return (Array.isArray(options)?options:[]).slice().sort((a,b)=>(Number(a?.sort_order)||0)-(Number(b?.sort_order)||0)||String(a?.label||a?.value||'').localeCompare(String(b?.label||b?.value||''),'es',{numeric:true}))}
  function normalizeCategory(c){return {...c,sortOrder:Number(c?.sortOrder)||0,homeLimit:Number(c?.homeLimit)||8,searchKeywords:Array.isArray(c?.searchKeywords)?c.searchKeywords:[],attributes:(Array.isArray(c?.attributes)?c.attributes:[]).map(a=>({...a,sortOrder:Number(a?.sortOrder)||0,options:optionSort(a?.options)})).sort((a,b)=>a.sortOrder-b.sortOrder||String(a.label).localeCompare(String(b.label),'es'))}}
  function normalizeColor(c){return {...c,label:String(c?.label||c?.displayName||c?.name||''),sortOrder:Number(c?.sortOrder)||0,images:(Array.isArray(c?.images)?c.images:[]).map(normalizeImage),variants:(Array.isArray(c?.variants)?c.variants:[]).map(normalizeVariant)}}
  function normalizeVariant(v){return {...v,available:Boolean(v?.available),sizeSortOrder:Number(v?.sizeSortOrder)||500,sortOrder:Number(v?.sortOrder)||0,attributes:v?.attributes&&typeof v.attributes==='object'?v.attributes:{}}}
  function normalizeProduct(product){if(!product||typeof product!=='object')return null;return {...product,category:product.category?normalizeCategory(product.category):null,attributes:product.attributes&&typeof product.attributes==='object'?product.attributes:{},colors:(Array.isArray(product.colors)?product.colors:[]).map(normalizeColor).sort((a,b)=>a.sortOrder-b.sortOrder||a.label.localeCompare(b.label,'es')),variants:(Array.isArray(product.variants)?product.variants:[]).map(normalizeVariant),images:(Array.isArray(product.images)?product.images:[]).map(normalizeImage)}}
  function normalizeBundle(raw){const categories=(Array.isArray(raw?.categories)?raw.categories:[]).map(normalizeCategory).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,'es'));const products=(Array.isArray(raw?.products)?raw.products:[]).map(p=>normalizeProduct({...p,category:p.category||categories.find(c=>c.id===p.category_id)})).filter(Boolean);return {categories,products}}

  function cacheGet(key){const result=window.BattingStorage?.getJSON(key,null,{kind:'session'});return result?.value||null}
  function cacheSet(key,data){window.BattingStorage?.setJSON(key,{savedAt:Date.now(),data},{kind:'session'})}
  function cacheState(key){const parsed=cacheGet(key);if(!parsed||!Number.isFinite(parsed.savedAt)||!parsed.data)return 'none';const age=Date.now()-parsed.savedAt;return age<=CACHE_FRESH_MS?'fresh':age<=CACHE_STALE_MS?'stale':'expired'}
  function cacheRead(key){const parsed=cacheGet(key);if(!parsed||!Number.isFinite(parsed.savedAt)||!parsed.data)return null;return {age:Date.now()-parsed.savedAt,data:parsed.data}}

  async function fetchCatalog(){const sb=getClient();if(!sb)throw new Error('Supabase no está configurado.');const {data,error}=await sb.rpc('get_public_catalog');if(error)throw error;const bundle=normalizeBundle(data||{});cacheSet(CATALOG_KEY,bundle);return bundle}
  async function refreshCatalog(){if(!inFlight)inFlight=fetchCatalog().finally(()=>{inFlight=null});return inFlight}
  async function loadCatalogBundle({force=false}={}){if(!configured())throw new Error('El catálogo todavía no está conectado.');if(!force){const cached=cacheRead(CATALOG_KEY);if(cached&&cached.age<=CACHE_STALE_MS){const bundle=normalizeBundle(cached.data);if(cached.age>CACHE_FRESH_MS)refreshCatalog().catch(e=>console.warn('No se pudo refrescar el catálogo.',e));return {...bundle,fromCache:true}}}const data=await refreshCatalog();return {...data,fromCache:false}}
  function catalogCacheState(){return cacheState(CATALOG_KEY)}

  async function loadProduct(slug,{force=false}={}){const clean=String(slug||'').trim();if(!/^[a-z0-9-]{1,160}$/.test(clean))throw new Error('Slug de producto inválido.');const key=`${PRODUCT_PREFIX}${clean}`;if(!force){const cached=cacheRead(key);if(cached&&cached.age<=CACHE_STALE_MS)return normalizeProduct(cached.data)}const sb=getClient();if(!sb)throw new Error('Supabase no está configurado.');const {data,error}=await sb.rpc('get_public_product',{p_slug:clean});if(error)throw error;const product=data?normalizeProduct(data):null;if(product){cacheSet(key,product);if(product.slug!==clean)cacheSet(`${PRODUCT_PREFIX}${product.slug}`,product)}return product}
  function productCacheState(slug){return cacheState(`${PRODUCT_PREFIX}${String(slug||'').trim()}`)}
  async function loadRelated(productId,limit=4){const sb=getClient();if(!sb||!productId)return[];if(!UUID.test(productId))throw new Error('Producto inválido.');const {data,error}=await sb.rpc('get_related_products',{p_product_id:productId,p_limit:Math.max(0,Math.min(Number(limit)||4,12))});if(error)throw error;return (Array.isArray(data)?data:[]).map(normalizeProduct).filter(Boolean)}
  async function revalidateCart(variantIds){const ids=[...new Set((variantIds||[]).map(String).filter(Boolean))];if(ids.length>50)throw new Error('El pedido admite un máximo de 50 ids.');if(ids.some(id=>!UUID.test(id)))throw new Error('El pedido contiene identificadores inválidos.');if(!ids.length)return[];const sb=getClient();if(!sb)throw new Error('Supabase no está configurado.');const {data,error}=await sb.rpc('get_public_cart_state',{p_variant_ids:ids});if(error)throw error;return (Array.isArray(data)?data:[]).map(row=>({...row,imageUrl:storageUrl(row.imagePath)}))}

  function categorySlug(product){return product?.category?.slug||''}
  function categoryName(product){return product?.category?.name||''}
  function allVariants(product){return [...(product?.variants||[]),...(product?.colors||[]).flatMap(c=>c.variants||[])]}
  function isAvailable(product){return allVariants(product).some(v=>v.available)}
  function firstAvailableColor(product){return product?.colors?.find(c=>(c.variants||[]).some(v=>v.available))||product?.colors?.[0]||null}
  function firstProductImage(product){const color=firstAvailableColor(product);return color?.images?.[0]||product?.images?.[0]||{url:'/assets/images/logo.webp',alt:product?.name||'Batting Shop'}}
  function isKnownPrice(price){if(price===null||price===undefined||price==='')return false;const n=Number(price);return Number.isFinite(n)&&n>0}
  function formatPrice(price){if(!isKnownPrice(price))return 'Consultar precio';return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(price))}
  function variantPrice(product,variant){return isKnownPrice(variant?.salePrice)?Number(variant.salePrice):(isKnownPrice(product?.price)?Number(product.price):null)}
  function listingPrice(product){const prices=allVariants(product).filter(v=>v.available).map(v=>variantPrice(product,v)).filter(isKnownPrice).map(Number);if(!prices.length)return {text:formatPrice(product?.price),min:isKnownPrice(product?.price)?Number(product.price):null,varies:false};const unique=[...new Set(prices.map(v=>v.toFixed(2)))],min=Math.min(...prices);return {text:unique.length>1?`Desde ${formatPrice(min)}`:formatPrice(min),min,varies:unique.length>1}}
  function colorDisplay(colorOrName){if(colorOrName&&typeof colorOrName==='object')return String(colorOrName.label||colorOrName.name||'');return String(colorOrName||'').replace(/\//g,' / ')}
  function productUrl(slug,color){const path=`/producto/${encodeURIComponent(String(slug||''))}/`;const base=location.origin&&location.origin!=='null'?location.origin:(validConfigValue(cfg.siteUrl)?cfg.siteUrl:'https://batting-shop.invalid');const u=new URL(path,base);if(color)u.searchParams.set('color',String(color));return `${u.pathname}${u.search}`}
  function categoryUrl(slug){return `/catalogo.html?categoria=${encodeURIComponent(String(slug||''))}`}
  function flattenAttributeValues(value){if(Array.isArray(value))return value.flatMap(flattenAttributeValues);if(value&&typeof value==='object')return Object.values(value).flatMap(flattenAttributeValues);return value===null||value===undefined?[]:[String(value)]}
  function categoryAttribute(category,key){return category?.attributes?.find(a=>a.key===key)||null}
  function productAttribute(product,key){const v=product?.attributes?.[key];return v===undefined||v===null?'':v}
  function optionLabel(attr,value){if(value===null||value===undefined||value==='')return'';const option=(attr?.options||[]).find(o=>String(o?.value??o?.label??'')===String(value));const base=String(option?.label??value);return attr?.unit?`${base} ${attr.unit}`:base}
  function attributeDisplayValue(category,key,value){const attr=categoryAttribute(category,key);if(Array.isArray(value))return value.map(v=>optionLabel(attr,v)).join(', ');return optionLabel(attr,value)}
  function variantOptionSummary(product,variant,color){const out=[];if(color)out.push({label:'Color',value:colorDisplay(color)});if(variant?.sizeLabel&&variant?.normalizedSize!=='ONE')out.push({label:product?.category?.optionLabel||'Talla',value:String(variant.sizeLabel)});for(const attr of product?.category?.attributes||[]){if(attr.scope!=='variant')continue;const value=variant?.attributes?.[attr.key];if(value===undefined||value===null||value==='')continue;out.push({label:attr.label,value:attributeDisplayValue(product.category,attr.key,value)})}return out}
  function cardAttributes(product){return (product?.category?.attributes||[]).filter(a=>a.scope==='product'&&a.showInCard).map(a=>({label:a.label,value:attributeDisplayValue(product.category,a.key,product?.attributes?.[a.key])})).filter(x=>x.value)}
  function searchText(product){const colors=(product.colors||[]).flatMap(c=>[c.name,c.label]);const sizes=allVariants(product).flatMap(v=>[v.sizeLabel,v.normalizedSize,...flattenAttributeValues(v.attributes)]);const attrs=flattenAttributeValues(product.attributes);const categoryTerms=[categorySlug(product),categoryName(product),...(product.category?.searchKeywords||[])];return normalizeText([product.name,product.brand,product.description,...colors,...sizes,...attrs,...categoryTerms].filter(Boolean).join(' '))}
  function matchesSearch(product,query){const q=normalizeText(query);if(!q)return true;const haystack=searchText(product);return q.split(/\s+/).every(token=>haystack.includes(token))}
  function categoryBySlug(categories,slug){return (categories||[]).find(c=>c.slug===slug)||null}

  window.BattingData={configured,getClient,loadCatalogBundle,loadProduct,loadRelated,revalidateCart,catalogCacheState,productCacheState,normalizeText,matchesSearch,searchText,storageUrl,productUrl,categoryUrl,isKnownPrice,formatPrice,variantPrice,listingPrice,firstAvailableColor,firstProductImage,isAvailable,allVariants,categorySlug,categoryName,categoryBySlug,categoryAttribute,productAttribute,attributeDisplayValue,variantOptionSummary,cardAttributes,colorDisplay};
})();
