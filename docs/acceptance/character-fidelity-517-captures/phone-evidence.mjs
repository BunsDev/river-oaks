// Evidence completeness, not a device-performance or visual-quality budget.
export function validatePhoneEvidence(records,mode) {
  const require=(condition,message)=>{if(!condition)throw Error(message);};
  const one=(kind,predicate=()=>true)=>{const matches=records.filter(r=>r.kind===kind&&predicate(r.data));require(matches.length===1,`Expected one ${kind} record`);return matches[0].data;};
  const finite=value=>Number.isFinite(value)&&value>=0;
  const hello=one('hello'),environment=one('environment');
  require(hello.visibility==='visible','Page must be visible');
  require(environment.viewport?.width===1920&&environment.viewport?.height===1080&&typeof environment.gpu==='string','Missing fixed rendering environment');
  if(mode==='smoke'){require(one('smoke').ready===true,'Smoke not ready');return {smoke:true};}
  require(mode==='physical'&&/iPhone/.test(hello.userAgent),'Physical iPhone evidence required');
  require(!records.some(r=>r.kind==='smoke'),'Smoke is not physical evidence');
  const ids=['morgan-human','imani-human'],tiers=['off','low','standard','high'];
  const metric=value=>require(value?.count===120&&['min','p50','p95','max','mean'].every(k=>finite(value[k]))&&value.min<=value.p50&&value.p50<=value.p95&&value.p95<=value.max,'Invalid frame distribution');
  const lifecycle=(value,count)=>{
    require(value?.count===count,'Invalid lifecycle count');
    for(const resource of ['geometries','textures','programs']){
      const before=value.before?.[resource],after=value.after?.[resource],delta=value.delta?.[resource];
      require(Number.isInteger(before)&&before>=0&&Number.isInteger(after)&&after>=0&&delta===after-before&&delta<=0,'Invalid or growing lifecycle resource');
    }
  };
  for(const id of ids){
    const load=one('load',d=>d.id===id).result;require(finite(load?.loadMs)&&finite(load?.firstFrameMs),'Invalid loading sample');
    for(const realism of tiers){
      for(const repeat of [0,1])for(const count of [1,8,24]){
        const result=one('frames',d=>d.id===id&&d.realism===realism&&d.repeat===repeat&&d.result?.count===count).result;
        metric(result.frameIntervalMs);metric(result.cpuMs);
        require(['triangles','drawCalls','textureBytes'].every(k=>finite(result.census?.[k])&&result.census[k]>0),'Missing scene census');
        if(result.gpuMs?.count)require(['min','p50','p95','max','mean'].every(k=>finite(result.gpuMs[k]))&&!result.gpuDisjoint,'Invalid GPU distribution');
      }
      lifecycle(one('lifecycle',d=>d.id===id&&d.realism===realism).result,10);
    }
    lifecycle(one('portraitLifecycle',d=>d.id===id&&d.realism==='high').result,3);
    for(const realism of ['off','high']){
      const capture=one('capture',d=>d.id===id&&d.realism===realism).result;
      require(capture.definition?.appearanceId===id,'Capture identity changed');
      const expected=realism==='off'?['full','closeUp']:['full','closeUp','expression-smile','expression-browRaise'];
      require(Object.keys(capture.views??{}).length===expected.length,'Wrong capture set');
      for(const view of expected){const png=capture.views[view]?.png;require(png?.width===3840&&png.height===2160&&png.bytes>24&&/^[a-f0-9]{64}$/.test(png.sha256),'Missing native capture');}
    }
  }
  require(records.filter(r=>r.kind==='frames').length===48,'Unexpected frame cases');
  return {frames:48,viewportLifecycles:8,portraitLifecycles:2,captures:4,images:12};
}
