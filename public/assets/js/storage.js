(function(){
  'use strict';
  const memoryLocal=new Map(),memorySession=new Map();
  function backend(kind){try{return kind==='session'?window.sessionStorage:window.localStorage}catch{return null}}
  function memory(kind){return kind==='session'?memorySession:memoryLocal}
  function getRaw(key,{kind='local'}={}){
    const store=backend(kind);if(store){try{const value=store.getItem(key);if(value!==null)return {value,persistent:true}}catch{}}
    return {value:memory(kind).has(key)?memory(kind).get(key):null,persistent:false};
  }
  function setRaw(key,value,{kind='local'}={}){
    memory(kind).set(key,String(value));const store=backend(kind);if(!store)return false;
    try{store.setItem(key,String(value));return true}catch{return false}
  }
  function remove(key,{kind='local'}={}){memory(kind).delete(key);const store=backend(kind);if(store){try{store.removeItem(key)}catch{}}}
  function getJSON(key,fallback,{kind='local'}={}){const {value,persistent}=getRaw(key,{kind});if(value===null)return {value:fallback,persistent};try{return {value:JSON.parse(value),persistent}}catch{remove(key,{kind});return {value:fallback,persistent}}}
  function setJSON(key,value,{kind='local'}={}){try{return setRaw(key,JSON.stringify(value),{kind})}catch{return false}}
  window.BattingStorage={getRaw,setRaw,remove,getJSON,setJSON};
})();
