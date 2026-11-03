(function(){
  'use strict';
  const KEY='batting-shop-favorites-v1';
  let warned=false;
  function list(){const raw=window.BattingStorage.getJSON(KEY,[]).value;return [...new Set((Array.isArray(raw)?raw:[]).map(String).filter(Boolean))]}
  function save(values){const clean=[...new Set(values.map(String).filter(Boolean))];const persisted=window.BattingStorage.setJSON(KEY,clean);if(!persisted&&!warned){warned=true;window.BattingUI?.toast?.('Tus favoritos se mantendrán mientras esta pestaña siga abierta.',{kind:'warning',timeout:4600})}window.dispatchEvent(new CustomEvent('batting:favorites-changed',{detail:{slugs:clean}}));return clean}
  function has(slug){return list().includes(String(slug||''))}
  function toggle(slug){const key=String(slug||'');if(!key)return false;const values=list(),exists=values.includes(key);save(exists?values.filter(x=>x!==key):[...values,key]);return !exists}
  function remove(slug){save(list().filter(x=>x!==String(slug||'')))}
  window.BattingFavorites={list,save,has,toggle,remove,count:()=>list().length};
})();
