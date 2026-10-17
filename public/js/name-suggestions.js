export const normalizeName = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('th');

export function uniquePeople(records) {
    const byId = new Map();
    for (const person of records) if (person.uid && person.name) byId.set(person.uid, person);
    return [...byId.values()].sort((a,b) => a.name.localeCompare(b.name,'th') || a.uid.localeCompare(b.uid));
}

export function identitySuffix(uid, people) {
    let length = Math.min(6, uid.length);
    while (length < uid.length && people.some(p => p.uid !== uid && p.uid.endsWith(uid.slice(-length)))) length++;
    return uid.slice(-length);
}

export function duplicateName(uid, people) {
    const person = people.find(p => p.uid === uid);
    return !!person && people.some(p => p.uid !== uid && normalizeName(p.name) === normalizeName(person.name));
}

export function matchingPeople(records, term) {
    const q = normalizeName(term);
    if (!q) return [];
    return uniquePeople(records).filter(p => normalizeName(p.name).split(' ').some(part => part.startsWith(q)) || normalizeName(p.name).startsWith(q)).slice(0,10);
}

// Suggestions use already-authorized in-memory records, never a directory scan.
export function attachNameSuggestions(input, getPeople, onSelect, onClear, getIdentityPeople = getPeople) {
    const host = input.closest('.input-icon') || input.parentElement;
    host.classList.add('name-search');
    const list = document.createElement('div'); list.className='name-suggestions'; list.id=`${input.id}-suggestions`; list.hidden=true; list.setAttribute('role','listbox');list.setAttribute('aria-label','ชื่อแนะนำ');host.append(list);
    input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',list.id);input.setAttribute('aria-expanded','false');input.autocomplete='off';
    let items=[],active=-1,composing=false;
    const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;};
    const choose=index=>{const person=items[index];if(!person)return;input.value=person.name;close();onSelect(person);input.focus();};
    const render=()=>{
        if(composing)return;
        const people=uniquePeople(getIdentityPeople());items=matchingPeople(getPeople(),input.value);active=-1;list.replaceChildren();input.removeAttribute('aria-activedescendant');
        items.forEach((person,index)=>{
            const option=document.createElement('div');option.className='name-option';option.id=`${list.id}-${index}`;option.setAttribute('role','option');option.setAttribute('aria-selected','false');
            const name=document.createElement('strong');name.textContent=person.name;
            const detail=document.createElement('small');detail.textContent=`${duplicateName(person.uid,people)?'ชื่อซ้ำ · ':''}รหัส ${identitySuffix(person.uid,people)}`;detail.title=person.uid;
            option.append(name,detail);option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>choose(index));list.append(option);
        });
        list.hidden=!items.length;input.setAttribute('aria-expanded',String(items.length>0));
    };
    input.addEventListener('input',()=>{onClear();render();});
    input.addEventListener('focus',render);
    input.addEventListener('compositionstart',()=>{composing=true;close();});
    input.addEventListener('compositionend',()=>{composing=false;render();});
    input.addEventListener('blur',close);
    input.addEventListener('keydown',event=>{
        if(event.isComposing)return;
        if(event.key==='Escape'){close();return;}
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){
            if(list.hidden)render();if(!items.length)return;event.preventDefault();
            active=event.key==='ArrowDown'?(active+1)%items.length:(active<=0?items.length-1:active-1);
            [...list.children].forEach((el,i)=>el.setAttribute('aria-selected',String(i===active)));
            input.setAttribute('aria-activedescendant',list.children[active].id);list.children[active].scrollIntoView({block:'nearest'});
        }else if(event.key==='Enter'&&!list.hidden&&active>=0){event.preventDefault();choose(active);}
    });
    return {close, refresh:()=>{if(document.activeElement===input)render();}};
}
