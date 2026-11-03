(function(){
  'use strict';
  const c=window.BATTING_CONFIG||{};
  document.querySelectorAll('[data-config-text]').forEach(node=>{
    const key=node.dataset.configText;if(key==='instagram')node.textContent=`@${c.instagram}`;else if(key==='whatsapp')node.textContent=c.whatsappDisplay||'';else if(key==='location')node.textContent=c.location||'';else if(key==='shipping')node.textContent=c.shippingText||'';
  });
  document.querySelectorAll('[data-config-href]').forEach(node=>{
    const key=node.dataset.configHref;if(key==='instagram')node.href=c.instagramUrl||'#';else if(key==='whatsapp')node.href=c.whatsappE164?`https://wa.me/${c.whatsappE164}`:'#';
  });
})();
