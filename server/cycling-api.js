import { BOARDS, boardId, boardValue } from '../preview/src/leaderboard-boards.js';

// The leaderboard reads, shared by the dev town and the hosted gateway: the top
// accounts on a board, in its unit to one decimal (miles, or hours played),
// and the caller's own rank. Each board's top list is cached briefly per
// instance so a crowd opening the sheet costs one store read; the caller's row
// is always live. Names are the public roster names the store kept at flush
// time; user ids never leave. The caller's own row in the top list is marked
// `you`, so the client highlights it without matching names.
// read() is the original cycling route's shape ({rank, name, miles}); board()
// serves every board as {rank, name, value}.
export function createCyclingLeaderboard({store,now=Date.now,limit=20,ttlMs=10000}={}) {
  const cache=new Map();
  const top=async board=>{
    const time=now(),held=cache.get(board);
    if(held && time-held.at<ttlMs)return held.rows;
    const rows=(await store.top(limit,board)).map((row,index)=>({rank:index+1,userId:row.userId,name:row.name,value:boardValue(board,row.total)}));
    cache.set(board,{rows,at:time});
    return rows;
  };
  const page=async(identity,board)=>{
    const [rows,mine]=await Promise.all([top(board),store.rank(identity.userId,board)]);
    return {rows:rows.map(({userId,...row})=>userId===identity.userId?{...row,you:true}:row),me:mine?{rank:mine.rank,value:boardValue(board,mine.total)}:null};
  };
  const unavailable={status:503,value:{error:'The leaderboard is unavailable.'}};
  return {
    async read(identity) {
      if(!store)return unavailable;
      const {rows,me}=await page(identity,'cycling');
      return {status:200,value:{top:rows.map(({value,...row})=>({...row,miles:value})),me:me?{rank:me.rank,miles:me.value}:null,limit}};
    },
    async board(identity,requested) {
      const id=boardId(requested);
      if(!id)return {status:404,value:{error:'That leaderboard isn’t here.'}};
      if(!store)return unavailable;
      const {rows,me}=await page(identity,id);
      const {label,unit}=BOARDS.find(board=>board.id===id);
      return {status:200,value:{board:id,label,unit,top:rows,me,limit}};
    },
  };
}
