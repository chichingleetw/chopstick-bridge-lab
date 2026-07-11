import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';

const $ = (s) => document.querySelector(s);
const stage = $('#stage');
const ui = {
  stickCount: $('#stickCount'), brokenCount: $('#brokenCount'), totalWeight: $('#totalWeight'),
  deformation: $('#deformation'), maxStress: $('#maxStress'), forceMode: $('#forceMode'),
  bestWeight: $('#bestWeight'), observation: $('#observation'),
  start: $('#startBtn'), add: $('#addWeightBtn'), reset: $('#resetBtn'), undo: $('#undoBtn'), deleteStick: $('#deleteStickBtn'), clear: $('#clearBtn'),
  strength: $('#strengthInput'), strengthValue: $('#strengthValue'), weight: $('#weightSelect'), auto: $('#autoWeight'),
  tip: $('#stageTip'), mission: $('#missionText')
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfefff);
scene.fog = new THREE.Fog(0xcfefff, 34, 70);
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 150);
camera.position.set(15, 11, 17);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.8, 0);
controls.enableDamping = true;
controls.minDistance = 8;
controls.maxDistance = 32;
controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight(0xffffff, 0x668866, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(8, 18, 10); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshStandardMaterial({ color: 0xbfd99f, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; scene.add(ground);
const river = new THREE.Mesh(new THREE.PlaneGeometry(13, 70), new THREE.MeshStandardMaterial({ color: 0x69bde2, roughness: .35, metalness: .05 }));
river.rotation.x = -Math.PI / 2; river.position.y = 0; river.receiveShadow = true; scene.add(river);

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 32;
world.solver.tolerance = 0.0005;
world.allowSleep = true;
const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(groundBody);

const stickMaterial = new CANNON.Material('stick');
const weightMaterial = new CANNON.Material('weight');
const groundMaterial = new CANNON.Material('ground');
groundBody.material = groundMaterial;
world.addContactMaterial(new CANNON.ContactMaterial(stickMaterial, stickMaterial, { friction: .65, restitution: 0, contactEquationRelaxation: 5, frictionEquationRelaxation: 5 }));
world.addContactMaterial(new CANNON.ContactMaterial(stickMaterial, weightMaterial, { friction: .8, restitution: 0, contactEquationRelaxation: 5, frictionEquationRelaxation: 5 }));
world.addContactMaterial(new CANNON.ContactMaterial(weightMaterial, groundMaterial, { friction: .9, restitution: .02 }));
world.addContactMaterial(new CANNON.ContactMaterial(stickMaterial, groundMaterial, { friction: .75, restitution: .02 }));

const nodeGroup = new THREE.Group(); const stickGroup = new THREE.Group(); const weightGroup = new THREE.Group();
scene.add(nodeGroup, stickGroup, weightGroup);
const nodes = [];
const sticks = [];
const weights = [];
const constraints = [];
const anchorBodies = [];
const nodeFrames = [];
let selectedNode = null;
let deleteMode = false;
let mode = 'build';
let broken = 0;
let totalWeight = 0;
let bestWeight = Number(localStorage.getItem('chopstickBridgeBest') || 0);
let autoTimer = null;
let initialDeckY = 2.05;
let templateName = 'blank';
let maxStressValue = 0;
let criticalMode = '-';

const safeColor = new THREE.Color(0xc89454), warnColor = new THREE.Color(0xf3b84c), dangerColor = new THREE.Color(0xe35d5d);

function addScenery() {
  const concrete = new THREE.MeshStandardMaterial({ color: 0xc9ced2, roughness: .95 });
  [-7.1, 7.1].forEach(x => {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.8, 7), concrete);
    pier.position.set(x, 1.85, 0); pier.castShadow = pier.receiveShadow = true; scene.add(pier);
  });
}
addScenery();

function createNode(x, y, z, fixed = false) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(fixed ? .24 : .18, 18, 12),
    new THREE.MeshStandardMaterial({ color: fixed ? 0x465565 : 0x52c994, emissive: fixed ? 0x000000 : 0x103d2c, emissiveIntensity: .25 })
  );
  mesh.position.set(x, y, z); mesh.userData.nodeIndex = nodes.length; mesh.castShadow = true; nodeGroup.add(mesh);
  nodes.push({ pos: new THREE.Vector3(x, y, z), fixed, mesh });
  return nodes.length - 1;
}

function makeStickMesh(a, b) {
  const delta = new THREE.Vector3().subVectors(b, a); const length = delta.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.095, .095, length, 10), new THREE.MeshStandardMaterial({ color: safeColor.clone(), roughness: .8 }));
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
  mesh.castShadow = mesh.receiveShadow = true; return mesh;
}

function addStick(aIndex, bIndex, silent = false) {
  if (aIndex === bIndex || sticks.some(s => !s.broken && ((s.a === aIndex && s.b === bIndex) || (s.a === bIndex && s.b === aIndex)))) return;
  const a = nodes[aIndex].pos, b = nodes[bIndex].pos;
  if (a.distanceTo(b) > 4.8) { if (!silent) say('這兩個節點距離太遠，一根竹筷接不到。'); return; }
  const mesh = makeStickMesh(a, b); stickGroup.add(mesh);
  sticks.push({ a: aIndex, b: bIndex, mesh, body: null, constraints: [], broken: false, restLength: a.distanceTo(b), stress: 0, damage: 0, forceMode: '-' });
  updateStats();
}

function clearPhysics() {
  clearInterval(autoTimer); autoTimer = null;
  constraints.forEach(c => world.removeConstraint(c)); constraints.length = 0;
  anchorBodies.forEach(b => world.removeBody(b)); anchorBodies.length = 0;
  sticks.forEach(s => {
    if (s.body) world.removeBody(s.body);
    s.body = null; s.constraints = []; s.broken = false; s.stress = 0; s.damage = 0; s.forceMode = '-'; s.mesh.visible = true;
    s.mesh.material.color.copy(safeColor); s.mesh.material.emissive = new THREE.Color(0x000000); s.mesh.material.emissiveIntensity = 0;
  });
  weights.forEach(w => { world.removeBody(w.body); weightGroup.remove(w.mesh); }); weights.length = 0;
  broken = 0; totalWeight = 0; maxStressValue = 0; criticalMode = '-'; nodeFrames.length = 0;
}

function clearAll() {
  clearPhysics();
  sticks.forEach(s => stickGroup.remove(s.mesh)); sticks.length = 0;
  nodes.forEach(n => nodeGroup.remove(n.mesh)); nodes.length = 0;
  selectedNode = null; deleteMode = false; mode = 'build'; setButtons(); updateStats();
}

function baseNodes(extraHeights = true) {
  const xs = [-6, -4, -2, 0, 2, 4, 6];
  xs.forEach((x, i) => {
    createNode(x, 2, -1.25, i === 0 || i === xs.length - 1);
    createNode(x, 2, 1.25, i === 0 || i === xs.length - 1);
    if (extraHeights) {
      createNode(x, 4, -1.25, false);
      createNode(x, 4, 1.25, false);
    }
  });
  [-6.8, 6.8].forEach(x => {
    createNode(x, 4, -1.25, true);
    createNode(x, 4, 1.25, true);
  });
}

const id = (col, side, level = 0) => col * 4 + side + level * 2;

function loadTemplate(name) {
  clearAll(); templateName = name;
  document.querySelectorAll('[data-template]').forEach(b => b.classList.toggle('active', b.dataset.template === name));
  baseNodes(true);
  const addDeck = () => {
    for (let i=0;i<6;i++) { addStick(id(i,0),id(i+1,0),true); addStick(id(i,1),id(i+1,1),true); }
    for (let i=0;i<7;i++) addStick(id(i,0),id(i,1),true);
  };
  if (name === 'blank') { say('自由搭建：先用竹筷連接左右兩岸。'); updateStats(); return; }
  addDeck();
  if (name === 'truss') {
    for (let side=0;side<2;side++) for (let i=0;i<6;i++) {
      addStick(id(i,side,0),id(i,side,1),true); addStick(id(i,side,1),id(i+1,side,0),true);
    }
    for (let i=0;i<7;i++) addStick(id(i,0,1),id(i,1,1),true);
  }
  if (name === 'arch') {
    const archY = [2,3.4,4.5,4.9,4.5,3.4,2];
    for (let side=0;side<2;side++) {
      for (let i=0;i<7;i++) nodes[id(i,side,1)].pos.y = archY[i];
      for (let i=0;i<6;i++) addStick(id(i,side,1),id(i+1,side,1),true);
      for (let i=1;i<6;i++) addStick(id(i,side,0),id(i,side,1),true);
    }
    for (let i=1;i<6;i++) addStick(id(i,0,1),id(i,1,1),true);
    nodes.forEach(n => n.mesh.position.copy(n.pos));
  }
  if (name === 'cable') {
    for (let side=0;side<2;side++) {
      nodes[id(3,side,1)].pos.y = 7;
      addStick(id(3,side,0),id(3,side,1),true);
      [0,1,2,4,5,6].forEach(i => addStick(id(3,side,1),id(i,side,0),true));
    }
    addStick(id(3,0,1),id(3,1,1),true); nodes.forEach(n => n.mesh.position.copy(n.pos));
  }
  if (name === 'suspension') {
    for (let side=0;side<2;side++) {
      nodes[id(1,side,1)].pos.y = 6; nodes[id(5,side,1)].pos.y = 6;
      addStick(id(1,side,0),id(1,side,1),true); addStick(id(5,side,0),id(5,side,1),true);
      for (let i=1;i<5;i++) addStick(id(i,side,1),id(i+1,side,1),true);
      for (let i=1;i<=5;i++) addStick(id(i,side,0),id(i,side,1),true);
      addStick(id(0,side,0),id(1,side,1),true); addStick(id(5,side,1),id(6,side,0),true);
    }
    nodes.forEach(n => n.mesh.position.copy(n.pos));
  }
  say('已載入範本。你可以再增加斜撐或修改結構。'); updateStats();
}

function createBodyForStick(stick) {
  const a = nodes[stick.a].pos, b = nodes[stick.b].pos;
  const mid = a.clone().add(b).multiplyScalar(.5); const length = a.distanceTo(b);
  const body = new CANNON.Body({ mass: .1 + length*.035, material: stickMaterial, linearDamping: .16, angularDamping: .22 });
  body.addShape(new CANNON.Box(new CANNON.Vec3(.1, length/2, .1)));
  body.position.set(mid.x, mid.y, mid.z);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), b.clone().sub(a).normalize());
  body.quaternion.set(q.x,q.y,q.z,q.w); body.allowSleep = true; body.sleepSpeedLimit = .08; body.sleepTimeLimit = .45; world.addBody(body); stick.body = body;
}

function endpointLocal(stick, nodeIndex) {
  const half = stick.restLength / 2; return new CANNON.Vec3(0, nodeIndex === stick.a ? -half : half, 0);
}

function beginSimulation() {
  if (sticks.length < 3) { say('橋梁至少需要 3 根竹筷才能開始測試。'); return; }
  mode = 'simulate'; selectedNode = null; deleteMode = false; clearPhysics();
  sticks.forEach(createBodyForStick);
  const nodeLinks = nodes.map(() => []);
  sticks.forEach((s, si) => { nodeLinks[s.a].push({s, si}); nodeLinks[s.b].push({s, si}); });
  nodeLinks.forEach((links, ni) => {
    if (!links.length) return;
    const node = nodes[ni];
    if (node.fixed) {
      links.forEach(({s}) => {
        const anchor = new CANNON.Body({ mass:0 }); anchor.position.set(node.pos.x,node.pos.y,node.pos.z); world.addBody(anchor);
        anchorBodies.push(anchor);
        const c = new CANNON.PointToPointConstraint(s.body, endpointLocal(s,ni), anchor, new CANNON.Vec3(0,0,0), 1.15e6);
        world.addConstraint(c); constraints.push(c); s.constraints.push(c);
      });
    } else {
      for (let i=0;i<links.length;i++) {
        for (let j=i+1;j<links.length;j++) {
          const s0=links[i].s, s1=links[j].s;
          const c = new CANNON.PointToPointConstraint(s0.body, endpointLocal(s0,ni), s1.body, endpointLocal(s1,ni), 5.5e5);
          world.addConstraint(c); constraints.push(c); s0.constraints.push(c); s1.constraints.push(c);
        }
      }
    }
  });
  initialDeckY = deckCenterY(); setButtons(); say('模擬開始！逐步增加砝碼，觀察竹筷顏色與橋面形變。');
  if (ui.auto.checked) autoTimer = setInterval(() => { if (mode === 'simulate') addWeight(); }, 1800);
}

function addWeight() {
  if (mode !== 'simulate') return;
  const kg = Number(ui.weight.value);
  const xSlots = [0, -1.5, 1.5, -3, 3];
  const slot = weights.length % xSlots.length;
  const layer = Math.floor(weights.length / xSlots.length);
  const x = xSlots[slot];
  const z = 0;
  const deckY = deckCenterY() || initialDeckY;
  const shape = new CANNON.Box(new CANNON.Vec3(.55,.16,1.22));
  const startMass = Math.min(kg, .05);
  const body = new CANNON.Body({ mass: startMass, shape, material: weightMaterial, linearDamping: .2, angularDamping: .35 });
  body.position.set(x, deckY + .3 + layer*.34, z);
  // Model a guided loading rig: the weight transfers force vertically without rolling off the sparse deck.
  body.linearFactor.set(0, 1, 0);
  body.angularFactor.set(0, 0, 0);
  body.fixedRotation = true;
  body.updateMassProperties();
  body.allowSleep = true; body.sleepSpeedLimit = .12; body.sleepTimeLimit = .35;
  world.addBody(body);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1,.32,2.44), new THREE.MeshStandardMaterial({color:0x506b7a, roughness:.55, metalness:.35}));
  mesh.castShadow=true; weightGroup.add(mesh); weights.push({body,mesh,kg,loadProgress:0}); totalWeight += kg; updateStats();
  say(`已放上 ${totalWeight.toFixed(1)} kg。注意中央橋面與紅色竹筷。`);
}

function rampWeightLoads(dt) {
  weights.forEach(weight => {
    if (weight.loadProgress >= 1) return;
    weight.loadProgress = Math.min(1, weight.loadProgress + dt / .8);
    const eased = weight.loadProgress * weight.loadProgress * (3 - 2 * weight.loadProgress);
    weight.body.mass = Math.max(.05, weight.kg * eased);
    weight.body.updateMassProperties();
    weight.body.wakeUp();
  });
}

function breakStick(stick) {
  if (stick.broken) return;
  stick.broken = true; broken++;
  stick.constraints.forEach(c => { try { world.removeConstraint(c); } catch {} });
  stick.constraints.length = 0;
  stick.mesh.material.color.copy(dangerColor); stick.mesh.material.emissive = new THREE.Color(0x501010); stick.mesh.material.emissiveIntensity = .4;
}

function deckCenterY() {
  const deck = sticks.filter(s => !s.broken && nodes[s.a].pos.y <= 2.2 && nodes[s.b].pos.y <= 2.2 && s.body);
  if (!deck.length) return 0;
  if (nodeFrames.length) {
    let sum = 0, count = 0;
    deck.forEach(s => {
      sum += nodeFrames[s.a].pos.y + nodeFrames[s.b].pos.y;
      count += 2;
    });
    if (count) return sum / count;
  }
  return deck.reduce((sum,s)=>sum+s.body.position.y,0)/deck.length;
}

function evaluateFailure() {
  if (mode !== 'simulate') return;
  const y = deckCenterY(); const deformation = Math.max(0, (initialDeckY-y)*100);
  ui.deformation.textContent = deformation.toFixed(1);
  const fallenWeight = weights.some(w => w.body.position.y < .3);
  const severe = deformation > 120 || broken > Math.max(2, sticks.length*.2) || fallenWeight;
  if (severe) {
    mode='failed'; clearInterval(autoTimer); autoTimer=null; ui.add.disabled=true;
    const survived = Math.max(0, totalWeight - Number(ui.weight.value));
    if (survived > bestWeight) { bestWeight = survived; localStorage.setItem('chopstickBridgeBest', bestWeight); }
    say(`橋梁垮下了！本次大約承受 ${survived.toFixed(1)} kg。回到搭建模式，加上三角斜撐再試一次。`);
    updateStats();
  }
}

function resetBuild() {
  const keep = templateName;
  const structure = sticks.map(s=>[s.a,s.b]);
  clearPhysics(); mode='build';
  sticks.forEach(s => stickGroup.remove(s.mesh)); sticks.length=0;
  structure.forEach(([a,b])=>addStick(a,b,true));
  templateName=keep; setButtons(); updateStats(); say('已回到搭建模式，可以修改橋梁後再次測試。');
}

function computeNodeFrames() {
  nodeFrames.length = 0;
  nodes.forEach(() => nodeFrames.push({ pos: new THREE.Vector3(), count: 0, deflection: 0 }));
  sticks.forEach(s => {
    if (!s.body || s.broken) return;
    const a = localToThree(s.body, endpointLocal(s,s.a));
    const b = localToThree(s.body, endpointLocal(s,s.b));
    nodeFrames[s.a].pos.add(a); nodeFrames[s.a].count++;
    nodeFrames[s.b].pos.add(b); nodeFrames[s.b].count++;
  });
  nodeFrames.forEach((frame, i) => {
    if (frame.count) frame.pos.multiplyScalar(1 / frame.count);
    else frame.pos.copy(nodes[i].pos);
    if (nodes[i].fixed) frame.pos.lerp(nodes[i].pos, .75);
    frame.deflection = frame.pos.distanceTo(nodes[i].pos);
  });
}

function stressColor(stick) {
  if (!stick.body || stick.broken) return;
  const aNow = nodeFrames[stick.a]?.pos || nodes[stick.a].pos;
  const bNow = nodeFrames[stick.b]?.pos || nodes[stick.b].pos;
  const current = aNow.distanceTo(bNow);
  const strain = (current - stick.restLength) / stick.restLength;
  const mid = aNow.clone().add(bNow).multiplyScalar(.5);
  const bodyMid = new THREE.Vector3(stick.body.position.x, stick.body.position.y, stick.body.position.z);
  const bending = bodyMid.distanceTo(mid) / Math.max(1, stick.restLength);
  const jointShift = Math.max(nodeFrames[stick.a]?.deflection || 0, nodeFrames[stick.b]?.deflection || 0);
  const speed = stick.body.velocity.length() + stick.body.angularVelocity.length()*.3;
  const centerFactor = 1 - Math.min(1, Math.abs(stick.body.position.x)/7);
  const loadFactor = totalWeight / Math.max(1, sticks.length*.8);
  const axialStress = Math.abs(strain) * (strain < 0 ? 18 : 16);
  stick.forceMode = strain >= 0 ? '拉力' : '壓力';
  stick.stress = Math.min(1.8, axialStress + bending*.55 + jointShift*.12 + speed*.012 + loadFactor*centerFactor);
  const strength = Number(ui.strength.value)/100;
  if (stick.stress < .45*strength) stick.mesh.material.color.lerpColors(safeColor,warnColor,stick.stress/(.45*strength));
  else stick.mesh.material.color.lerpColors(warnColor,dangerColor,Math.min(1,(stick.stress-.45*strength)/(.55*strength)));
  if (stick.stress > maxStressValue) { maxStressValue = stick.stress; criticalMode = stick.forceMode; }
  if (stick.stress > .94*strength) stick.damage += (stick.stress/strength - .9) * .0016;
  else stick.damage = Math.max(0, stick.damage - .006);
  if (stick.damage > 1) breakStick(stick);
}

function localToThree(body, point) {
  const out = new CANNON.Vec3(); body.pointToWorldFrame(point,out); return new THREE.Vector3(out.x, out.y, out.z);
}

function sync() {
  computeNodeFrames();
  sticks.forEach(s => {
    if (!s.body) return;
    s.mesh.position.copy(s.body.position); s.mesh.quaternion.copy(s.body.quaternion); stressColor(s);
  });
  weights.forEach(w=>{w.mesh.position.copy(w.body.position);w.mesh.quaternion.copy(w.body.quaternion);});
}

function updateStats() {
  ui.stickCount.textContent = sticks.length; ui.brokenCount.textContent = broken;
  ui.totalWeight.textContent = totalWeight.toFixed(1); ui.bestWeight.textContent = Number(bestWeight).toFixed(1);
  ui.maxStress.textContent = Math.round(maxStressValue * 100);
  ui.forceMode.textContent = criticalMode;
}
function setButtons() {
  const building = mode==='build'; ui.start.disabled=!building; ui.add.disabled=mode!=='simulate'; ui.reset.disabled=building;
  ui.undo.disabled=!building; ui.deleteStick.disabled=!building; ui.clear.disabled=!building;
  ui.deleteStick.classList.toggle('active', building && deleteMode);
  ui.deleteStick.setAttribute('aria-pressed', building && deleteMode ? 'true' : 'false');
  ui.tip.textContent=building?(deleteMode?'刪除模式：點選要移除的竹筷':'搭建模式：請點選兩個節點'):'模擬模式：拖曳旋轉視角，觀察受力';
}
function say(text){ ui.observation.textContent=text; }

const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
function nearestStickAt(clientX, clientY, rect) {
  const click = new THREE.Vector2(clientX - rect.left, clientY - rect.top);
  let nearest = null; let nearestDistance = 14;
  sticks.forEach(stick => {
    const endpoints = [nodes[stick.a].pos, nodes[stick.b].pos].map(pos => {
      const projected = pos.clone().project(camera);
      return new THREE.Vector2((projected.x + 1) * rect.width / 2, (1 - projected.y) * rect.height / 2);
    });
    const segment = endpoints[1].clone().sub(endpoints[0]);
    const lengthSquared = segment.lengthSq();
    const t = lengthSquared ? THREE.MathUtils.clamp(click.clone().sub(endpoints[0]).dot(segment) / lengthSquared, 0, 1) : 0;
    const distance = click.distanceTo(endpoints[0].clone().addScaledVector(segment, t));
    if (distance < nearestDistance) { nearestDistance = distance; nearest = stick; }
  });
  return nearest;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (mode!=='build') return;
  const rect=renderer.domElement.getBoundingClientRect(); pointer.x=((e.clientX-rect.left)/rect.width)*2-1; pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  if (deleteMode) {
    const hit = raycaster.intersectObjects(sticks.map(s => s.mesh))[0];
    const target = hit ? sticks.find(s => s.mesh === hit.object) : nearestStickAt(e.clientX, e.clientY, rect);
    if (!target) { say('請直接點選要刪除的竹筷。'); return; }
    const index = sticks.indexOf(target);
    if (index < 0) return;
    stickGroup.remove(sticks[index].mesh); sticks.splice(index, 1); updateStats();
    say('已刪除一根竹筷。可以繼續刪除，或關閉刪除模式。');
    return;
  }
  const hit=raycaster.intersectObjects(nodes.map(n=>n.mesh))[0]; if(!hit)return;
  const idx=hit.object.userData.nodeIndex;
  if(selectedNode===null){selectedNode=idx;hit.object.scale.setScalar(1.55);say('已選第一個節點，再選另一個節點放上竹筷。');}
  else {nodes[selectedNode].mesh.scale.setScalar(1);addStick(selectedNode,idx);selectedNode=null;say('放好一根竹筷。繼續搭建，或開始承重測試。');}
});

function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(stage);
let last=performance.now();
function animate(now){requestAnimationFrame(animate);const dt=Math.min(.04,(now-last)/1000);last=now;if(mode!=='build'){rampWeightLoads(dt);world.step(1/120,dt,8);sync();evaluateFailure();updateStats();}controls.update();renderer.render(scene,camera);}
requestAnimationFrame(animate);

ui.start.addEventListener('click',beginSimulation); ui.add.addEventListener('click',addWeight); ui.reset.addEventListener('click',resetBuild);
ui.undo.addEventListener('click',()=>{if(!sticks.length)return;const s=sticks.pop();stickGroup.remove(s.mesh);updateStats();});
ui.deleteStick.addEventListener('click',()=>{
  if(mode!=='build') return;
  if(selectedNode!==null){nodes[selectedNode].mesh.scale.setScalar(1);selectedNode=null;}
  deleteMode=!deleteMode; setButtons();
  say(deleteMode?'刪除模式已開啟：點選畫面中的竹筷即可移除。':'已回到搭建模式，請點選兩個節點放上竹筷。');
});
ui.clear.addEventListener('click',()=>loadTemplate('blank'));
ui.strength.addEventListener('input',()=>ui.strengthValue.textContent=`${ui.strength.value}%`);
document.querySelectorAll('[data-template]').forEach(b=>b.addEventListener('click',()=>loadTemplate(b.dataset.template)));
$('#helpBtn').addEventListener('click',()=>$('#helpDialog').showModal());
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-selected', b === button ? 'true' : 'false'); });
  document.querySelectorAll('[data-tab-page]').forEach(page => page.classList.toggle('active', page.dataset.tabPage === button.dataset.tab));
}));
const missions=[['用不超過 18 根竹筷，承受 8 kg。',18,8],['設計一座至少有 6 個三角形的橋。',30,10],['比較拱橋和桁架橋，哪座承重較高？',40,15],['只用 24 根竹筷，挑戰承受 12 kg。',24,12]];
$('#newMissionBtn').addEventListener('click',()=>{ui.mission.textContent=missions[Math.floor(Math.random()*missions.length)][0];});
loadTemplate('truss'); resize(); updateStats(); setButtons();
