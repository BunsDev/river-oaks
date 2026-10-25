// Diagnostic-only Chromium measurement; callers choose matching settled states.
export async function collectRetainedHeap(page){
  const session=await page.context().newCDPSession(page);
  let samplingFailure;
  try{
    await session.send('HeapProfiler.collectGarbage');
    const usage=await session.send('Runtime.getHeapUsage');
    if(!Number.isFinite(usage.usedSize)||usage.usedSize<=0)throw new Error('Invalid retained heap counter');
    return usage;
  }catch(error){samplingFailure=error;throw error;}
  finally{
    try{await session.detach();}
    catch(cleanupError){
      if(samplingFailure)throw new AggregateError([samplingFailure,cleanupError],`${samplingFailure.message}; CDP detach also failed: ${cleanupError.message}`,{cause:samplingFailure});
      throw cleanupError;
    }
  }
}
