const node=(tag,text,className)=>{const element=document.createElement(tag);if(text)element.textContent=text;if(className)element.className=className;return element;};

export function createProfileUI({host,request,selfId}) {
  const openOwn=node('button','My profile');openOwn.type='button';
  const card=node('section',null,'multiplayer-profile');card.hidden=true;card.setAttribute('aria-label','Resident profile');
  const heading=node('h4'),content=node('div',null,'multiplayer-profile-content');
  const status=node('p',null,'multiplayer-profile-status');status.setAttribute('role','status');
  const close=node('button','Close profile');close.type='button';close.addEventListener('click',()=>{card.hidden=true;openOwn.focus();});
  card.append(heading,content,status,close);host.append(openOwn,card);
  let selected=null,sequence=0;
  const field=(labelText,input)=>{const label=node('label',labelText);label.append(input);return label;};
  const input=(max,placeholder='')=>{const element=node('input');element.type='text';element.maxLength=max;element.placeholder=placeholder;return element;};
  async function inspect(peer) {
    const id=peer?.id??selfId(),own=id===selfId(),requestId=++sequence;
    selected=id;card.hidden=false;heading.textContent=own?'My profile':`${peer.name}'s profile`;
    content.replaceChildren();status.textContent='Loading profile…';
    try {
      const {profile}=await request('view',own?{}:{peerId:id});
      if(selected!==id || requestId!==sequence)return;
      heading.textContent=own?'My profile':profile.name;
      status.textContent='';
      if(!own) {
        if(profile.pronouns)content.append(node('p',profile.pronouns));
        content.append(node('p',profile.tagline||'No introduction yet.'));
        if(profile.bio)content.append(node('p',profile.bio));
        if(profile.interests.length)content.append(node('p',`Interests: ${profile.interests.join(', ')}`));
        return;
      }
      const form=node('form',null,'multiplayer-profile-form');
      const pronouns=input(32,'Pronouns'),tagline=input(100,'A short introduction'),bio=node('textarea'),interests=input(240,'Art, stories, gardens');
      bio.maxLength=600;bio.rows=4;
      pronouns.value=profile.pronouns;tagline.value=profile.tagline;bio.value=profile.bio;interests.value=profile.interests.join(', ');
      const save=node('button','Save profile');save.type='submit';
      form.append(field('Pronouns',pronouns),field('Tagline',tagline),field('About',bio),field('Interests, separated by commas',interests),save);
      form.addEventListener('submit',async event=>{
        event.preventDefault();save.disabled=true;status.textContent='Saving profile…';
        try {
          const result=await request('save',{pronouns:pronouns.value.trim(),tagline:tagline.value.trim(),bio:bio.value.trim(),
            interests:interests.value.split(',').map(value=>value.trim()).filter(Boolean),expectedVersion:profile.version});
          profile.version=result.profile.version;status.textContent='Profile saved across worlds.';
        } catch(error) {status.textContent=error.message==='profile_conflict'?'This profile changed elsewhere. Reopen it before saving.'
          :error.message==='invalid_profile'?'Use a short bio and up to eight distinct interests.':error.message;}
        finally {save.disabled=false;}
      });
      content.append(form);
    } catch(error) {status.textContent=error.message||'Profile unavailable.';}
  }
  openOwn.addEventListener('click',()=>inspect());
  return {inspect};
}
