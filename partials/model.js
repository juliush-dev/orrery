/* A single hierarchy for the drawing, navigation, and interior ownership.
   Include after stage.js. Draw callbacks draw only their own object's geometry;
   Orrery creates object groups, child groups, labels, picking and index rows. */
function validateStageModel(model){
  const stages = new Map(), owners = new Map(), active = new Set(), objects = new Set();
  function visit(stage, owner){
    if (!stage || typeof stage.id !== 'string' || !stage.id ||
        typeof stage.label !== 'string' || !stage.label || !Array.isArray(stage.items))
      throw new Error('Each stage needs a nonempty id, label, and items array');
    if (active.has(stage)) throw new Error(`Stage cycle at ${stage.id}`);
    if (stages.has(stage.id)) {
      if (stages.get(stage.id) !== stage) throw new Error(`Duplicate stage id: ${stage.id}`);
      if (owners.get(stage) !== owner && stage.shared !== true)
        throw new Error(`Interior ${stage.id} has multiple owners; declare shared: true only for intentional sharing`);
      return;
    }
    stages.set(stage.id, stage); owners.set(stage, owner); active.add(stage);
    const ids = new Set();
    function items(list){
      if (!Array.isArray(list)) throw new Error('children must be an array');
      for (const item of list) {
        if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id))
          throw new Error(`Missing or duplicate object id in stage ${stage.id}`);
        ids.add(item.id);
        if (objects.has(item)) throw new Error(`Object ${item.id} is reused in different places; declare distinct objects`);
        objects.add(item);
        if (typeof item.label !== 'string' || !item.label || typeof item.draw !== 'function')
          throw new Error(`Object ${item.id} needs a label and draw(g, item)`);
        if (item.parent != null) throw new Error(`Use children for ${item.id}'s hierarchy, not a separate parent field`);
        if (item.children != null) items(item.children);
        if (item.interior != null) visit(item.interior, item);
      }
    }
    items(stage.items); active.delete(stage);
  }
  visit(model, null);
  return true;
}

function createModelStage(opts){
  let model = opts.model;
  validateStageModel(model);
  if (opts.index || opts.objects || opts.onEnter)
    throw new Error('createModelStage derives index, objects, and onEnter from model; use createStage for custom callbacks');
  if (opts.content.childElementCount)
    throw new Error('createModelStage needs an empty content group');
  const nodes = new WeakMap(), drawn = new WeakMap(), descriptors = new WeakMap();
  const ns = 'http://www.w3.org/2000/svg';
  function drawLevel(host, spec){
    drawn.set(host, spec);
    function drawItems(parent, items, depth){
      for (const item of items) {
        const group = document.createElementNS(ns,'g');
        group.classList.add('orrery-object');
        group.dataset.objectId = item.id;
        group.dataset.modelDepth = String(depth);
        group.setAttribute('aria-label',item.label);
        group.setAttribute('role','button'); group.setAttribute('tabindex','0');
        group.orreryOwner = item;
        parent.appendChild(group); nodes.set(group,item);
        const own = document.createElementNS(ns,'g'); group.appendChild(own);
        item.draw(own,item);
        const box = own.getBBox();
        if (!box.width && !box.height)
          throw new Error(`Object ${item.id} has no drawn geometry; context belongs in the path, not an index row`);
        if (item.children) drawItems(group,item.children,depth+1);
      }
    }
    drawItems(host,spec.items,0);
  }
  function descriptor(spec){
    if (!descriptors.has(spec)) descriptors.set(spec, {
      id:spec.id, label:spec.label, shared:spec.shared,
      objects:'g.orrery-object', draw:g=>{ validateStageModel(model); drawLevel(g,spec); },
      onEnter:node=>{
        const item = nodes.get(node);
        return item?.interior ? descriptor(item.interior) : null;
      },
    });
    return Object.assign(descriptors.get(spec), {id:spec.id,label:spec.label,shared:spec.shared});
  }
  const root = descriptor(model);
  drawLevel(opts.content,model);
  const stage = createStage({...opts,rootLabel:model.label,objects:root.objects,onEnter:root.onEnter});
  return {...stage,
    replaceModel(next, {preserveCamera=true}={}){
      validateStageModel(next);
      const previous=stage.snapshotLevels(), frames=[];
      let spec=next;
      // Match both the owner and interior identity, never just a stage label.
      // All retained ancestors are redrawn so Back cannot restore stale state.
      try {
        for (let i=0;spec;i++) {
          const g=document.createElementNS(ns,'g');
          g.style.visibility='hidden'; opts.content.parentNode.appendChild(g);
          const frame={...descriptor(spec),g,ownerId:previous[i]?.ownerId,
            owner:frames[i-1]?.nextOwner,
            view:preserveCamera ? previous[i]?.view : null};
          frames.push(frame); drawLevel(g,spec);
          if (i) {
            const b=frame.owner.getBBox(), inner=g.getBBox();
            const s=Math.max(1e-6,Math.min((b.width||1)/(inner.width||1),
              (b.height||1)/(inner.height||1))*0.9);
            frame.map={s,x:b.x+b.width/2-s*(inner.x+inner.width/2),
              y:b.y+b.height/2-s*(inner.y+inner.height/2)};
          }
          const old=previous[i+1];
          if (!old || (!i && next.id!==drawn.get(previous[0].g)?.id)) break;
          const owner=[...g.querySelectorAll('.orrery-object')]
            .find(n=>n.dataset.objectId===old.ownerId);
          const interior=nodes.get(owner)?.interior;
          if (!interior || interior.id!==drawn.get(old.g)?.id) break;
          spec=interior;
          // Carry the replacement owner into the next prepared frame.
          frames[i].nextOwner=owner;
        }
      } catch(error) { frames.forEach(f=>f.g.remove()); throw error; }
      model=next;
      stage.replaceLevels(frames);
      drawn.set(opts.content,next);
      return {depth:frames.length-1, previousDepth:previous.length-1,
        returned:frames.length<previous.length,label:frames.at(-1).label};
    },
    enter(node){
      validateStageModel(model);
      const item = nodes.get(node);
      if (item?.interior) stage.enter(node,descriptor(item.interior));
    },
    refresh(){ validateStageModel(model); stage.refresh(); },
    redraw(){
      validateStageModel(model);
      // Settle any transition before replacing the live drawing.
      stage.fit();
      const host = stage.level(), spec = drawn.get(host);
      const draft = document.createElementNS(ns,'g');
      draft.style.visibility = 'hidden'; host.after(draft);
      try { drawLevel(draft,spec); } catch (error) { draft.remove(); throw error; }
      host.replaceChildren(...draft.childNodes); draft.remove();
      stage.refresh(); stage.fit();
    },
  };
}
