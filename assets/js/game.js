import { loadSession, saveSession, clearSession, formatTime } from "./storage.js";
import { watchPosition, haversineM } from "./geo.js";
import { initMap, makeMarker } from "./map.js";

const timerEl = document.getElementById("timer");
const gpsEl = document.getElementById("gpsStatus");
const kickerEl = document.getElementById("stageKicker");
const titleEl = document.getElementById("stageTitle");
const storyEl = document.getElementById("stageStory");
const taskEl = document.getElementById("stageTask");
const distPill = document.getElementById("distancePill");
const evidenceChips = document.getElementById("evidenceChips");

const answerRow = document.getElementById("answerRow");
const answerInput = document.getElementById("answerInput");
const btnSubmit = document.getElementById("btnSubmit");

const mcqRow = document.getElementById("mcqRow");

const toastEl = document.getElementById("toast");

const hintsModal = document.getElementById("hintsModal");
const menuModal = document.getElementById("menuModal");
const hintText = document.getElementById("hintText");

document.getElementById("btnHints").onclick = ()=> openModal(hintsModal);
document.getElementById("btnMenu").onclick = ()=> openModal(menuModal);
document.getElementById("btnCloseHints").onclick = ()=> closeModal(hintsModal);
document.getElementById("btnCloseMenu").onclick = ()=> closeModal(menuModal);

document.getElementById("btnReset").onclick = ()=>{
  if(confirm("Opravdu restartovat hru?")){
    clearSession();
    location.href="index.html";
  }
};

let data;
let map;
let targetMarker = null;
let playerMarker = null;

let player = { lat:null, lng:null, acc:null };

let session = loadSession();
if(!session?.active) location.href = "index.html";

(async function main(){
  data = await (await fetch("data/case_reichenberg.json")).json();

  map = initMap();

  // timer
  setInterval(()=>{
    const base = Math.floor((Date.now() - session.startedAt)/1000);
    session.elapsedSec = base;
    timerEl.textContent = formatTime(base + (session.penaltySec||0));
    saveSession(session);
  }, 500);

  // gps
  const stop = watchPosition(
    (p)=>{
      player.lat = p.coords.latitude;
      player.lng = p.coords.longitude;
      player.acc = Math.round(p.coords.accuracy || 0);
      gpsEl.textContent = `OK (±${player.acc} m)`;
      if(!playerMarker){
        playerMarker = L.circleMarker([player.lat, player.lng], { radius:6 }).addTo(map);
      } else {
        playerMarker.setLatLng([player.lat, player.lng]);
      }
      updateDistanceUI();
    },
    ()=>{
      gpsEl.textContent = "Vypnuto";
      updateDistanceUI(true);
    }
  );

  document.getElementById("btnCenter").onclick = ()=>{
    if(player.lat!=null) map.setView([player.lat, player.lng], 16);
    else if(targetMarker) map.setView(targetMarker.getLatLng(), 16);
  };

  // hint buttons
  document.querySelectorAll("#hintsModal [data-hint]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const lvl = Number(btn.dataset.hint);
      useHint(lvl);
    });
  });

  renderStage();
})();

function openModal(el){ el.style.display="flex"; }
function closeModal(el){ el.style.display="none"; }

function toast(msg){
  toastEl.textContent = msg;
  toastEl.style.display="block";
  setTimeout(()=>toastEl.style.display="none", 1800);
}

function currentStage(){
  // If bonus stage is active, stageIndex points to it
  return data.stages[session.stageIndex];
}

function renderEvidence(){
  evidenceChips.innerHTML = "";
  for(const id of session.evidence || []){
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = data.evidence?.[id]?.label || id;
    evidenceChips.appendChild(chip);
  }
}

function renderStage(){
  const stage = currentStage();
  const totalMain = data.stages.filter(s=>!s.isBonus).length;
  const mainIndex = data.stages.filter(s=>!s.isBonus).findIndex(s=>s.id===stage.id);

  const isBonus = !!stage.isBonus;
  kickerEl.textContent = isBonus ? "BONUS" : `Stanoviště ${mainIndex+1}/${totalMain}`;
  titleEl.textContent = stage.title;
  storyEl.textContent = stage.story;
  taskEl.textContent = stage.task;

  // marker
  if(targetMarker) map.removeLayer(targetMarker);
  targetMarker = makeMarker(map, stage.lat, stage.lng, stage.title);
  map.setView([stage.lat, stage.lng], 16);

  // input type
  if(stage.answer.type === "mcq"){
    answerRow.style.display = "none";
    mcqRow.style.display = "flex";
    mcqRow.innerHTML = "";
    stage.answer.options.forEach(opt=>{
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = opt;
      b.onclick = ()=> submitAnswer(opt);
      mcqRow.appendChild(b);
    });
  } else {
    mcqRow.style.display = "none";
    answerRow.style.display = "flex";
    answerInput.value = "";
    btnSubmit.onclick = ()=> submitAnswer(answerInput.value);
  }

  renderEvidence();
  updateDistanceUI();
}

function updateDistanceUI(gpsOff=false){
  const stage = currentStage();
  if(gpsOff || player.lat==null){
    distPill.textContent = "GPS vypnuto (soft)";
    distPill.className = "pill";
    return;
  }
  const d = Math.round(haversineM(player.lat, player.lng, stage.lat, stage.lng));
  if(d <= (stage.radiusM || data.meta.defaultRadiusM)){
    distPill.textContent = `✅ ${d} m`;
  } else {
    distPill.textContent = `⚠️ ${d} m`;
  }
}

function normalize(v){
  return String(v ?? "").trim().toLowerCase();
}

function isCorrect(stage, givenRaw){
  const given = normalize(givenRaw);
  const ans = stage.answer;
  if(ans.type === "number"){
    const n = Number(givenRaw);
    return Number.isFinite(n) && n === ans.value;
  }
  if(ans.type === "mcq"){
    return normalize(givenRaw) === normalize(ans.value);
  }
  return given === normalize(ans.value);
}

function unlockEvidence(stage){
  for(const ev of stage.evidenceUnlock || []){
    if(!session.evidence.includes(ev)) session.evidence.push(ev);
  }
}

function submitAnswer(given){
  const stage = currentStage();
  if(!isCorrect(stage, given)){
    toast("Nesedí to. Zkus to znovu.");
    return;
  }

  unlockEvidence(stage);
  toast("Správně. Nová stopa odhalena.");

  // advance
  const nextIndex = session.stageIndex + 1;

  // If finishing main stage 5 -> decide bonus eligibility
  const isLastMain = !stage.isBonus && data.stages.filter(s=>!s.isBonus).every((s,i)=> i===0 ? true : true);
  // simpler: check if next stage exists and isBonus
  // We'll compute eligibility when about to enter bonus stage:
  if(nextIndex < data.stages.length && data.stages[nextIndex].isBonus){
    const totalTime = (session.elapsedSec || 0) + (session.penaltySec || 0);
    const threshold = data.meta.bonusTimeThresholdSec ?? 4200;
    session.bonusEligible = totalTime <= threshold;

    if(session.bonusEligible){
      // go to bonus
      session.stageIndex = nextIndex;
      saveSession(session);
      renderStage();
      return;
    } else {
      // skip bonus and finish
      finishGame(false);
      return;
    }
  }

  // If bonus completed
  if(stage.isBonus){
    session.bonusCompleted = true;
    finishGame(true);
    return;
  }

  // normal next
  if(nextIndex >= data.stages.length){
    finishGame(false);
    return;
  }

  session.stageIndex = nextIndex;
  saveSession(session);
  renderStage();
}

function useHint(level){
  const stage = currentStage();
  const idx = Math.min(3, Math.max(1, level)) - 1;
  const text = stage.hints?.[idx] || "—";
  hintText.textContent = text;

  const p = data.penalties || { hint1Sec:120, hint2Sec:240, hint3Sec:360 };
  const add = level===1 ? p.hint1Sec : level===2 ? p.hint2Sec : p.hint3Sec;

  session.penaltySec = (session.penaltySec||0) + add;
  session.hintsUsed = (session.hintsUsed||0) + 1;
  saveSession(session);

  toast(`Nápověda použita (+${Math.round(add/60)} min)`);
}

function finishGame(bonusDone){
  session.active = false;
  session.bonusCompleted = !!bonusDone;
  saveSession(session);
  location.href = "end.html";
}