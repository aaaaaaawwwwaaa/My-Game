const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clone = x => JSON.parse(JSON.stringify(x));

const state = {
  turn:1, phase:'Placing', active:0, selectedHand:null, selectedDeck:[], customDeck:null, uid:1,
  players:[makePlayer('Player 1'),makePlayer('Player 2')], log:[]
};
function makePlayer(name){return {name,hp:100,kdef:0,deck:[],hand:[],discard:[],board:Array(5).fill(null),bossUsed:new Set()}}

const RULES_HTML = `
<h2>ROTATION — Playtest Rules</h2>
<div class="rules-grid">
<section><h4>Win</h4><p>Reduce the opposing Kingdom from 100 HP to 0.</p></section>
<section><h4>Board</h4><p>Five mirrored lanes. One unit per lane. No diagonals.</p></section>
<section><h4>Turn</h4><p>Draw 2, place cards, then resolve attacks lane 1 → 5. Unit rotations advance when their move resolves, including Multi-Strike bonus activations.</p></section>
<section><h4>Rotation</h4><p>Moves fire TL → TR → BR → BL, skipping empty icons. After the final populated move resolves, the unit discards itself.</p></section>
<section><h4>Empty lane</h4><p>Damage moves hit the enemy Kingdom for their printed O→ value. Pure utility fizzles. Card-specific exceptions override this.</p></section>
<section><h4>Defense</h4><p>Unit Defense absorbs damage and persists. Kingdom Defense is unique: it blocks all incoming Kingdom damage.</p></section>
<section><h4>Deck</h4><p>30 cards. Max 2 copies normal, 1 of each Boss, max 2 Bosses, max 8 Spells, min 20 Units (Bosses count).</p></section>
<section><h4>Multi-Strike</h4><p>Immediately fires the next move of an adjacent allied unit (favor right) and advances that unit's rotation normally.</p></section>
</div>`;

function defaultDeck(){
  const names=['Orc','Orc Champion','Deamon','Orc Wizard','Determined Warrior','Deamon Jouster','Electro Orc','Heaven Archer','Grandma Orc','Drunk Idiot','Hydra','Necromancer','Zombie of Order','Vomit Bomber','Orc Giant','The Incubus','Marvin the Miner','Grad Orc','Frost Warden','Yeti','The Inquisitor','Soul Revenant','Soothsayer','Orc Hunter','Shadow Stalker','Healing Potion','Damage Potion','Inferno Burst'];
  const deck=[];
  names.forEach(n=>{const c=CARD_LIBRARY.find(x=>x.name===n); if(c) deck.push(clone(c));});
  // Add bosses and duplicate two safe normals to reach 30.
  ['Abyssal Overlord','King Orc','Orc','Deamon'].forEach(n=>{const c=CARD_LIBRARY.find(x=>x.name===n); if(c) deck.push(clone(c));});
  return deck.slice(0,30);
}

function instantiate(card, owner){
  const u=clone(card); u.owner=owner; u.uid=state.uid++; u.maxHp=u.hp; u.currentHp=u.hp; u.armor=0; u.rot=0; u.statuses={burn:[],poison:[],plague:[],shock:0,freeze:0,purify:0,healBlock:0,disorient:0,inspire:0,invulnerable:0,rust:0,etherealBoost:0,antiDefend:0}; u.kills=0; u.timeWarped=false; u.sinLocked=false; u.gxMultiplyUsed=false; return u;
}

function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function log(msg,cls=''){state.log.push({msg,cls});renderLog()}
function allUnits(){return state.players.flatMap(p=>p.board.filter(Boolean))}
function sameTypeInPlay(unit){return allUnits().some(u=>u!==unit && u.types.some(t=>unit.types.includes(t)))}
function enemyIndex(i){return i===0?1:0}
function currentPlayer(){return state.players[state.active]}
function otherPlayer(){return state.players[enemyIndex(state.active)]}

function setupMatch(deck1=state.customDeck||defaultDeck(),deck2=defaultDeck()){
  state.turn=1;state.phase='Placing';state.active=0;state.selectedHand=null;state.log=[];
  state.players=[makePlayer('Player 1'),makePlayer('Player 2')];
  [deck1,deck2].forEach((deck,i)=>{state.players[i].deck=shuffle(deck.map(c=>clone(c)));draw(i,5,false);draw(i,2,false)});
  show('gameScreen');log('Round 1 started. Both players drew 2 cards. Player 1 places first.','system');render();
}
function draw(pi,n,announce=true){const p=state.players[pi];for(let i=0;i<n;i++){if(p.deck.length)p.hand.push(p.deck.shift());else if(announce)log(`${p.name} tried to draw from an empty deck.`,'system')}}

function show(id){$$('.screen').forEach(x=>x.classList.remove('active'));$('#'+id).classList.add('active')}
function render(){renderBoard();renderHand();renderHUD();}
function renderHUD(){
  $('#turnNumber').textContent=state.turn;$('#activePlayerLabel').textContent=currentPlayer().name;$('#phaseLabel').textContent=state.phase;$('#handTitle').textContent=`${currentPlayer().name} Hand`;
  state.players.forEach((p,i)=>{const n=i+1;$('#p'+n+'Hp').textContent=Math.max(0,p.hp);$('#p'+n+'KDef').textContent=p.kdef;$('#p'+n+'Deck').textContent=p.deck.length;$('#p'+n+'Discard').textContent=p.discard.length;$('#p'+n+'KingdomFill').style.width=Math.max(0,Math.min(100,p.hp))+'%'});
  $('#endPlacementBtn').disabled=state.phase!=='Placing';$('#endPlacementBtn').textContent=state.phase==='Placing'?(state.active===0?'Finish P1 Placement':'Finish P2 Placement'):'Resolving...';
}
function cardMarkup(c,opts={}){
  const moves=c.kind==='Spell'?`<div class="gx-box">${c.text||''}</div>`:`<div class="move-list">${(c.moves||[]).map((m,i)=>`<div>${i+1}. ${m[0]} ${m[1]||''}${m[2]?` · ${m[2]}`:''}</div>`).join('')}</div>${c.gx?`<div class="gx-box"><b>GX — ${c.gx.name}</b><br>${c.gx.text}</div>`:''}`;
  return `<div class="card-kind">${c.kind.toUpperCase()}</div><div class="card-top"><span>${c.name}</span>${c.hp?`<span class="hp">${c.hp} HP</span>`:''}</div><div class="type-row">${(c.types||[]).map(t=>`<span class="type">${t}</span>`).join('')}${c.kind==='Boss'?'<span class="boss-tag">BOSS</span>':''}</div>${moves}`
}
function renderHand(){
  const hand=$('#hand');hand.innerHTML='';currentPlayer().hand.forEach((c,i)=>{const el=document.createElement('div');el.className='card'+(state.selectedHand===i?' selected':'');el.innerHTML=cardMarkup(c)+`<div class="play-hint">${c.kind==='Spell'?'Click to cast':'Select, then choose an open lane'}</div>`;el.onclick=()=>{if(state.phase!=='Placing')return;state.selectedHand=i; if(c.kind==='Spell') castSpellFromHand(i); else render()};hand.appendChild(el)})
}
function renderBoard(){
  [0,1].forEach(pi=>{const root=$('#p'+(pi+1)+'Board');root.innerHTML='';state.players[pi].board.forEach((u,lane)=>{const el=document.createElement('div');el.className='lane';el.dataset.player=pi;el.dataset.lane=lane;if(!u){el.onclick=()=>placeSelected(pi,lane);el.innerHTML='<div class="muted" style="margin:auto;font-size:11px">OPEN</div>'}else{const next=u.moves[u.rot];el.innerHTML=`<div class="unit-card"><div class="unit-head"><span>${u.name}</span><span class="hp">${u.currentHp}/${u.maxHp}</span></div><div class="unit-sub"><span>${u.types.join(' + ')}</span><span class="armor">DEF ${u.armor}</span></div><div class="unit-next">Next: ${next?next[0]+' '+(next[1]||''):'—'}</div><div class="statuses">${statusMarkup(u)}</div><div class="rot-track">${[0,1,2,3].map(x=>`<span class="rot-dot ${x<u.rot?'done':''} ${x===u.rot?'next':''}"></span>`).join('')}</div><div class="board-card-actions">${u.kind==='Boss'&&u.bossAbility?`<button data-boss="1">Boss Ability</button>`:''}<button data-view="1">View</button></div></div>`;el.querySelector('[data-view]')?.addEventListener('click',e=>{e.stopPropagation();openModal(cardMarkup(u))});el.querySelector('[data-boss]')?.addEventListener('click',e=>{e.stopPropagation();useBossAbility(pi,lane)});}
    root.appendChild(el)})})
}
function statusMarkup(u){const s=u.statuses,arr=[];if(u.armor)arr.push(`DEF ${u.armor}`);if(s.burn.length)arr.push('Burn');if(s.poison.length)arr.push('Poison');if(s.plague.length)arr.push('Plague');if(s.shock)arr.push(`Shock ${s.shock}`);if(s.freeze)arr.push(`Freeze ${s.freeze}`);if(s.purify)arr.push(`Purify ${s.purify}`);if(s.healBlock)arr.push('No Heal');if(s.disorient)arr.push(`-${s.disorient} DMG`);if(s.invulnerable)arr.push('Invulnerable');if(s.rust)arr.push('Rust');if(u.sinLocked)arr.push('Sin-bound');return arr.map(x=>`<span class="status-chip">${x}</span>`).join('')}
function renderLog(){const root=$('#combatLog');root.innerHTML=[...state.log].reverse().map(x=>`<div class="${x.cls}">${x.msg}</div>`).join('')}

function placeSelected(pi,lane){if(state.phase!=='Placing'||pi!==state.active||state.selectedHand==null)return;const p=currentPlayer();const card=p.hand[state.selectedHand];if(!card||card.kind==='Spell'||p.board[lane])return;p.hand.splice(state.selectedHand,1);p.board[lane]=instantiate(card,state.active);log(`${p.name} placed ${card.name} in lane ${lane+1}.`,'good');state.selectedHand=null;render()}

function castSpellFromHand(i){const p=currentPlayer(),card=p.hand[i]; if(!card||card.kind!=='Spell')return;p.hand.splice(i,1);p.discard.push(card);resolveSpell(card,state.active);state.selectedHand=null;render()}
function resolveSpell(c,pi){const allies=state.players[pi].board, enemies=state.players[enemyIndex(pi)].board;
  const healAll=n=>allies.filter(Boolean).forEach(u=>healUnit(u,n,true)); const dmgAll=n=>enemies.filter(Boolean).forEach(u=>damageUnit(u,n,null));
  if(c.effect==='healAll5')healAll(5); else if(c.effect==='damageAll5')dmgAll(5); else if(c.effect==='infernoBurst'){enemies.filter(Boolean).forEach(u=>{damageUnit(u,3,null);applyBurn(u,2,null)})} else if(c.effect==='confusion')enemies.filter(Boolean).forEach(u=>{u.armor=0;u.statuses.disorient+=3}); else if(c.effect==='thunderclap')enemies.filter(Boolean).slice(0,3).forEach(u=>u.statuses.shock=Math.max(u.statuses.shock,Math.min(2,u.kind==='Boss'?1:2))); else if(c.effect==='graveyardPotion'){const p=state.players[pi];const idx=[...p.discard].reverse().findIndex(x=>x.kind!=='Spell');if(idx>=0){const real=p.discard.length-1-idx;const base=p.discard.splice(real,1)[0];const open=p.board.findIndex(x=>!x);if(open>=0){const u=instantiate(base,pi);u.currentHp=Math.max(1,u.currentHp-2);u.maxHp=u.currentHp;p.board[open]=u}}}
  log(`${state.players[pi].name} cast ${c.name}.`,'system')
}

function kingdomDamage(pi,amount){const p=state.players[pi];amount=Math.max(0,Math.floor(amount));const blocked=Math.min(p.kdef,amount);p.kdef-=blocked;amount-=blocked;p.hp-=amount;log(`${p.name}'s Kingdom takes ${amount}${blocked?` (${blocked} blocked)`:''}.`,'hit');checkWin()}
function damageUnit(u,amount,source,{pierce=false,ignoreInvuln=false,linkEcho=false}={}){amount=Math.max(0,Math.floor(amount));if(u.sinLocked&&source&&source.owner!==u.owner){log(`${u.name} is protected by Sin from enemy damage.`,'system');return 0}if(!ignoreInvuln&&(u.statuses.invulnerable||u.ultraShockSafe)){log(`${u.name} is invulnerable.`,'system');return 0}if(u.statuses.rust&&source){log(`${u.name} reflects ${amount} damage!`,'system');return damageUnit(source,amount,u,{ignoreInvuln:true})}let hpDmg=amount;if(!pierce){const blocked=Math.min(u.armor,hpDmg);u.armor-=blocked;hpDmg-=blocked}u.currentHp-=hpDmg;log(`${u.name} takes ${hpDmg}${!pierce&&amount-hpDmg?` (${amount-hpDmg} blocked)`:''}.`,'hit');if(u.soulLink&&!linkEcho&&u.soulLink.other&&allUnits().includes(u.soulLink.other))damageUnit(u.soulLink.other,hpDmg,source,{pierce:true,linkEcho:true});if(u.currentHp<=0)killUnit(u,source);return hpDmg}
function healUnit(u,n,cleanse=false,linkEcho=false){if(u.kind==='Boss'||u.statuses.healBlock)return;if(cleanse)clearNegative(u);u.currentHp+=n;if(u.currentHp>u.maxHp)u.maxHp=u.currentHp;log(`${u.name} heals ${n}.`,'good');if(u.soulLink&&!linkEcho&&u.soulLink.other&&allUnits().includes(u.soulLink.other))healUnit(u.soulLink.other,n,cleanse,true)}
function clearNegative(u){u.statuses.burn=[];u.statuses.poison=[];u.statuses.plague=[];u.statuses.shock=0;u.statuses.freeze=0;u.statuses.disorient=0;u.statuses.healBlock=0}
function killUnit(u,source){for(let pi=0;pi<2;pi++){const lane=state.players[pi].board.indexOf(u);if(lane>=0){state.players[pi].board[lane]=null;state.players[pi].discard.push(stripRuntime(u));if(source){source.kills=(source.kills||0)+1;if(source.name==='Scarlet King'){state.players[source.owner].kdef+=3;state.players[source.owner].board.filter(Boolean).forEach(a=>{a.currentHp+=1;if(a.currentHp>a.maxHp)a.maxHp=a.currentHp})}}if(u.name==='Hydra'&&!u.gxMultiplyUsed){const p=state.players[pi];let created=0;for(let k=0;k<5&&created<2;k++)if(!p.board[k]){const h=instantiate(CARD_LIBRARY.find(c=>c.name==='Hydra'),pi);h.gxMultiplyUsed=true;p.board[k]=h;created++}}log(`${u.name} was discarded.`,'system');return}}}
function stripRuntime(u){const c=CARD_LIBRARY.find(x=>x.name===u.name);return c?clone(c):{name:u.name,kind:u.kind,types:u.types,hp:u.maxHp,moves:u.moves}}

function applyBurn(u,val,source){if(u.statuses.purify)return;u.statuses.burn.push({val,turns:2,sourceUid:source?.uid??null})}
function applyPoison(u,val){if(u.statuses.purify)return;val=Math.min(3,val);u.statuses.poison.push({base:val,turns:val,step:0})}
function applyPlague(u,val,source){if(u.statuses.purify)return;u.statuses.plague.push({val,turns:2,sourceOwner:source?.owner??null})}
function applyStatus(u,type,val,source){if(u.statuses.purify&&['shock','freeze','disorient','healBlock'].includes(type))return;if(u.statuses.rust&&source){if(type==='shock'||type==='freeze'||type==='disorient'){applyStatus(source,type,val,u)}else damageUnit(source,3,u);return}if(type==='shock')u.statuses.shock=Math.max(u.statuses.shock,u.kind==='Boss'?1:val);if(type==='freeze')u.statuses.freeze=Math.max(u.statuses.freeze,val);if(type==='disorient'){u.armor=0;u.statuses.disorient+=val}if(type==='healBlock')u.statuses.healBlock=Math.max(u.statuses.healBlock,val)}

function endPlacement(){if(state.phase!=='Placing')return;if(state.active===0){state.active=1;state.selectedHand=null;log('Player 1 finished placement. Player 2 may now place cards.','system');render();return}state.phase='Attack';renderHUD();log(`Attack period begins.`,'system');resolveAttackPeriod()}
async function resolveAttackPeriod(){for(let lane=0;lane<5;lane++){for(let pi=0;pi<2;pi++){const u=state.players[pi].board[lane];if(u)resolveUnitMove(pi,lane,u)}render();await new Promise(r=>setTimeout(r,180))}endRound()}
function resolveUnitMove(pi,lane,u,bonus=false){if(!state.players[pi].board.includes(u))return;if(u.sinLocked){log(`${u.name} is Sin-bound and cannot attack.`,'system');return}if(u.statuses.freeze>0){log(`${u.name}'s rotation is frozen.`,'system');return}const move=u.moves[u.rot];if(!move)return;const [type,val]=move;if(u.statuses.shock>0){log(`${u.name}'s ${type} is Shocked and produces no effect.`,'system')}else{resolveMove(pi,lane,u,type,val,move[2],bonus)}if(u.statuses.etherealBoost&&isDamageMove(type)&&type!=='Ethereal Shift')u.statuses.etherealBoost=0;advanceRotation(pi,u)}
function advanceRotation(pi,u){if(!state.players[pi].board.includes(u))return;u.rot++;if(u.rot>=u.moves.length){log(`${u.name} completed its rotation.`,'system');killUnit(u,null)}}
function movePower(u,val){const finalBoost=(u.rot===u.moves.length-1?(u.corruptionBoost||0):0);return Math.max(0,val-(u.statuses.disorient||0)+(u.statuses.inspire||0)+(u.statuses.etherealBoost||0)+(u.permBoost||0)+finalBoost)}
function targetFront(pi,lane){return state.players[enemyIndex(pi)].board[lane]}
function resolveMove(pi,lane,u,type,val,label,bonus){const enemy=state.players[enemyIndex(pi)],ally=state.players[pi],target=targetFront(pi,lane);const power=movePower(u,val||0);const hitFront=(amount,{pierce=false,emptyKingdom=true}={})=>{const t=targetFront(pi,lane);if(t)damageUnit(t,amount,u,{pierce});else if(emptyKingdom)kingdomDamage(enemyIndex(pi),amount)};
  log(`${u.name} uses ${type}${val!==undefined&&val!==0?' '+val:''}${bonus?' (bonus)':''}.`,'system');
  switch(type){
    case'Damage':hitFront(power);break; case'Self Damage':damageUnit(u,val,u,{ignoreInvuln:true});break;
    case'Bullseye':hitFront(Math.max(0,power+(sameTypeInPlay(u)?3:0)),{pierce:true});break;
    case'Defend':if(u.antiDefendAffected){u.currentHp=Math.max(1,u.currentHp-val);log(`${u.name}'s Defend became self-damage.`,'hit')}else{u.armor+=val;log(`${u.name} gains ${val} Defense.`,'good')}break;
    case'Burn':if(target)applyBurn(target,val,u);else kingdomDamage(enemyIndex(pi),val);break;
    case'Hell Flame':{const bosses=enemy.board.map((x,i)=>x&&x.kind==='Boss'?{x,i}:null).filter(Boolean);if(bosses.length){bosses.sort((a,b)=>Math.abs(a.i-lane)-Math.abs(b.i-lane)||b.i-a.i);damageUnit(bosses[0].x,val*2,u)}else damageUnit(u,1,u,{ignoreInvuln:true});break}
    case'Joust':if(target){if(target.armor>0)damageUnit(target,target.armor+val,u);else damageUnit(target,val,u)}else kingdomDamage(enemyIndex(pi),val);break;
    case'Holy Blade':hitFront(power);if(allUnits().some(x=>x.types.includes('Deamon')))[lane-1,lane+1].forEach(i=>{if(ally.board[i])ally.board[i].armor+=3+val});break;
    case'Shock':if(target)applyStatus(target,'shock',Math.min(2,val),u);break;
    case'Heal':healUnit(u,val,true);break;
    case'Drill':if(enemy.board.some(x=>x&&x.armor>0))enemy.board.filter(Boolean).forEach(x=>damageUnit(x,power,u));break;
    case'Barrier':[lane-1,lane+1].forEach(i=>{if(ally.board[i])ally.board[i].armor+=val});break;
    case'Death':{const matches=enemy.board.filter(x=>x&&x.types.some(t=>u.types.includes(t))).slice(0,val);matches.forEach(x=>damageUnit(x,5+power,u));break}
    case'Sin':resolveSin(pi,val);break;
    case'Disorientation':if(target)applyStatus(target,'disorient',val,u);break;
    case'Poison':if(target)applyPoison(target,val);else kingdomDamage(enemyIndex(pi),val);break;
    case'Multi-Strike':resolveMultiStrike(pi,lane,u);break;
    case'Wither':if(target){target.rot=Math.min(target.moves.length,target.rot+Math.min(2,val));if(target.rot>=target.moves.length)killUnit(target,null)}break;
    case'Corruption':damageUnit(u,val,u,{ignoreInvuln:true});if(ally.board.includes(u)){if(u.rot===u.moves.length-1)hitFront(val+2);else u.corruptionBoost=(u.corruptionBoost||0)+val}break;
    case'Summon':resolveSummon(pi);break;
    case'Anti-Defend':allUnits().forEach(x=>x.antiDefendAffected=true);break;
    case'Rust':u.statuses.rust=1;break;
    case'Blindness':if(target)resolveBlindness(target,Math.min(2,val),pi);else kingdomDamage(pi,val);break;
    case'Vampirism':if(target){const dealt=damageUnit(target,val,u,{pierce:true});u.currentHp+=dealt;if(u.currentHp>u.maxHp)u.maxHp=u.currentHp}else damageUnit(u,2,u,{ignoreInvuln:true});break;
    case'Holy Burn':if(target){damageUnit(target,target.types.includes('Chaos')?5:0,u,{pierce:true});applyBurn(target,val,u)}else kingdomDamage(enemyIndex(pi),val);break;
    case'Plague':if(target)applyPlague(target,val,u);else kingdomDamage(enemyIndex(pi),val);break;
    case'Graveyard':enemy.board.filter(Boolean).forEach(x=>damageUnit(x,val+(x.armor||3),u));break;
    case'Purify':u.statuses.purify=Math.max(u.statuses.purify,val);break;
    case'Enchant':{const cand=[lane+1,lane-1].filter(i=>ally.board[i]);if(cand.length){const a=ally.board[cand[0]];if(a.moves.some(m=>isDamageMove(m[0])))a.permBoost=(a.permBoost||0)+val;else{a.currentHp+=val;a.maxHp+=val}}break}
    case'Enlighten':hitFront(power+u.currentHp);break;
    case'Inspire':ally.board.filter(Boolean).forEach(a=>{if(a.moves.some(m=>isDamageMove(m[0]))){a.statuses.inspire=Math.max(a.statuses.inspire,val);a.armor+=val}else a.armor+=4});break;
    case'Rage':hitFront(power+(u.maxHp-u.currentHp));break;
    case'Soul Link':{const targets=enemy.board.filter(Boolean).slice(0,2);if(targets.length===2){targets[0].soulLink={other:targets[1],turns:val};targets[1].soulLink={other:targets[0],turns:val}}break}
    case'Echoing Strike':for(let i=0;i<5;i++){const x=enemy.board[i];if(x){const d=Math.max(0,val-Math.abs(i-lane));if(d)damageUnit(x,d,u)}}break;
    case'Ethereal Shift':damageUnit(u,5,u,{ignoreInvuln:true});if(ally.board.includes(u)){u.statuses.invulnerable=1;u.statuses.etherealBoost=3}break;
    case'Time Warp':resolveTimeWarp(pi,lane,val);break;
    case'Conjure':u.currentHp+=val;u.maxHp=Math.max(u.maxHp,u.currentHp);break;
    case'Frost Strike':if(target){damageUnit(target,power,u);applyStatus(target,'freeze',1,u)}else kingdomDamage(enemyIndex(pi),val);break;
    case'Freeze':if(target)applyStatus(target,'freeze',val,u);break;
    case'Shadow Strike':if(target){damageUnit(target,power,u);applyStatus(target,'healBlock',2,u)}else kingdomDamage(enemyIndex(pi),val);break;
    case'GX':resolveGX(pi,lane,u);break;
  }
}
function isDamageMove(t){return !['Defend','Heal','Shock','Barrier','Sin','Summon','Anti-Defend','Rust','Purify','Enchant','Inspire','Soul Link','Conjure','Freeze'].includes(t)}
function resolveMultiStrike(pi,lane,u){const p=state.players[pi];let idx=null;if(p.board[lane+1])idx=lane+1;else if(p.board[lane-1])idx=lane-1;if(idx==null)return;const adj=p.board[idx];resolveUnitMove(pi,idx,adj,true)}
function resolveSin(pi,val){const p=state.players[pi];const idx=[...p.discard].reverse().findIndex(x=>x.kind!=='Spell');if(idx<0)return;const real=p.discard.length-1-idx;const base=p.discard.splice(real,1)[0];const open=p.board.findIndex(x=>!x);if(open<0){p.discard.push(base);return}const u=instantiate(base,pi);u.sinLocked=true;p.board[open]=u;log(`${base.name} returns through Sin and cannot attack.`,'good')}
function resolveSummon(pi){const p=state.players[pi];if(p.summonActive)return;const idx=[...p.discard].reverse().findIndex(x=>x.kind!=='Spell');if(idx<0)return;const open=p.board.findIndex(x=>!x);if(open<0)return;const real=p.discard.length-1-idx;const base=p.discard.splice(real,1)[0];p.board[open]=instantiate(base,pi);p.summonActive=true;kingdomDamage(pi,3)}
function resolveBlindness(target,count,casterPi){const owner=target.owner;for(let k=0;k<count;k++){if(!state.players[owner].board.includes(target))break;const lane=state.players[owner].board.indexOf(target);const allies=state.players[owner].board.map((x,i)=>({x,i})).filter(o=>o.x&&o.x!==target);if(!allies.length){kingdomDamage(owner,1);advanceRotation(owner,target);continue}const victim=allies[0].x;const move=target.moves[target.rot];if(!move)break;if(isDamageMove(move[0]))damageUnit(victim,Math.max(1,move[1]||1),target);advanceRotation(owner,target)}}
function resolveTimeWarp(pi,lane,val){const p=state.players[pi];const candidates=p.board.filter(x=>x&&x!==p.board[lane]&&!x.timeWarped);const t=candidates[0];if(!t)return;t.rot=Math.max(0,t.rot-Math.min(2,val));t.currentHp-=t.kind==='Boss'?6:3;t.statuses.disorient+=(t.kind==='Boss'?8:4);t.timeWarped=true;if(t.currentHp<=0)killUnit(t,null)}

function resolveGX(pi,lane,u){const e=enemyIndex(pi),p=state.players[pi],op=state.players[e],front=op.board[lane],fx=u.gx?.effect;if(!fx)return;
 const allE=()=>op.board.filter(Boolean),allA=()=>p.board.filter(Boolean),frontD=n=>front?damageUnit(front,n,u):kingdomDamage(e,n);
 switch(fx){case'princessRage':frontD(7);{const victim=allA().find(x=>x!==u&&x.types.includes('Orc'));if(victim)killUnit(victim,null);else killUnit(u,null)}break;case'eyeOfHell':allUnits().filter(x=>x.types.includes('Orc')&&x.kind!=='Boss').forEach(x=>killUnit(x,u));if(p.board.includes(u))damageUnit(u,5,u,{ignoreInvuln:true});break;case'kingOrcGX':allUnits().slice().forEach(x=>killUnit(x,u));kingdomDamage(pi,5);break;case'front9':frontD(9);break;case'immortal':{const a=allA().find(x=>x!==u&&x.kind!=='Boss');if(a)a.statuses.invulnerable=1;break}case'juggernaut':allE().forEach(x=>damageUnit(x,6,u));kingdomDamage(pi,3);allA().forEach(x=>x.armor+=3);break;case'frontDisorient2':if(front)applyStatus(front,'disorient',2,u);break;case'chaosTime':allE().forEach(x=>{damageUnit(x,7,u);applyStatus(x,'shock',1,u)});break;case'cookies':if(allE().some(x=>x.types.includes('Orc')))frontD(13);break;case'poisonReaper':allE().slice(0,3).forEach(x=>applyPoison(x,2));break;case'stomp':frontD(5);[lane-1,lane+1].forEach(i=>{if(op.board[i])damageUnit(op.board[i],2,u)});break;case'graveyardGang':kingdomDamage(e,3*allUnits().filter(x=>x.types.includes('Chaos')).length);break;case'armageddon':if(!allUnits().some(x=>x.types.includes('Order')))frontD(13);break;case'blackHole':if(front&&front.kind!=='Boss'&&!front.types.includes('Chaos')&&!front.types.includes('Order'))killUnit(front,u);break;case'valkyries':frontD(3*allE().filter(x=>x.types.some(t=>['Order','Chaos','Deamon'].includes(t))).length);if(allE().some(x=>x.types.includes('Forsaken')))kingdomDamage(e,1);break;case'grandIncantus':{const pool=CARD_LIBRARY.filter(c=>c.types?.includes('Forsaken'));const c=pool[0];const open=p.board.findIndex(x=>!x);if(c&&open>=0){const x=instantiate(c,pi);x.statuses.freeze=1;p.board[open]=x}}break;case'fatMan':{const units=allE();if(units.length){units.sort((a,b)=>a.currentHp-b.currentHp);const victim=units[0],vlane=op.board.indexOf(victim);killUnit(victim,u);[vlane-1,vlane+1].forEach(i=>{if(op.board[i])applyPoison(op.board[i],3)})}}break;case'beheading':allUnits().slice().forEach(x=>damageUnit(x,15,u));break;case'windup':{const orcs=allUnits().filter(x=>x.types.includes('Orc')).length;frontD(3*Math.pow(2,Math.min(2,orcs)));break}case'forsakenReturn':allE().forEach(x=>damageUnit(x,2,u));break;case'harvester':{let n=0;allUnits().forEach(x=>{if(x.types.includes('Order'))n+=7;if(x.types.includes('Forsaken'))n+=6;if(x.types.includes('Orc'))n+=8});if(front)damageUnit(front,n,u);else damageUnit(u,n,u,{ignoreInvuln:true});break}case'carelessWhisper':if(allUnits().some(x=>x.kind==='Boss')){allUnits().slice().forEach(x=>damageUnit(x,10,u));allUnits().filter(x=>x.kind==='Boss').slice().forEach(x=>killUnit(x,u))}break;case'caveIn':allUnits().filter(x=>x.armor>0).slice().forEach(x=>killUnit(x,u));kingdomDamage(pi,5);break;case'twistedCurse':if(front){front.rot=Math.min(front.moves.length,front.rot+2);if(allUnits().some(x=>x.name==='Necromancer'))[lane-1,lane+1].forEach(i=>{if(op.board[i])op.board[i].rot=Math.min(op.board[i].moves.length,op.board[i].rot+2)})}break;case'maw':allE().forEach(x=>{if(x.types.includes('Order')||x.types.includes('Orc'))applyBurn(x,2,u)});if(allUnits().some(x=>x.types.includes('Chaos')&&x.types.includes('Deamon')))kingdomDamage(e,5);break;case'immaculate':killUnit(u,null);allA().forEach(x=>x.armor+=4);allE().forEach(x=>applyBurn(x,2,null));break;case'rescue':allA().forEach(x=>{x.armor+=2;healUnit(x,2,true)});break;case'antiGod':allE().forEach(x=>{if(x.armor>0||x.moves.some(m=>m[0]==='Bullseye'))applyBurn(x,3,u)});break;case'skellyGang':allUnits().filter(x=>x.types.includes('Forsaken')||x.types.includes('Order')).forEach(x=>damageUnit(x,5,u));break;case'godlyRage':allE().forEach(x=>damageUnit(x,5,u));allA().forEach(x=>{x.currentHp+=(u.kills||0);x.maxHp=Math.max(x.maxHp,x.currentHp);x.armor+=(u.kills||0)});break;case'lastStand':allE().forEach(x=>{damageUnit(x,3,u);if(x.types.includes('Deamon'))applyBurn(x,2,u);if(x.types.includes('Soul Bound'))applyPoison(x,2)});break;case'towerGX':frontD(20);kingdomDamage(pi,7);let deaths=0;allA().filter(x=>x!==u).slice().forEach(x=>{const before=p.board.includes(x);damageUnit(x,10,u,{ignoreInvuln:true});if(before&&!p.board.includes(x))deaths++});if(deaths)kingdomDamage(pi,deaths);break;case'massRemedy':allA().forEach(x=>healUnit(x,4,true));break;case'cheer':allA().forEach(x=>{x.currentHp+=2;x.maxHp=Math.max(x.maxHp,x.currentHp)});kingdomDamage(e,1);break;case'riseCount':allUnits().filter(x=>x.types.includes('Order')).forEach(x=>damageUnit(x,3,u));allA().forEach(x=>healUnit(x,3,false));break;case'cataclysm':allE().forEach(x=>{damageUnit(x,5,u);applyPoison(x,2)});allA().forEach(x=>x.statuses.purify=Math.max(x.statuses.purify,2));{const hi=allE().sort((a,b)=>b.currentHp-a.currentHp)[0];if(hi)applyBurn(hi,1,u)}break;case'chaosStorm':allE().forEach(x=>damageUnit(x,(x.types.includes('Chaos')||x.types.includes('Deamon'))?7:4,u));break;case'abyssGX':frontD(7);kingdomDamage(e,5);break;}
}

function useBossAbility(pi,lane){if(pi!==state.active||state.phase!=='Placing')return;const u=state.players[pi].board[lane];if(!u?.bossAbility)return;if(u.bossAbility.used){log(`${u.name}'s Boss Ability has already been used.`,'system');return}u.bossAbility.used=true;const fx=u.bossAbility.effect,p=state.players[pi],op=state.players[enemyIndex(pi)];
 if(fx==='sendTroops'){const candidates=p.deck.map((c,i)=>({c,i})).filter(o=>o.c.types?.includes('Orc')&&o.c.kind!=='Boss');for(let n=0;n<3;n++){const open=p.board.findIndex(x=>!x);if(open<0||!candidates.length)break;const pick=candidates.shift();const real=p.deck.findIndex(c=>c.name===pick.c.name);const c=p.deck.splice(real,1)[0];p.board[open]=instantiate(c,pi)}}
 else if(fx==='ultraShock'){op.board.filter(Boolean).forEach(x=>{x.statuses.shock=Math.max(x.statuses.shock,1);x.ultraShockSafe=1})}
 else if(fx==='doom')allUnits().filter(x=>x.types.includes('Order')).forEach(x=>damageUnit(x,15,u));
 else if(fx==='cursedArchAngel'){const t=op.board[lane];if(t){const hp=Math.max(1,t.currentHp),count=op.board.filter(Boolean).length;killUnit(t,u);p.board.filter(Boolean).forEach(a=>{a.currentHp+=hp*count;a.maxHp=Math.max(a.maxHp,a.currentHp)});killUnit(u,null)}}
 else if(fx==='solomon')p.kdef+=3;
 else if(fx==='literalHell'){op.board.filter(Boolean).forEach(x=>applyBurn(x,5,u));p.board.filter(Boolean).forEach(x=>x.armor+=5)}
 else if(fx==='godOfWar')allUnits().filter(x=>x.types.includes('Order')||x.types.includes('Enlightened')).forEach(x=>damageUnit(x,7,u));
 else if(fx==='abyssAbility'){p.board.filter(Boolean).forEach(x=>{x.armor+=2;healUnit(x,3,false)});op.board.filter(Boolean).forEach(x=>{damageUnit(x,2,u);applyPoison(x,3)})}
 log(`${u.name} uses Boss Ability: ${u.bossAbility.name}.`,'system');render();
}

function tickStatuses(){for(let pi=0;pi<2;pi++){const p=state.players[pi];for(let lane=0;lane<5;lane++){const u=p.board[lane];if(!u)continue;
  for(const b of [...u.statuses.burn]){if(b.sourceUid!=null&&!allUnits().some(x=>x.uid===b.sourceUid)){u.statuses.burn.splice(u.statuses.burn.indexOf(b),1);continue}damageUnit(u,b.val,null);b.turns--;if(b.turns<=0)u.statuses.burn.splice(u.statuses.burn.indexOf(b),1);if(!p.board[lane])break}
  if(!p.board[lane])continue;for(const z of [...u.statuses.poison]){const d=z.base*Math.pow(2,z.step);damageUnit(u,d,null);z.step++;z.turns--;if(z.turns<=0)u.statuses.poison.splice(u.statuses.poison.indexOf(z),1);if(!p.board[lane])break}
  if(!p.board[lane])continue;for(const g of [...u.statuses.plague]){const before=u.currentHp;damageUnit(u,g.val,null);g.turns--;if(!p.board[lane]){const adj=p.board[lane+1]||p.board[lane-1];if(adj)applyPlague(adj,g.val,null);break}if(g.turns<=0)u.statuses.plague.splice(u.statuses.plague.indexOf(g),1)}
  if(!p.board[lane])continue;['shock','purify','healBlock','invulnerable','rust'].forEach(k=>{if(u.statuses[k]>0)u.statuses[k]--});if(u.statuses.freeze>0){u.statuses.freeze--;if(u.statuses.freeze===0)u.statuses.disorient+=3}if(u.ultraShockSafe)u.ultraShockSafe=0;if(u.soulLink){u.soulLink.turns--;if(u.soulLink.turns<=0)delete u.soulLink} }
 }}
function endRound(){tickStatuses();state.phase='Placing';state.active=0;state.turn++;draw(0,2);draw(1,2);state.selectedHand=null;allUnits().forEach(x=>x.antiDefendAffected=false);log(`Round ${state.turn} begins. Both players draw 2; Player 1 places first.`,'system');render()}
function checkWin(){const loser=state.players.findIndex(p=>p.hp<=0);if(loser>=0){openModal(`<div class="eyebrow">MATCH OVER</div><div class="winner">${state.players[enemyIndex(loser)].name} wins!</div><p>The enemy Kingdom has fallen.</p><button class="btn primary" onclick="location.reload()">Return to title</button>`);return true}return false}

function buildDeckUI(){const types=[...new Set(CARD_LIBRARY.flatMap(c=>c.types||[]))].sort();$('#typeFilter').innerHTML='<option value="">All types</option>'+types.map(t=>`<option>${t}</option>`).join('');renderLibrary();renderDeckSummary()}
function renderLibrary(){const q=$('#searchCards').value.toLowerCase(),tf=$('#typeFilter').value,kf=$('#kindFilter').value;const root=$('#cardLibrary');root.innerHTML='';CARD_LIBRARY.filter(c=>(!q||c.name.toLowerCase().includes(q))&&(!tf||c.types?.includes(tf))&&(!kf||(kf==='Unit'?c.kind==='Unit':c.kind===kf))).forEach(c=>{const count=state.selectedDeck.filter(x=>x.name===c.name).length;const el=document.createElement('div');el.className='card';el.innerHTML=(count?`<div class="count-badge">${count}</div>`:'')+cardMarkup(c)+`<button class="btn primary">Add</button>`;el.querySelector('button').onclick=()=>addToDeck(c);root.appendChild(el)})}
function addToDeck(c){if(state.selectedDeck.length>=30)return;const count=state.selectedDeck.filter(x=>x.name===c.name).length;if(c.kind==='Boss'&&count>=1)return;if(c.kind!=='Boss'&&count>=2)return;if(c.kind==='Boss'&&state.selectedDeck.filter(x=>x.kind==='Boss').length>=2)return;if(c.kind==='Spell'&&state.selectedDeck.filter(x=>x.kind==='Spell').length>=8)return;state.selectedDeck.push(clone(c));renderLibrary();renderDeckSummary()}
function removeFromDeck(name){const i=state.selectedDeck.findIndex(x=>x.name===name);if(i>=0)state.selectedDeck.splice(i,1);renderLibrary();renderDeckSummary()}
function renderDeckSummary(){const units=state.selectedDeck.filter(x=>x.kind!=='Spell').length,boss=state.selectedDeck.filter(x=>x.kind==='Boss').length,spells=state.selectedDeck.filter(x=>x.kind==='Spell').length;$('#deckCount').textContent=`${state.selectedDeck.length} / 30`;$('#deckBreakdown').textContent=`${units} units · ${boss} bosses · ${spells} spells`;const grouped={};state.selectedDeck.forEach(c=>grouped[c.name]=(grouped[c.name]||0)+1);$('#selectedDeck').innerHTML=Object.entries(grouped).map(([n,c])=>`<div class="selected-row"><span>${c}× ${n}</span><button class="btn ghost tiny" data-rm="${encodeURIComponent(n)}">−</button></div>`).join('');$$('[data-rm]').forEach(b=>b.onclick=()=>removeFromDeck(decodeURIComponent(b.dataset.rm)))}
function autoBuild(){state.selectedDeck=defaultDeck().map(clone);renderLibrary();renderDeckSummary()}
function validateDeck(){const d=state.selectedDeck;if(d.length!==30)return 'Deck must contain exactly 30 cards.';if(d.filter(x=>x.kind==='Boss').length>2)return 'Maximum 2 Bosses.';if(d.filter(x=>x.kind==='Spell').length>8)return 'Maximum 8 Spells.';if(d.filter(x=>x.kind!=='Spell').length<20)return 'Minimum 20 Units.';return null}

function openModal(html){$('#modalBody').innerHTML=html;$('#modal').classList.remove('hidden')}
function closeModal(){$('#modal').classList.add('hidden')}

$('#quickStartBtn').onclick=()=>setupMatch();$('#newGameBtn').onclick=()=>setupMatch();$('#rulesBtn').onclick=()=>openModal(RULES_HTML);$('#modalClose').onclick=closeModal;$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};$('#endPlacementBtn').onclick=endPlacement;$('#passTurnBtn').onclick=()=>{if(state.phase==='Placing')endPlacement()};$('#clearLogBtn').onclick=()=>{state.log=[];renderLog()};$('#deckBuilderBtn').onclick=()=>{show('deckScreen');buildDeckUI()};$('#backSetupBtn').onclick=()=>show('setupScreen');$('#autoDeckBtn').onclick=autoBuild;$('#saveDeckBtn').onclick=()=>{const err=validateDeck();if(err)return openModal(`<h2>Deck not ready</h2><p>${err}</p>`);state.customDeck=state.selectedDeck.map(clone);show('setupScreen');openModal('<h2>Deck saved</h2><p>Your custom 30-card deck will be used for Player 1 in the next Quick Start match.</p>')};['searchCards','typeFilter','kindFilter'].forEach(id=>$('#'+id).addEventListener('input',renderLibrary));

render();
