(function(){
  'use strict';
  const {el}=window.BattingUI;
  let loading;
  function load(){
    if(!loading)loading=fetch('/data/size-guides.json')
      .then(response=>{if(!response.ok)throw new Error('Guías no disponibles.');return response.json()})
      .then(data=>data.brands)
      .catch(error=>{loading=null;throw error});
    return loading;
  }
  function findBrand(guides,name){
    const normalized=window.BattingData.normalizeText(name);
    const alias={'louisville slugger':'louisville','adidas adizero':'adidas'}[normalized]||normalized;
    return Object.keys(guides).find(brand=>window.BattingData.normalizeText(brand)===alias);
  }
  function render(guide,root){
    root.replaceChildren(el('p',{class:'section-sub',text:guide.note}));
    for(const section of guide.sections){
      const group=el('section',{class:'guide-section'},el('h3',{text:section.title}));
      if(section.rows?.length){
        const header=el('tr',{},section.columns.map(column=>el('th',{scope:'col',text:column})));
        const rows=section.rows.map(row=>el('tr',{},row.map(value=>el('td',{text:value}))));
        const table=el('table',{class:'size-table'+(section.columns.length<=3?' size-table-compact':'')},[
          el('thead',{},header),el('tbody',{},rows)
        ]);
        group.append(el('div',{class:'table-wrap'},table));
      }
      root.append(group);
    }
  }
  window.BattingSizeGuides={load,findBrand,render};
})();
