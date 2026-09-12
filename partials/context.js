/* Scenario = conditions; view = representation; depth = containment.
   Include after model.js. A synchronous, pure build(context) returns the whole
   hierarchy. The kit reconciles its location and owns the choice controls. */
function createContextStage(opts){
  const {defaults={},scenarios=[],views=[],build,controls,onChange}=opts;
  if (typeof build!=='function' || !controls || !views.length)
    throw new Error('createContextStage needs build, a controls element, and views');
  const scalar=v=>v===null || ['string','boolean'].includes(typeof v)
    || (typeof v==='number' && Number.isFinite(v));
  const base=Object.freeze({...defaults});
  function settings(values){
    if (!values || typeof values!=='object' || Array.isArray(values))
      throw new Error('Settings must be a flat object');
    for (const [k,v] of Object.entries(values))
      if (!Object.hasOwn(base,k) || !scalar(v)) throw new Error(`Invalid setting: ${k}`);
    return {...values};
  }
  settings(base);
  function choices(list,kind){
    const ids=new Set();
    return list.map(s=>{
      if (!s || typeof s.id!=='string' || !s.id || ids.has(s.id)
        || typeof s.label!=='string' || !s.label) throw new Error(`Invalid ${kind} id or label`);
      ids.add(s.id);
      if (kind==='scenario' && !['replace','patch'].includes(s.mode))
        throw new Error('Each scenario must declare mode: replace or patch');
      return Object.freeze({...s,...(kind==='scenario'?{values:Object.freeze(settings(s.values))}:{})});
    });
  }
  const presets=choices(scenarios,'scenario'), modes=choices(views,'view');
  const lookup=(list,id)=>{
    const choice=list.find(s=>s.id===id);
    if (!choice) throw new Error(`Unknown choice: ${id}`);
    return choice;
  };
  const matches=(s,values)=>Object.entries(s.mode==='replace'?{...base,...s.values}:s.values)
    .every(([k,v])=>Object.is(values[k],v));
  function snapshot(values,view,preferred){
    const scenario=presets.find(s=>s.id===preferred && matches(s,values))
      || presets.find(s=>matches(s,values));
    return Object.freeze({settings:Object.freeze({...values}),view,scenario:scenario?.id || null});
  }
  let initial={...base};
  if (opts.initialScenario) Object.assign(initial,lookup(presets,opts.initialScenario).values);
  let current=snapshot(initial,lookup(modes,opts.initialView || modes[0].id).id,opts.initialScenario);
  const stage=createModelStage({...opts,model:build(current)});
  controls.classList.add('context-controls');
  const buttons=[];
  function group(label,list,select){
    const host=document.createElement('div'); host.className='context-group';
    host.setAttribute('role','group'); host.setAttribute('aria-label',label);
    const name=document.createElement('span'); name.className='context-label'; name.textContent=label;
    host.appendChild(name);
    for (const s of list) {
      const b=document.createElement('button'); b.type='button'; b.className='btn';
      b.textContent=s.label; b.dataset.contextKind=label.toLowerCase(); b.dataset.contextId=s.id;
      b.onclick=()=>select(s.id); buttons.push(b); host.appendChild(b);
    }
    controls.appendChild(host);
  }
  controls.replaceChildren();
  if (presets.length) group('Scenario',presets,id=>api.setScenario(id));
  group('View',modes,id=>api.setViewMode(id));
  const status=document.createElement('span'); status.className='context-status';
  status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  controls.appendChild(status);
  function paint(change={}){
    for (const b of buttons) b.setAttribute('aria-pressed',String(current[b.dataset.contextKind]===b.dataset.contextId));
    status.textContent=[presets.length && !current.scenario?'Custom settings':'',
      change.returned?`Returned to ${change.label}: the previous interior is unavailable in this context.`:'']
      .filter(Boolean).join('. ');
  }
  function commit(values,view,preferred){
    const next=snapshot(values,view,preferred);
    const before=opts.svg.getBoundingClientRect();
    // A failing builder, validator or draw leaves both controls and drawing intact.
    const change=stage.replaceModel(build(next),{preserveCamera:next.view===current.view});
    current=next; paint(change);
    // A wrapped notice can change the stage's height without a window resize.
    const after=opts.svg.getBoundingClientRect();
    if (after.width && after.height && (before.width!==after.width || before.height!==after.height)) {
      const camera=stage.getView();
      stage.setView({...camera,h:camera.w*after.height/after.width});
    }
    onChange?.(current,change);
    return change;
  }
  const api={...stage,
    context:()=>current,
    setScenario(id){
      const s=lookup(presets,id);
      return commit({... (s.mode==='replace'?base:current.settings),...s.values},current.view,id);
    },
    setSettings(values){return commit({...current.settings,...settings(values)},current.view,current.scenario);},
    setViewMode(id){return commit(current.settings,lookup(modes,id).id,current.scenario);},
  };
  // Direct model replacement would bypass context ownership.
  delete api.replaceModel;
  paint(); onChange?.(current,{depth:0,previousDepth:0,returned:false});
  return api;
}
