(async function(){
  const {qs,el}=window.BattingUI;
  window.BattingUI.wireChrome();
  window.BattingCart.updateCount();
  const {load,findBrand,render}=window.BattingSizeGuides;
  const content=qs('#guideContent'),tabs=qs('#guideTabs');
  try{
    const guides=await load(),requested=new URLSearchParams(location.search).get('marca');
    const initial=findBrand(guides,requested)||'Franklin';
    for(const brand of Object.keys(guides)){
      const button=el('button',{class:'size-tab',type:'button',text:brand});
      button.addEventListener('click',()=>select(brand));
      tabs.append(button);
    }
    function select(brand){
      for(const button of tabs.children){
        const active=button.textContent===brand;
        button.classList.toggle('active',active);
        button.setAttribute('aria-pressed',String(active));
      }
      render(guides[brand],content);
    }
    select(initial);
  }catch{
    content.replaceChildren(el('p',{class:'empty-state',text:'No pudimos cargar las guías de tallas. Vuelve a intentarlo.'}));
  }
})();
