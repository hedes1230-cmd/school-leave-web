// Decorative enhancements only; account and leave workflows stay in their modules.
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const date = new Intl.DateTimeFormat('th-TH', {day:'numeric',month:'short',year:'numeric'}).format(new Date());
  document.querySelectorAll('.page-intro > div').forEach(container => {
    const label=document.createElement('span');label.className='page-date';label.textContent=date;container.append(label);
  });
  document.addEventListener('click', event => {
    const button=event.target.closest('.btn');
    if(!button || button.disabled || reducedMotion.matches || event.detail===0)return;
    const bounds=button.getBoundingClientRect();
    const wave=document.createElement('span');wave.className='tap-wave';wave.setAttribute('aria-hidden','true');
    wave.style.left=`${event.clientX-bounds.left}px`;wave.style.top=`${event.clientY-bounds.top}px`;
    button.append(wave);wave.addEventListener('animationend',()=>wave.remove(),{once:true});
    setTimeout(()=>wave.remove(),700);
  });
})();
