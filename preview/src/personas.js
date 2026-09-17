// Immersive in-world roles, not claims about actual residents' lives or opinions.
// Public biography facts are separated from invented encounter dialogue and routines.
export const HOUSTON_PORTRAYALS = Object.freeze([
  { name:'Ima Hogg', role:'Houston arts patron · heritage encounter', era:'historical', voice:'bf_isabella', source:'https://www.mfah.org/visit/bayou-bend/history', fact:'Houston collector and philanthropist associated with Bayou Bend.', interest:'art and gardens', about:'I’m Ima. A garden and an artwork both invite us to look a little closer. On this imagined afternoon, I’m enjoying how a shared place brings neighbors together.', story:'Art is my starting point for a conversation. Which catches your eye first here: a carefully made object, or the way a public garden draws people in?' },
  { name:'Barbara Jordan', role:'Houston public servant · heritage encounter', era:'historical', voice:'af_nicole', source:'https://history.house.gov/People/Listing/J/JORDAN,-Barbara-Charline-(J000266)/', fact:'Houston-born legislator who represented a Houston district in Congress.', interest:'community and public service', about:'I’m Barbara. For this imagined visit, I’m interested in what neighbors need and whether everyone has a chance to be heard. Tell me what you have noticed on your walk.', story:'A useful place to begin is with a question: who has not yet been heard? Before choosing an intervention, listen to the people affected by it.' },
  { name:'Hakeem Olajuwon', role:'Houston basketball figure · fictional guest', era:'present', voice:'am_michael', source:'https://www.nba.com/news/history-nba-legend-hakeem-olajuwon', fact:'Houston Rockets basketball champion.', interest:'basketball and teamwork', about:'I’m Hakeem in this fictional encounter. I’m taking a quiet walk and thinking about teamwork. A neighborhood, like a team, works better when people notice who needs support.', story:'For our conversation, think about timing. Moving quickly is helpful, but choosing the right moment and paying attention to others can matter just as much.' },
  { name:'Beyoncé', role:'Houston-born artist · fictional guest', era:'present', voice:'af_bella', source:'https://www.grammy.com/artists/beyonce-knowles/12474/', fact:'Singer and artist born in Houston.', interest:'music and creative community', about:'I’m Beyoncé in this imagined Houston visit. Today’s conversation is about creativity and the people who make a place feel like home. What has stood out to you in the district?', story:'There are creative details everywhere if you slow down: a window display, a color, the rhythm of footsteps. What would you choose as the opening scene of a story about this place?' },
]);

const ROUTINES = ['morning walk, afternoon coffee, an evening gallery visit','a lunch break, window-shopping, then meeting neighbors','a daily stroll and a stop to check on friends','an afternoon gallery visit followed by a quiet walk','greeting visitors and helping people find their way','walking the district before the afternoon heat'];
const INTERESTS = ['gardens and architecture','coffee and local food','neighborhood history','art and design','community volunteering','music and evening walks'];

export function createPersona(index, name, anchorName) {
  const portrayal = index >= 20 && index < 24 ? HOUSTON_PORTRAYALS[index-20] : null;
  return {
    ...(portrayal ?? {}), name:portrayal?.name ?? name, portrayal:Boolean(portrayal),
    homeContext:portrayal ? 'Fictional cultural encounter in River Oaks; no current private residence asserted' : 'In-world River Oaks resident',
    anchorName, interest:portrayal?.interest ?? INTERESTS[index % INTERESTS.length], routine:ROUTINES[index % ROUTINES.length],
    memory:{encounters:0,topics:[],supportReceived:0},
  };
}

export function conversationLine(local, topic) {
  const persona = local.persona;
  if (!persona) return `Hello, I’m ${local.name}. It’s nice to meet you.`;
  const seen = persona.memory.topics.includes(topic);
  if (!seen) persona.memory.topics.push(topic);
  if (persona.memory.topics.length > 6) persona.memory.topics.shift();
  if (topic === 'greeting') {
    persona.memory.encounters++;
    if (persona.memory.supportReceived) return `Good to see you again. I remember the support you offered. Thank you for stopping by ${local.anchorName}.`;
    if (persona.memory.encounters > 1) return `Welcome back. I’m still enjoying the afternoon near ${local.anchorName}. How is your walk going?`;
    return persona.portrayal ? persona.about : `Hi, I’m ${local.name}. I live here in River Oaks. ${local.anchorName} is one of my stops today. Do you have a moment to chat?`;
  }
  if (topic === 'about') return persona.about ?? `I’m a River Oaks local. My usual rhythm is ${persona.routine}. I’m especially interested in ${persona.interest}. Today I’m taking a little time near ${local.anchorName}.`;
  if (topic === 'story') return persona.story ?? (seen ? `We were talking about ${persona.interest}. I’d enjoy hearing what you noticed as you walked between the storefronts.` : `What I love about a familiar place is noticing a new detail. Around here, ${persona.interest} always give me a reason to slow down. What caught your attention today?`);
  if (topic === 'district') return 'We’re at River Oaks District, 4444 Westheimer. The public lanes connect shops, restaurants and galleries. Pick a storefront in the menu to arrive nearby, or take your time walking between them. I’m staying near '+local.anchorName+' for now.';
  return '';
}
