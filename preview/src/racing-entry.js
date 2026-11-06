const host=document.querySelector('#racing');
try {
 const response=await fetch('/api/waitlist/status',{credentials:'same-origin',cache:'no-store'});
 if(!response.ok||(await response.json()).status!=='approved')throw new Error('Sign in and join the approved waitlist to open Garden Circuit.');
 const {startRacing}=await import('./racing.js');startRacing(host);
} catch(error){host.querySelector('[role="status"]').textContent=error.message||'Garden Circuit could not open. Return to the world and try again.';}
