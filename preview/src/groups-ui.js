const node=(tag,text,className)=>{const item=document.createElement(tag);if(text)item.textContent=text;if(className)item.className=className;return item;};

export function createGroupsUI({panel,request,socialRequest,connected,selfId}) {
  const section=node('section',null,'multiplayer-groups');section.setAttribute('aria-label','Resident groups');
  const title=node('h3','Groups');
  const intro=node('p','Keep in touch across worlds. Invite accepted contacts to a private group.');
  const create=node('form',null,'multiplayer-groups-create');
  const name=node('input'),description=node('input'),createButton=node('button','Create group');
  name.name='name';name.maxLength=40;name.required=true;name.placeholder='Group name';name.setAttribute('aria-label','Group name');
  description.name='description';description.maxLength=160;description.placeholder='What brings you together?';description.setAttribute('aria-label','Group description');
  createButton.type='submit';create.append(name,description,createButton);
  const list=node('div',null,'multiplayer-groups-list');
  const conversation=node('div',null,'multiplayer-group-conversation');
  const status=node('p',null,'multiplayer-group-status');status.setAttribute('role','status');
  section.append(title,intro,create,list,conversation,status);
  panel.querySelector('.multiplayer-social')?.after(section);
  let groups=[],selected=null,detail=null,lastList='',lastStructure='',lastMessages='',inviteSelection='',busy=false,disposed=false;
  const call=(action,data={})=>request(action,data);
  const say=message=>{status.textContent=message;};
  async function run(action,data,success) {
    say('');
    try {
      await call(action,data);
      say(success);
      await refresh(true);
      return true;
    } catch(error) {say(error.message);return false;}
  }
  function renderList() {
    list.replaceChildren();
    if(!groups.length)list.append(node('p','Create a group or accept an invitation from a contact.'));
    for(const group of groups) {
      const row=node('div',null,'multiplayer-group-row');
      const label=node('span',group.name);label.append(node('small',group.status==='invited'?' · Invitation':` · ${group.memberCount} ${group.memberCount===1?'member':'members'}`));
      row.append(label);
      const button=(caption,action)=>{const control=node('button',caption);control.type='button';control.addEventListener('click',action);row.append(control);};
      if(group.status==='invited') {
        button('Accept',()=>void run('accept',{groupId:group.id},`Joined ${group.name}.`));
        button('Decline',()=>void run('decline',{groupId:group.id},'Invitation declined.'));
      } else button('Open',()=>{if(selected!==group.id)inviteSelection='';selected=group.id;detail=null;lastStructure='';lastMessages='';void refreshDetail();});
      list.append(row);
    }
  }
  function renderMessages() {
    const history=conversation.querySelector('.multiplayer-group-history');if(!history||!detail)return;
    const serialized=JSON.stringify(detail.messages);
    if(serialized===lastMessages)return;
    const atEnd=history.scrollHeight-history.scrollTop-history.clientHeight<24;
    lastMessages=serialized;
    history.replaceChildren(...detail.messages.map(message=>{
      const line=node('p');
      line.append(node('strong',message.authorId===selfId()?'You':message.authorName),document.createTextNode(`: ${message.text}`));
      return line;
    }));
    if(atEnd)history.scrollTop=history.scrollHeight;
  }
  async function populateInvite(group,select) {
    try {
      const result=await socialRequest('list');
      if(selected!==group.id||disposed)return;
      select.replaceChildren();
      const prompt=node('option','Invite a contact');prompt.value='';select.append(prompt);
      for(const contact of result.contacts??[])if(contact.status==='accepted'
        && !group.members.some(member=>member.id===contact.peer.id)
        && !group.invites?.some(invite=>invite.id===contact.peer.id)) {
        const option=node('option',contact.peer.name);option.value=contact.peer.id;select.append(option);
      }
      if([...select.options].some(option=>option.value===inviteSelection))select.value=inviteSelection;
      else inviteSelection='';
    } catch(error) {say(error.message);}
  }
  function renderDetail() {
    conversation.replaceChildren();if(!detail)return;
    const group=detail;
    const heading=node('h4',group.name);
    const description=node('p',group.description||'A private place for this group to talk.');
    const memberHeading=node('h5',`Members (${group.members.length})`),members=node('div',null,'multiplayer-group-members');
    for(const person of group.members) {
      const row=node('div',null,'multiplayer-group-member');row.append(node('span',person.name+(person.id===group.ownerId?' · Owner':'')));
      if(group.ownerId===selfId()&&person.id!==selfId()) {
        const remove=node('button','Remove');remove.type='button';
        remove.setAttribute('aria-label',`Remove ${person.name} from ${group.name}`);
        remove.addEventListener('click',()=>void run('remove',{groupId:group.id,memberId:person.id},`${person.name} removed.`));row.append(remove);
      }
      members.append(row);
    }
    if(group.invites?.length)for(const invite of group.invites) {
      const row=node('div',null,'multiplayer-group-member');row.append(node('span',`${invite.name} · Invited`));
      const cancel=node('button','Cancel');cancel.type='button';
      cancel.addEventListener('click',()=>void run('remove',{groupId:group.id,memberId:invite.id},'Invitation canceled.'));
      row.append(cancel);members.append(row);
    }
    const history=node('div',null,'multiplayer-group-history');history.setAttribute('role','log');history.setAttribute('aria-label',`Messages in ${group.name}`);
    const form=node('form',null,'multiplayer-group-form');
    const input=node('input'),send=node('button','Send');input.maxLength=280;input.placeholder='Message the group';input.setAttribute('aria-label',`Message ${group.name}`);
    send.type='submit';form.append(input,send);
    form.addEventListener('submit',async event=>{
      event.preventDefault();const text=input.value.trim();if(!text)return;
      send.disabled=true;
      try{await call('send',{groupId:group.id,text});input.value='';say('');await refreshDetail();}
      catch(error){say(error.message);}
      finally{send.disabled=false;input.focus();}
    });
    conversation.append(heading,description,memberHeading,members,history,form);
    if(group.ownerId===selfId()) {
      const inviteForm=node('form',null,'multiplayer-group-invite'),select=node('select'),inviteButton=node('button','Invite');
      select.setAttribute('aria-label',`Invite a contact to ${group.name}`);inviteButton.type='submit';
      select.addEventListener('change',()=>{inviteSelection=select.value;});
      inviteForm.append(select,inviteButton);
      inviteForm.addEventListener('submit',async event=>{
        event.preventDefault();const peerId=select.value||inviteSelection;if(!peerId)return;
        inviteButton.disabled=true;
        if(await run('invite',{groupId:group.id,peerId},'Group invitation sent.'))inviteSelection='';
        inviteButton.disabled=false;
      });
      conversation.append(inviteForm);void populateInvite(group,select);
    }
    const leave=node('button',group.ownerId===selfId()?'Disband group':'Leave group');leave.type='button';
    leave.addEventListener('click',async()=>{
      if(group.ownerId===selfId()&&!window.confirm(`Disband ${group.name} for everyone?`))return;
      await run('leave',{groupId:group.id},group.ownerId===selfId()?'Group disbanded.':'You left the group.');
    });conversation.append(leave);
    lastMessages='';renderMessages();
  }
  async function refreshDetail() {
    if(!selected||!connected()||disposed)return;
    const id=selected;
    try {
      const {group}=await call('read',{groupId:id});
      if(id!==selected||disposed)return;
      detail=group;
      const structure=JSON.stringify([group.id,group.name,group.description,group.members,group.invites]);
      if(structure!==lastStructure){lastStructure=structure;renderDetail();}
      else renderMessages();
    } catch(error) {
      if(id!==selected||disposed)return;
      selected=null;detail=null;lastStructure='';lastMessages='';conversation.replaceChildren();say(error.message);
    }
  }
  async function refresh(force=false) {
    if(disposed||busy||!connected()||!force&&document.visibilityState==='hidden')return;
    busy=true;
    try {
      const result=await call('list');
      if(disposed)return;
      const serialized=JSON.stringify(result.groups);
      if(serialized!==lastList) {
        lastList=serialized;groups=result.groups;renderList();
        if(selected&&!groups.some(group=>group.id===selected&&group.status==='member')) {
          selected=null;detail=null;lastStructure='';lastMessages='';inviteSelection='';conversation.replaceChildren();
        }
      }
      await refreshDetail();
    } catch(error) {say(error.message);}
    finally {busy=false;}
  }
  create.addEventListener('submit',async event=>{
    event.preventDefault();createButton.disabled=true;
    try {
      const result=await call('create',{name:name.value,description:description.value});
      name.value='';description.value='';say('Group created.');
      selected=result.group.id;detail=null;lastStructure='';lastMessages='';inviteSelection='';
      await refresh(true);
    } catch(error) {say(error.message);}
    finally {createButton.disabled=false;}
  });
  const timer=setInterval(()=>void refresh(),10_000);
  return {refresh,dispose(){disposed=true;clearInterval(timer);section.remove();}};
}
