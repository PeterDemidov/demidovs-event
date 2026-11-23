(() => {
  const id=114631068, key='demidovs-analytics-consent';
  let active=false;
  const read=()=>{try{return localStorage.getItem(key)}catch{return null}};
  function start(){
    if(active)return; active=true;
    window.ym=window.ym||function(){(window.ym.a=window.ym.a||[]).push(arguments)};
    window.ym.l=Date.now();
    const s=document.createElement('script');s.async=true;s.src='https://mc.yandex.ru/metrika/tag.js?id='+id;document.head.append(s);
    window.ym(id,'init',{ssr:true,clickmap:false,accurateTrackBounce:true,trackLinks:false,webvisor:false});
  }
  function goal(name){if(active && typeof window.ym==='function')window.ym(id,'reachGoal',name)}
  function save(value){try{localStorage.setItem(key,value)}catch{}}
  function show(){
    if(document.getElementById('analytics-consent'))return;
    const box=document.createElement('aside');box.id='analytics-consent';box.setAttribute('aria-label','Настройки аналитики');
    box.style.cssText='position:fixed;z-index:1000;bottom:80px;right:12px;left:auto;max-width:min(420px,calc(100% - 24px));padding:16px;background:#191919;color:#fff;border:1px solid #666;border-radius:10px;font:14px/1.5 Arial,sans-serif;box-shadow:0 4px 20px #0006';
    const p=document.createElement('p');p.style.margin='0 0 10px';p.textContent='Разрешить анонимную статистику посещений с Яндекс Метрикой? ';const a=document.createElement('a');a.href='/privacy/#analytics';a.textContent='Подробнее';a.style.color='#fff';p.append(a);box.append(p);
    for(const [label,value] of [['Разрешить','yes'],['Отказаться','no']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='padding:9px 13px;margin:4px 8px 0 0;border:1px solid #aaa;border-radius:4px;background:'+(value==='yes'?'#e52b50':'#333')+';color:white;cursor:pointer';b.addEventListener('click',()=>{save(value);box.remove();if(value==='yes')start();else if(active){active=false;try{window.ym(id,'destruct')}catch{}}});box.append(b)}document.body.append(box);
  }
  if(read()==='yes')start();else if(read()!=='no')show();
  document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;const h=a.getAttribute('href')||'';if(h.startsWith('tel:'))goal('contact_call');else if(/^https:\/\/(t\.me|wa\.me)\//.test(h))goal('contact_messenger');else if(h.endsWith('#contact'))goal('contact_cta');if(a.id==='analytics-settings'){e.preventDefault();show()}},true);
  document.addEventListener('submit',e=>{if(e.target.id==='leadForm'&&e.target.checkValidity())goal('lead_form_intent')},true);
})();