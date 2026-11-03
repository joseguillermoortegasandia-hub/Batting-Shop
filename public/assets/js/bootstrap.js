(function(){
  'use strict';
  document.addEventListener('DOMContentLoaded',()=>{
    window.BattingUI?.wireChrome?.();
    window.BattingCart?.updateCount?.();
    const count=window.BattingFavorites?.count?.()||0;
    document.querySelectorAll('[data-favorite-count]').forEach(node=>{node.textContent=String(count);node.hidden=count===0});
    window.BattingUI?.refreshFloatingWhatsapp?.();
  });
})();
