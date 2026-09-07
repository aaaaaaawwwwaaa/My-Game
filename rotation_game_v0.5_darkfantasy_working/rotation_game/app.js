const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clone = x => JSON.parse(JSON.stringify(x));

const state = {
  turn:1, phase:'Placing', active:0, selectedHand:null, selectedDeck:[], customDeck:null, uid:1,
  ai:true, aiBusy:false, battleSpeed:1,
  players:[makePlayer('You'),makePlayer('Abyss AI')], log:[]
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


const MOVE_INFO = {
  'Damage':'Deal the printed O→ damage to the unit directly in front. If that lane is already empty, deal that amount to the enemy Kingdom.',
  'Self Damage':'Deal the printed amount to this unit.',
  'Bullseye':'Deal O→ damage and pierce Unit Defense. If any unit anywhere in play shares a type with this attacker, add +3 damage this turn.',
  'Defend':'Gain O→ Defense. Defense persists across turns until damage removes it.',
  'Burn':'Apply O→ damage each round for 2 turns. If the unit that created the Burn dies, its Burn ends immediately.',
  'Hell Flame':'Target the closest enemy Boss (ties favor right) for 2× O→ damage. If no Boss is in play, this unit takes 1 damage.',
  'Joust':'Against a unit with Defense, deal its current Defense + O→ damage, breaking the Defense and leaving O→ to reach HP. Otherwise deal O→.',
  'Holy Blade':'Deal O→ damage. If any Deamon is in play, adjacent allies gain Defend equal to 3 + O→.',
  'Shock':'Suppress the target’s move output for O→ turns while its rotation still advances. Bosses can only be Shocked for 1 turn.',
  'Heal':'Remove negative statuses from this non-Boss unit, then heal O→ HP. Surplus healing can raise its current/max HP.',
  'Drill':'If at least one enemy has Defense, deal O→ damage to every enemy unit.',
  'Barrier':'Give adjacent allies O→ Defense.',
  'Death':'Deal 5 + O→ damage to up to O→ enemy units that share at least one type with this unit.',
  'Sin':'Revive a dead friendly unit onto your side. It cannot attack and enemies cannot kill it; your own adjacent units must eventually kill it.',
  'Disorientation':'Chosen enemy loses all Defense and permanently deals O→ less damage.',
  'Poison':'Starts at O→ damage and doubles each round for O→ turns. Printed Poison values are capped at 3.',
  'Multi-Strike':'Immediately fire the next rotation move of the adjacent allied unit, favoring the right. That ally’s rotation advances normally.',
  'Wither':'Skip O→ rotation steps permanently, maximum 2. Skipped moves never fire.',
  'Corruption':'This unit loses O→ HP, then its last attack gains +O→ damage. If Corruption itself is last, it attacks for O→ + 2.',
  'Summon':'Fully revive the last discarded friendly unit as a normal unit. Only one Summon-revived unit may be active; deal 3 damage to your Kingdom.',
  'Anti-Defend':'For affected units, Defend moves become self-damage instead. This cannot reduce a unit below 1 HP.',
  'Rust':'For this turn, reflect incoming damage and reflect statuses back to their source. If an effect cannot be reflected, deal 3 damage instead.',
  'Blindness':'Force the enemy to immediately use its next O→ move(s), maximum 2, against a teammate chosen by the Blindness user. If none exist, it hits its own Kingdom.',
  'Vampirism':'Steal O→ HP from the unit in front. If the lane is empty, take 2 self-damage instead.',
  'Holy Burn':'Works like Burn, pierces Unit Defense, and deals +5 initial damage against Chaos.',
  'Plague':'Deal O→ damage for 2 turns. If Plague kills the infected unit, spread the same Plague to one adjacent unit, favoring right.',
  'Graveyard':'Deal O→ + each target’s current Defense to every enemy. If a target has no Defense, deal O→ + 3 instead.',
  'Purify':'Become immune to negative statuses for O→ turns. Purify cannot be printed in a unit’s final rotation slot.',
  'Enchant':'Permanently add O→ damage to the closest ally’s future damage moves; if it has no damaging move, add O→ HP instead. Ties favor right.',
  'Enlighten':'Deal O→ plus this unit’s current HP as damage.',
  'Inspire':'Increase all allies’ damage and Defend output by O→. Allies with no damaging move receive Defend 4 instead.',
  'Rage':'Deal O→ plus the amount of HP this unit has lost.',
  'Soul Link':'Bind two chosen units for O→ turns. Incoming healing, damage and enemy status changes are mirrored in full between them.',
  'Echoing Strike':'Deal O→ to one target, O→−1 to adjacent lanes, O→−2 to the next lanes, and so on. Empty gaps still count distance.',
  'Ethereal Shift':'Lose 5 HP, become invulnerable for 1 turn, and add +3 to this unit’s next damaging attack.',
  'Time Warp':'Rewind a friendly unit by O→ moves. It loses 3 HP and permanently -4 damage; Boss penalties are doubled. Once per target; cannot target the caster.',
  'Conjure':'Add O→ HP to this unit. This can raise max HP as needed, but does not remove existing statuses.',
  'Frost Strike':'Deal O→ damage and freeze the target’s rotation for exactly 1 turn.',
  'Freeze':'Freeze rotation for O→ turns. When the freeze ends, permanently reduce all damage from that unit by 3.',
  'Shadow Strike':'Deal O→ damage and prevent the target from healing for 2 turns.',
  'GX':'A unique card-specific move. GX effects are written on the card.'
};

const TYPE_ART = {
  Orc:{bg:'#091508',bg2:'#163115',body:'#274e24',accent:'#8eff57',accent2:'#d7ff9d',line:'#e9ffd8',shadow:'#030702'},
  Deamon:{bg:'#160606',bg2:'#451112',body:'#6e1e20',accent:'#ff6a3d',accent2:'#ffd07a',line:'#ffe4cf',shadow:'#140204'},
  Order:{bg:'#07111c',bg2:'#1a3960',body:'#294f76',accent:'#57d4ff',accent2:'#ffe07b',line:'#ecf8ff',shadow:'#050a11'},
  Chaos:{bg:'#140a1c',bg2:'#3a1768',body:'#5a2b8a',accent:'#ff54dd',accent2:'#8f7bff',line:'#f2e4ff',shadow:'#07030d'},
  Forsaken:{bg:'#06110d',bg2:'#173229',body:'#325645',accent:'#7ce5a8',accent2:'#cde89b',line:'#efffe9',shadow:'#020705'},
  'Soul Bound':{bg:'#130710',bg2:'#4a1741',body:'#7a2a63',accent:'#ff79c8',accent2:'#d7a0ff',line:'#fff0fb',shadow:'#080308'},
  'Glacial Guardian':{bg:'#07131a',bg2:'#0f4a66',body:'#1c6f92',accent:'#6de9ff',accent2:'#e7fbff',line:'#f1fdff',shadow:'#02080b'},
  Enlightened:{bg:'#191307',bg2:'#5c4511',body:'#8f6a18',accent:'#ffe06e',accent2:'#fff4bf',line:'#fff9e1',shadow:'#0a0602'}
};
function hashName(str){let h=2166136261;for(const ch of str){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function primaryType(c){return (c.types||[]).includes('Glacial Guardian')?'Glacial Guardian':((c.types||[])[0]||'Order')}
function slugifyType(t){return String(t||'order').toLowerCase().replace(/[^a-z0-9]+/g,'-')}
function portraitRunes(t,pal){
  const marks={
    Orc:'<path d="M14 21l7-4 7 4-7 4Zm54 0l7-4 7 4-7 4Z" fill="'+pal.accent2+'" opacity=".75"/><path d="M23 17v8m45-8v8" stroke="'+pal.accent2+'" stroke-width="1.5"/>',
    Deamon:'<path d="M18 16l6 8 8-4m42-4-6 8-8-4" stroke="'+pal.accent2+'" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
    Order:'<path d="M14 24h16m48 0h16M22 16l4 8m56-8-4 8" stroke="'+pal.accent2+'" stroke-width="1.5" stroke-linecap="round"/>',
    Chaos:'<path d="M20 13l5 6-6 6 7 3m38-15-5 6 6 6-7 3" stroke="'+pal.accent2+'" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    Forsaken:'<path d="M18 17q8 4 0 8m60-8q-8 4 0 8" stroke="'+pal.accent2+'" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    'Soul Bound':'<circle cx="18" cy="20" r="4" fill="none" stroke="'+pal.accent2+'" stroke-width="1.6"/><circle cx="78" cy="20" r="4" fill="none" stroke="'+pal.accent2+'" stroke-width="1.6"/><path d="M22 20h10m34 0h8" stroke="'+pal.accent2+'" stroke-width="1.4"/>',
    'Glacial Guardian':'<path d="M18 17l6 6 6-6m36 0 6 6 6-6" stroke="'+pal.accent2+'" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    Enlightened:'<circle cx="18" cy="20" r="3" fill="'+pal.accent2+'"/><circle cx="78" cy="20" r="3" fill="'+pal.accent2+'"/><path d="M18 28h60" stroke="'+pal.accent2+'" stroke-width="1.2" opacity=".55"/>'
  };
  return marks[t]||'';
}
function silhouetteFor(c,pal,h){
  const t=primaryType(c), boss=c.kind==='Boss', left=(h%9)-4, eye=(h%2)?pal.accent2:'#ffffff';
  const bossCrown=boss?'<g filter="url(#glow)"><path d="M28 14l8-10 10 9 10-9 8 10-4 9H32Z" fill="'+pal.accent2+'" opacity=".96"/><path d="M36 12l3 4 7-5 7 5 3-4" stroke="#fff8d3" stroke-width="1.4" fill="none"/></g>':'';
  const baseMap={
    Orc:'<g><path d="M22 54q5-20 13-24-8-5-8-13 0-10 21-10 21 0 21 10 0 8-8 13 8 4 13 24" fill="'+pal.body+'" stroke="'+pal.line+'" stroke-width="1.8"/><path d="M24 21l-7-7 3 11m56-4 7-7-3 11" stroke="'+pal.accent+'" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M39 27h7m11 0h7" stroke="'+eye+'" stroke-width="2.3" stroke-linecap="round"/><path d="M42 35h12" stroke="#130c07" stroke-width="2" stroke-linecap="round"/><path d="M35 36l-5 6m31-6 5 6" stroke="'+pal.accent2+'" stroke-width="2.3" stroke-linecap="round"/></g>',
    Deamon:'<g><path d="M20 55q3-17 11-22-7-5-7-16 0-14 24-14 24 0 24 14 0 11-7 16 8 5 11 22" fill="'+pal.body+'" stroke="'+pal.line+'" stroke-width="1.8"/><path d="M27 16C25 8 18 10 15 4m42 12c2-8 9-6 12-12" stroke="'+pal.accent+'" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M38 28h7m13 0h7" stroke="'+eye+'" stroke-width="2.1" stroke-linecap="round"/><path d="M46 37q4 3 8 0" stroke="#150707" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M43 39l-3 7m14-7 3 7" stroke="'+pal.accent2+'" stroke-width="2.2" stroke-linecap="round"/></g>',
    Order:'<g><path d="M32 55q5-16 5-29-8-3-8-12 0-10 19-10 19 0 19 10 0 9-8 12 0 13 5 29" fill="'+pal.body+'" stroke="'+pal.line+'" stroke-width="1.8"/><path d="M38 15h20l-3 9H41Z" fill="'+pal.accent2+'" opacity=".55"/><path d="M42 27h4m12 0h4" stroke="'+eye+'" stroke-width="2" stroke-linecap="round"/><path d="M44 35h16" stroke="#0e1117" stroke-width="2"/><path d="M50 9v8m-6-4h12" stroke="'+pal.accent+'" stroke-width="2" stroke-linecap="round"/></g>',
    Chaos:'<g><path d="M19 55q4-18 12-22-10-5-10-16 0-13 27-13t27 13q0 11-10 16 8 4 12 22" fill="'+pal.body+'" stroke="'+pal.line+'" stroke-width="1.8"/><path d="M27 20l7-8 8 7 8-9 9 8 8-5" stroke="'+pal.accent+'" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M38 29h8m12 0h8" stroke="'+eye+'" stroke-width="2.2" stroke-linecap="round"/><path d="M43 37h14" stroke="#190e20" stroke-width="2"/><circle cx="50" cy="16" r="3" fill="'+pal.accent2+'" opacity=".8"/></g>',
    Forsaken:'<g><path d="M17 55q2-18 11-24 0-9 8-20 5-7 14-7 9 0 14 7 8 11 8 20 9 6 11 24" fill="'+pal.body+'" stroke="'+pal.line+'" stroke-width="1.8"/><path d="M30 16q20 14 40 0" stroke="'+pal.accent+'" stroke-width="1.8" fill="none" opacity=".5"/><path d="M39 28h6m16 0h6" stroke="'+eye+'" stroke-width="2.2" stroke-linecap="round"/><path d="M45 37q5 2 10 0" stroke="#0d120f" stroke-width="2" fill="none"/></g>',
    'Soul Bound':'<g><path d="M17 55q6-18 15-22-7-5-7-15 0-12 23-12 23 0 23 12 0 10-7 15 9 4 15 22" fill="'+pal.body+'" fill-opacity=".66" stroke="'+pal.line+'" stroke-width="1.8"/><path d="M27 23q22 18 46 0" stroke="'+pal.accent+'" stroke-width="1.6" fill="none" opacity=".45"/><path d="M39 28h8m12 0h8" stroke="'+eye+'" stroke-width="2" stroke-linecap="round"/><path d="M45 36q5 3 10 0" stroke="#1c0f17" stroke-width="2" fill="none"/><circle cx="50" cy="11" r="4" fill="'+pal.accent2+'" opacity=".7"/></g>',
    'Glacial Guardian':'<g><path d="M18 55q3-17 10-21-4-5-4-13 0-14 26-14t26 14q0 8-4 13 7 4 10 21" fill="'+pal.body+'" stroke="'+pal.line+'" stroke-width="1.8"/><path d="M31 16l-7-8m45 8 7-8" stroke="'+pal.accent2+'" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M39 29h7m15 0h7" stroke="'+eye+'" stroke-width="2.4" stroke-linecap="round"/><path d="M44 38h12" stroke="#091317" stroke-width="2"/><path d="M30 45h40" stroke="'+pal.accent+'" stroke-width="1.5" opacity=".7"/></g>',
    Enlightened:'<g><path d="M19 55q4-18 14-25-8-5-8-13 0-12 25-12t25 12q0 8-8 13 10 7 14 25" fill="'+pal.body+'" stroke="'+pal.line+'" stroke-width="1.8"/><path d="M50 9c-11 0-18 8-18 17 0 4 1 7 3 10h30c2-3 3-6 3-10 0-9-7-17-18-17Z" fill="'+pal.accent2+'" opacity=".22"/><path d="M41 28h6m16 0h6" stroke="'+eye+'" stroke-width="2.1" stroke-linecap="round"/><path d="M44 36h12" stroke="#191407" stroke-width="2"/><path d="M50 8v10m-6-4h12" stroke="'+pal.accent2+'" stroke-width="2" stroke-linecap="round"/></g>'
  };
  const body=baseMap[t]||baseMap.Order;
  return `<g transform="translate(${left*.4} 0)">${body}${bossCrown}</g>`;
}
function pixelPortrait(c){
  const t=primaryType(c), pal=TYPE_ART[t]||TYPE_ART.Order, h=hashName(c.name), boss=c.kind==='Boss';
  const starA=16+(h%7), starB=77-(h%9), arc=44+(h%11);
  return `<svg viewBox="0 0 96 64" preserveAspectRatio="none" aria-label="Arcane portrait of ${c.name}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${pal.bg2}"/><stop offset="100%" stop-color="${pal.bg}"/></linearGradient>
      <radialGradient id="aura" cx="50%" cy="42%" r="58%"><stop offset="0%" stop-color="${pal.accent}" stop-opacity=".58"/><stop offset="62%" stop-color="${pal.accent}" stop-opacity=".16"/><stop offset="100%" stop-color="${pal.accent}" stop-opacity="0"/></radialGradient>
      <linearGradient id="ground" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${pal.shadow}" stop-opacity="0"/><stop offset="50%" stop-color="${pal.shadow}" stop-opacity=".55"/><stop offset="100%" stop-color="${pal.shadow}" stop-opacity="0"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="96" height="64" rx="3" fill="url(#bg)"/>
    <circle cx="48" cy="31" r="29" fill="url(#aura)"/>
    <ellipse cx="48" cy="57" rx="32" ry="6" fill="url(#ground)"/>
    <path d="M8 51C28 ${arc} 68 ${arc} 88 51" stroke="${pal.accent2}" stroke-opacity=".24" stroke-width="1.6" fill="none"/>
    <circle cx="${starA}" cy="13" r="1.1" fill="${pal.accent2}" opacity=".72"/><circle cx="${starB}" cy="16" r="1.4" fill="${pal.accent}" opacity=".8"/><circle cx="49" cy="10" r="1.1" fill="#fff7d1" opacity=".8"/>
    ${portraitRunes(t,pal)}
    <g filter="url(#glow)"><circle cx="24" cy="46" r="2" fill="${pal.accent}" opacity=".35"/><circle cx="72" cy="44" r="2.4" fill="${pal.accent2}" opacity=".28"/></g>
    ${silhouetteFor(c,pal,h)}
    ${boss?'<rect x="6" y="6" width="84" height="52" rx="8" fill="none" stroke="'+pal.accent2+'" stroke-opacity=".22" stroke-width="1.1"/>':''}
  </svg>`
}
function moveTip(type){return MOVE_INFO[type]||'Card-specific effect. See the card text.'}
function moveRow(m,i,current=-1){const type=m[0], val=m[1], label=m[2];const txt=type==='GX'?(label||'GX'):`${type}${val!==undefined&&val!==0?' '+val:''}`;return `<div class="move-row ${i===current?'current':''}"><span><span class="move-index">${i+1}.</span> ${txt}</span><span class="move-info" tabindex="0">i<span class="move-tip"><b>${type}</b><br>${moveTip(type)}</span></span></div>`}
function vfxClass(type){if(type==='Bullseye')return 'scope';if(['Burn','Hell Flame','Holy Burn'].includes(type))return 'fire';if(['Defend','Barrier','Purify'].includes(type))return 'shield';if(['Poison','Plague'].includes(type))return 'poison';if(['Frost Strike','Freeze'].includes(type))return 'frost';if(['Shock'].includes(type))return 'lightning';if(['Death','Graveyard','Wither','Corruption','Soul Link','GX'].includes(type))return 'void';return 'scope'}
const sleep=ms=>new Promise(r=>setTimeout(r,ms/state.battleSpeed));
function setVfxPosition(pi,lane,type){const lanes=$(`#p${pi+1}Board`)?.children;if(!lanes||!lanes[lane])return;const r=lanes[lane].getBoundingClientRect(), v=$('#vfxTarget');v.style.left=(r.left+r.width/2)+'px';v.style.top=(r.top+r.height/2)+'px';v.dataset.label=type;v.className='vfx-target '+vfxClass(type)}
function clearLaneHighlights(){$$('.lane.active-lane').forEach(x=>x.classList.remove('active-lane'))}
function synthSfx(type){try{const A=window.AudioContext||window.webkitAudioContext;window.__rotAudio=window.__rotAudio||new A();const ac=window.__rotAudio,o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);const f={Bullseye:880,Burn:180,'Hell Flame':120,Shock:1200,Freeze:600,'Frost Strike':650,Defend:420,Heal:520,Poison:240,GX:95}[type]||300;o.frequency.setValueAtTime(f,ac.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(60,f*.55),ac.currentTime+.22);g.gain.setValueAtTime(.035,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.25);o.start();o.stop(ac.currentTime+.26)}catch(e){}}
async function laneCue(lane){const over=$('#battleOverlay'),cue=$('#laneCue');over.classList.add('show');cue.textContent=`LANE ${lane+1}`;cue.classList.remove('pop');void cue.offsetWidth;cue.classList.add('pop');clearLaneHighlights();[0,1].forEach(pi=>{const el=$(`#p${pi+1}Board`)?.children[lane];el?.classList.add('active-lane')});await sleep(520)}
async function playMoveCinematic(pi,lane,u,move){const [type,val,label]=move;const over=$('#battleOverlay'),cut=$('#cutsceneCard');over.classList.add('show');cut.innerHTML=`<div class="actor">${pi===0?'YOUR':'AI'} • ${u.name}</div><div class="move">${type==='GX'?(label||'GX'):`${type}${val?' '+val:''}`}</div>`;cut.classList.remove('show');void cut.offsetWidth;cut.classList.add('show');const utility=['Defend','Heal','Barrier','Purify','Enchant','Inspire','Conjure','Ethereal Shift','Rust','Anti-Defend'].includes(type);setVfxPosition(utility?pi:enemyIndex(pi),lane,type);synthSfx(type);await sleep(type==='GX'?900:680);$('#vfxTarget').className='vfx-target'}
function hideBattleOverlay(){clearLaneHighlights();$('#battleOverlay')?.classList.remove('show');$('#vfxTarget').className='vfx-target'}
async function bossEntrance(u,pi,lane){if(!u||u.kind!=='Boss')return;state.seenBosses=state.seenBosses||new Set();if(state.seenBosses.has(u.uid))return;state.seenBosses.add(u.uid);const over=$('#battleOverlay'),cue=$('#laneCue'),cut=$('#cutsceneCard');over.classList.add('show');cue.textContent=`${pi===0?'YOUR':'ABYSS AI'} BOSS ENTERS • LANE ${lane+1}`;cue.classList.remove('show');void cue.offsetWidth;cue.classList.add('show');cut.innerHTML=`<div class="actor">${pi===0?'YOUR':'ABYSS AI'} • BOSS DEPLOYED</div><div class="move">${u.name}</div>`;cut.classList.remove('show');void cut.offsetWidth;cut.classList.add('show');setVfxPosition(pi,lane,'Boss Ability');synthSfx('GX');await sleep(980);hideBattleOverlay();}

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
  state.turn=1;state.phase='Placing';state.active=0;state.selectedHand=null;state.log=[];state.seenBosses=new Set();
  state.players=[makePlayer('You'),makePlayer('Abyss AI')];
  [deck1,deck2].forEach((deck,i)=>{state.players[i].deck=shuffle(deck.map(c=>clone(c)));draw(i,5,false);draw(i,2,false)});
  show('gameScreen');log('Round 1 started. Both sides drew 2 cards. Build your formation, then begin the battle.','system');render();
}
function draw(pi,n,announce=true){const p=state.players[pi];for(let i=0;i<n;i++){if(p.deck.length)p.hand.push(p.deck.shift());else if(announce)log(`${p.name} tried to draw from an empty deck.`,'system')}}

function show(id){$$('.screen').forEach(x=>x.classList.remove('active'));$('#'+id).classList.add('active')}
function render(){renderBoard();renderHand();renderHUD();const demo=document.querySelector('.hero-card-demo');if(demo&&!demo.dataset.polished){const c=CARD_LIBRARY.find(x=>x.name==='Abyssal Overlord');if(c){demo.innerHTML=cardMarkup(c);demo.dataset.polished='1'}}}
function renderHUD(){
  $('#turnNumber').textContent=state.turn;$('#activePlayerLabel').innerHTML=state.aiBusy?'<span class="ai-thinking">AI THINKING <i></i><i></i><i></i></span>':'YOUR TURN';$('#phaseLabel').textContent=state.phase;$('#handTitle').textContent=state.phase==='Placing'?'Choose your formation':'Battle resolving…';
  state.players.forEach((p,i)=>{const n=i+1;$('#p'+n+'Hp').textContent=Math.max(0,p.hp);$('#p'+n+'KDef').textContent=p.kdef;$('#p'+n+'Deck').textContent=p.deck.length;$('#p'+n+'Discard').textContent=p.discard.length;$('#p'+n+'KingdomFill').style.width=Math.max(0,Math.min(100,p.hp))+'%'});
  $('#endPlacementBtn').disabled=state.phase!=='Placing'||state.aiBusy;$('#endPlacementBtn').textContent=state.phase==='Placing'?'Begin Battle':'Resolving…';
}
function cardMarkup(c,opts={}){
  const runtime=opts.runtime||null, current=runtime?.rot??-1;
  const moves=c.kind==='Spell'?`<div class="gx-paper">${c.text||''}</div>`:`<div class="move-stack">${(c.moves||[]).map((m,i)=>moveRow(m,i,current)).join('')}</div>${c.gx?`<div class="gx-paper"><b>GX — ${c.gx.name}</b><br>${c.gx.text}</div>`:''}`;
  const corners=(c.moves||[]).slice(0,4).map((m,i)=>`<span class="corner-icon ${['tl','tr','br','bl'][i]} ${i===current?'next':''}">${m[0]==='GX'?'GX':(m[1]||'•')}</span>`).join('');
  return `<div class="rotation-card ${c.kind==='Boss'?'boss-card':''} ${c.kind==='Spell'?'spell-card':''}"><div class="paper-head"><div class="paper-box paper-name">${c.name}</div><div class="paper-box paper-types">${(c.types||[]).join(' + ')||'SPELL'}</div><div class="paper-box paper-hp">${c.hp?c.hp+' HP':'✦'}</div></div><div class="paper-kind">${c.kind.toUpperCase()}</div><div class="card-art">${pixelPortrait(c)}</div>${moves}<div class="paper-corners">${corners}</div></div>`
}
function renderHand(){
  const hand=$('#hand');hand.innerHTML='';const p=state.players[0];p.hand.forEach((c,i)=>{const wrap=document.createElement('div');wrap.innerHTML=cardMarkup(c);const el=wrap.firstElementChild;el.classList.toggle('selected',state.selectedHand===i);el.onclick=()=>{if(state.phase!=='Placing'||state.aiBusy)return;state.selectedHand=i;if(c.kind==='Spell')castSpellFromHand(i);else render()};hand.appendChild(el)})
}
function renderBoard(){
  [0,1].forEach(pi=>{const root=$('#p'+(pi+1)+'Board');root.innerHTML='';state.players[pi].board.forEach((u,lane)=>{const el=document.createElement('div');el.className='lane';el.dataset.player=pi;el.dataset.lane=lane;if(!u){el.onclick=()=>placeSelected(pi,lane);el.innerHTML='<div class="muted" style="margin:auto;font-size:11px;letter-spacing:.15em">OPEN LANE</div>'}else{const next=u.moves[u.rot];el.innerHTML=`<div class="unit-card"><div class="mini-portrait">${pixelPortrait(u)}</div><div class="unit-head"><span>${u.name}</span><span class="hp">${u.currentHp}/${u.maxHp}</span></div><div class="unit-sub"><span>${u.types.join(' + ')}</span><span class="armor">DEF ${u.armor}</span></div><div class="unit-next">Next: <b>${next?(next[0]+' '+(next[1]||'')):'—'}</b>${next?`<span class="move-info" tabindex="0">i<span class="move-tip"><b>${next[0]}</b><br>${moveTip(next[0])}</span></span>`:''}</div><div class="statuses">${statusMarkup(u)}</div><div class="rot-track">${[0,1,2,3].map(x=>`<span class="rot-dot ${x<u.rot?'done':''} ${x===u.rot?'next':''}"></span>`).join('')}</div><div class="board-card-actions">${pi===0&&u.kind==='Boss'&&u.bossAbility?`<button data-boss="1">Boss Ability</button>`:''}<button data-view="1">View Card</button></div></div>`;el.querySelector('[data-view]')?.addEventListener('click',e=>{e.stopPropagation();openModal(cardMarkup(u,{runtime:u}))});el.querySelector('[data-boss]')?.addEventListener('click',e=>{e.stopPropagation();useBossAbility(pi,lane)});}root.appendChild(el)})})
}
function statusMarkup(u){const s=u.statuses,arr=[];if(u.armor)arr.push(`DEF ${u.armor}`);if(s.burn.length)arr.push('Burn');if(s.poison.length)arr.push('Poison');if(s.plague.length)arr.push('Plague');if(s.shock)arr.push(`Shock ${s.shock}`);if(s.freeze)arr.push(`Freeze ${s.freeze}`);if(s.purify)arr.push(`Purify ${s.purify}`);if(s.healBlock)arr.push('No Heal');if(s.disorient)arr.push(`-${s.disorient} DMG`);if(s.invulnerable)arr.push('Invulnerable');if(s.rust)arr.push('Rust');if(u.sinLocked)arr.push('Sin-bound');return arr.map(x=>`<span class="status-chip">${x}</span>`).join('')}
function renderLog(){const root=$('#combatLog');root.innerHTML=[...state.log].reverse().map(x=>`<div class="${x.cls}">${x.msg}</div>`).join('')}

async function placeSelected(pi,lane){if(state.phase!=='Placing'||state.aiBusy||pi!==0||state.selectedHand==null)return;const p=state.players[0];const card=p.hand[state.selectedHand];if(!card||card.kind==='Spell'||p.board[lane])return;p.hand.splice(state.selectedHand,1);p.board[lane]=instantiate(card,state.active);log(`${p.name} placed ${card.name} in lane ${lane+1}.`,'good');state.selectedHand=null;render();if(card.kind==='Boss')await bossEntrance(p.board[lane],pi,lane)}

function castSpellFromHand(i){const p=state.players[0],card=p.hand[i]; if(!card||card.kind!=='Spell')return;p.hand.splice(i,1);p.discard.push(card);resolveSpell(card,state.active);state.selectedHand=null;render()}
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

async function endPlacement(){
  if(state.phase!=='Placing'||state.aiBusy)return;state.selectedHand=null;state.aiBusy=true;state.active=1;render();log('The Abyss AI studies your formation…','system');await aiPlacement();state.phase='Attack';state.aiBusy=false;state.active=0;render();log('Attack period begins. Lanes resolve from left to right.','system');await resolveAttackPeriod()
}
async function aiPlacement(){
  const p=state.players[1], human=state.players[0];await sleep(450);
  // Cast at most one useful spell first.
  const spellIndex=p.hand.findIndex(c=>c.kind==='Spell'&&human.board.some(Boolean));
  if(spellIndex>=0){const c=p.hand.splice(spellIndex,1)[0];p.discard.push(c);resolveSpell(c,1);log(`Abyss AI casts ${c.name}.`,'system');render();await sleep(350)}
  // Play up to three units, preferring lanes that counter the human board and preserving some hand depth.
  let plays=0;while(plays<3){const idx=p.hand.findIndex(c=>c.kind!=='Spell');if(idx<0)break;const open=p.board.map((x,i)=>!x?i:-1).filter(i=>i>=0);if(!open.length)break;open.sort((a,b)=>{const av=human.board[a]?3:0,bv=human.board[b]?3:0;return bv-av||Math.abs(2-a)-Math.abs(2-b)});const lane=open[0],c=p.hand.splice(idx,1)[0];p.board[lane]=instantiate(c,1);log(`Abyss AI deploys ${c.name} to lane ${lane+1}.`,'system');plays++;render();if(c.kind==='Boss')await bossEntrance(p.board[lane],1,lane);await sleep(330)}
  // Use one available Boss ability when the AI has a Boss in play; this makes PvE feel active without perfect play.
  const bossLane=p.board.findIndex(u=>u?.kind==='Boss'&&u.bossAbility&&!u.bossAbility.used);if(bossLane>=0&&Math.random()<.65){useBossAbility(1,bossLane,true);await sleep(350)}
}
async function resolveAttackPeriod(){
  for(let lane=0;lane<5;lane++){
    await laneCue(lane);
    for(let pi=0;pi<2;pi++){
      const u=state.players[pi].board[lane];if(!u)continue;const move=u.moves[u.rot];if(move)await playMoveCinematic(pi,lane,u,move);resolveUnitMove(pi,lane,u);render();await sleep(160);if(checkWin()){hideBattleOverlay();return}
    }
  }
  hideBattleOverlay();endRound()
}
function resolveUnitMove(pi,lane,u,bonus=false){if(!state.players[pi].board.includes(u))return;if(u.sinLocked){log(`${u.name} is Sin-bound and cannot attack.`,'system');return}if(u.statuses.freeze>0){log(`${u.name}'s rotation is frozen.`,'system');return}const move=u.moves[u.rot];if(!move)return;const [type,val]=move;if(u.statuses.shock>0){log(`${u.name}'s ${type} is Shocked and produces no effect.`,'system')}else{resolveMove(pi,lane,u,type,val,move[2],bonus)}if(u.statuses.etherealBoost&&isDamageMove(type)&&type!=='Ethereal Shift')u.statuses.etherealBoost=0;advanceRotation(pi,u)}
function advanceRotation(pi,u){if(!state.players[pi].board.includes(u))return;u.rot++;if(u.rot>=u.moves.length){log(`${u.name} completed its rotation.`,'system');killUnit(u,null)}}
function movePower(u,val){const finalBoost=(u.rot===u.moves.length-1?(u.corruptionBoost||0):0);return Math.max(0,val-(u.statuses.disorient||0)+(u.statuses.inspire||0)+(u.statuses.etherealBoost||0)+(u.permBoost||0)+finalBoost)}
function targetFront(pi,lane){return state.players[enemyIndex(pi)].board[lane]}
function resolveMove(pi,lane,u,type,val,label,bonus){const enemy=state.players[enemyIndex(pi)],ally=state.players[pi],target=targetFront(pi,lane);const power=movePower(u,val||0);const hitFront=(amount,{pierce=false,emptyKingdom=true}={})=>{const t=targetFront(pi,lane);if(t)damageUnit(t,amount,u,{pierce});else if(emptyKingdom)kingdomDamage(enemyIndex(pi),amount)};
  log(`${u.name} uses ${type}${val!==undefined&&val!==0?' '+val:''}${bonus?' (bonus)':''}.`,'system');
  switch(type){
    case'Damage':hitFront(power);break; case'Self Damage':damageUnit(u,val,u,{ignoreInvuln:true});break;
    case'Bullseye':hitFront(Math.max(0,power+(sameTypeInPlay(u)?3:0)),{pierce:true});break;
    case'Defend':{const dval=Math.max(0,val+(u.statuses.inspire||0));if(u.antiDefendAffected){u.currentHp=Math.max(1,u.currentHp-dval);log(`${u.name}'s Defend became self-damage.`,'hit')}else{u.armor+=dval;log(`${u.name} gains ${dval} Defense.`,'good')}break}
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
    case'Inspire':ally.board.filter(Boolean).forEach(a=>{if(a.moves.some(m=>isDamageMove(m[0])))a.statuses.inspire=(a.statuses.inspire||0)+val;else a.armor+=4});break;
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

function useBossAbility(pi,lane,fromAI=false){if(state.phase!=='Placing')return;if(!fromAI&&(pi!==0||state.aiBusy))return;const u=state.players[pi].board[lane];if(!u?.bossAbility)return;if(u.bossAbility.used){log(`${u.name}'s Boss Ability has already been used.`,'system');return}u.bossAbility.used=true;const fx=u.bossAbility.effect,p=state.players[pi],op=state.players[enemyIndex(pi)];
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
function endRound(){tickStatuses();state.phase='Placing';state.active=0;state.aiBusy=false;state.turn++;draw(0,2);draw(1,2);state.selectedHand=null;allUnits().forEach(x=>x.antiDefendAffected=false);log(`Round ${state.turn} begins. Both sides draw 2. Build your formation.`,'system');render()}
function checkWin(){const loser=state.players.findIndex(p=>p.hp<=0);if(loser>=0){openModal(`<div class="eyebrow">MATCH OVER</div><div class="winner">${state.players[enemyIndex(loser)].name} wins!</div><p>The enemy Kingdom has fallen.</p><button class="btn primary" onclick="location.reload()">Return to title</button>`);return true}return false}

function buildDeckUI(){const types=[...new Set(CARD_LIBRARY.flatMap(c=>c.types||[]))].sort();$('#typeFilter').innerHTML='<option value="">All types</option>'+types.map(t=>`<option>${t}</option>`).join('');renderLibrary();renderDeckSummary()}
function renderLibrary(){const q=$('#searchCards').value.toLowerCase(),tf=$('#typeFilter').value,kf=$('#kindFilter').value;const root=$('#cardLibrary');root.innerHTML='';CARD_LIBRARY.filter(c=>(!q||c.name.toLowerCase().includes(q))&&(!tf||c.types?.includes(tf))&&(!kf||(kf==='Unit'?c.kind==='Unit':c.kind===kf))).forEach(c=>{const count=state.selectedDeck.filter(x=>x.name===c.name).length;const el=document.createElement('div');el.className='library-entry';el.innerHTML=(count?`<div class="count-badge">${count}</div>`:'')+cardMarkup(c)+`<button class="btn primary add-card-btn">Add</button>`;el.querySelector('.add-card-btn').onclick=()=>addToDeck(c);root.appendChild(el)})}
function addToDeck(c){if(state.selectedDeck.length>=30)return;const count=state.selectedDeck.filter(x=>x.name===c.name).length;if(c.kind==='Boss'&&count>=1)return;if(c.kind!=='Boss'&&count>=2)return;if(c.kind==='Boss'&&state.selectedDeck.filter(x=>x.kind==='Boss').length>=2)return;if(c.kind==='Spell'&&state.selectedDeck.filter(x=>x.kind==='Spell').length>=8)return;state.selectedDeck.push(clone(c));renderLibrary();renderDeckSummary()}
function removeFromDeck(name){const i=state.selectedDeck.findIndex(x=>x.name===name);if(i>=0)state.selectedDeck.splice(i,1);renderLibrary();renderDeckSummary()}
function renderDeckSummary(){const units=state.selectedDeck.filter(x=>x.kind!=='Spell').length,boss=state.selectedDeck.filter(x=>x.kind==='Boss').length,spells=state.selectedDeck.filter(x=>x.kind==='Spell').length;$('#deckCount').textContent=`${state.selectedDeck.length} / 30`;$('#deckBreakdown').textContent=`${units} units · ${boss} bosses · ${spells} spells`;const grouped={};state.selectedDeck.forEach(c=>grouped[c.name]=(grouped[c.name]||0)+1);$('#selectedDeck').innerHTML=Object.entries(grouped).map(([n,c])=>`<div class="selected-row"><span>${c}× ${n}</span><button class="btn ghost tiny" data-rm="${encodeURIComponent(n)}">−</button></div>`).join('');$$('[data-rm]').forEach(b=>b.onclick=()=>removeFromDeck(decodeURIComponent(b.dataset.rm)))}
function autoBuild(){state.selectedDeck=defaultDeck().map(clone);renderLibrary();renderDeckSummary()}
function validateDeck(){const d=state.selectedDeck;if(d.length!==30)return 'Deck must contain exactly 30 cards.';if(d.filter(x=>x.kind==='Boss').length>2)return 'Maximum 2 Bosses.';if(d.filter(x=>x.kind==='Spell').length>8)return 'Maximum 8 Spells.';if(d.filter(x=>x.kind!=='Spell').length<20)return 'Minimum 20 Units.';return null}

function openModal(html){$('#modalBody').innerHTML=html;$('#modal').classList.remove('hidden')}
function closeModal(){$('#modal').classList.add('hidden')}

$('#quickStartBtn').onclick=()=>setupMatch();$('#newGameBtn').onclick=()=>setupMatch();$('#rulesBtn').onclick=()=>openModal(RULES_HTML);$('#modalClose').onclick=closeModal;$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};$('#endPlacementBtn').onclick=endPlacement;$('#speedBtn').onclick=()=>{state.battleSpeed=state.battleSpeed===1?2:1;$('#speedBtn').textContent=state.battleSpeed===1?'Cinematic 1×':'Cinematic 2×'};$('#clearLogBtn').onclick=()=>{state.log=[];renderLog()};$('#deckBuilderBtn').onclick=()=>{show('deckScreen');buildDeckUI()};$('#backSetupBtn').onclick=()=>show('setupScreen');$('#autoDeckBtn').onclick=autoBuild;$('#saveDeckBtn').onclick=()=>{const err=validateDeck();if(err)return openModal(`<h2>Deck not ready</h2><p>${err}</p>`);state.customDeck=state.selectedDeck.map(clone);show('setupScreen');openModal('<h2>Deck saved</h2><p>Your custom 30-card deck will be used for Player 1 in the next Quick Start match.</p>')};['searchCards','typeFilter','kindFilter'].forEach(id=>$('#'+id).addEventListener('input',renderLibrary));

render();
