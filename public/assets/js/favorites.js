(function(){
  'use strict';
  const KEY='batting-shop-favorites-v2',LEGACY_KEY='batting-shop-favorites-v1';
  let warned=false;
  function clean(values){const seen=new Set();return (Array.isArray(values)?values:[]).map(value=>typeof value==='string'?{slug:value,colorId:null}:value).filter(value=>value&&/^[a-z0-9-]{1,160}$/.test(String(value.slug||''))).map(value=>({slug:String(value.slug),colorId:value.colorId?String(value.colorId):null})).filter(value=>{const key=value.slug+'|'+value.colorId;if(seen.has(key))return false;seen.add(key);return true})}
  function entries(){const current=window.BattingStorage.getJSON(KEY,null).value;return clean(current===null?window.BattingStorage.getJSON(LEGACY_KEY,[]).value:current)}
  function list(){return entries().map(value=>value.slug)}
  function save(values,{notify=true}={}){const valuesClean=clean(values);const persisted=window.BattingStorage.setJSON(KEY,valuesClean);if(!persisted&&!warned){warned=true;window.BattingUI?.toast?.('Tus favoritos se mantendrán mientras esta pestaña siga abierta.',{kind:'warning',timeout:4600})}if(notify)window.dispatchEvent(new CustomEvent('batting:favorites-changed',{detail:{entries:valuesClean,slugs:valuesClean.map(value=>value.slug)}}));return valuesClean}
  function has(slug,colorId=null){return entries().some(value=>value.slug===String(slug||'')&&value.colorId===(colorId?String(colorId):null))}
  function toggle(slug,colorId=null){const key=String(slug||'');if(!key)return false;const color=colorId?String(colorId):null,values=entries(),exists=has(key,color);save(exists?values.filter(value=>value.slug!==key||value.colorId!==color):[...values,{slug:key,colorId:color}]);return !exists}
  function remove(slug,colorId=null){save(entries().filter(value=>value.slug!==String(slug||'')||value.colorId!==(colorId?String(colorId):null)))}
  function resolve(products){const map=new Map(products.map(product=>[product.slug,product]));let changed=false;const values=entries().map(value=>{const product=map.get(value.slug);if(value.colorId||!product?.colors?.length)return value;changed=true;return {...value,colorId:window.BattingData.firstAvailableColor(product)?.id||null}});if(changed)save(values,{notify:false});return values}
  window.BattingFavorites={list,entries,save,has,toggle,remove,resolve,count:()=>entries().length};
})();
