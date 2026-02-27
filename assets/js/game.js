import {
  loadSession, saveSession, clearSession, formatTime,
  loadTrail, saveTrail, clearTrail
} from "./storage.js";

import { watchPosition, haversineM } from "./geo.js";
import { initMap, makeMarker } from "./map.js";

// ===== DOM =====
const timerEl = document.getElementById("timer");
const gpsEl = document.getElementById("gpsStatus");
const kickerEl = document.getElementById("stageKicker");
const titleEl = document.getElementById("stageTitle");
const storyEl = document.getElementById("stageStory");
const taskEl = document.getElementById("stageTask");
const distPill = document.getElementById("distancePill");
const evidenceChips = document.getElementById("evidenceChips");

const progressText = document.getElementById("progressText");
const progressPct = document.getElementById("progressPct");
const progressFill = document.getElementById("progressFill");

const answerRow = document.getElementById("answerRow");
const answerInput = document.getElementById("answerInput");
const btnSubmit = document.getElementById("btnSubmit");
const mcqRow = document.getElementById("mcqRow");

const toastEl = document.getElementById("toast");

const hintsModal = document.getElementById("hintsModal");
const menuModal = document.getElementById("menuModal");
const hintText = document.getElementById("hintText");

// ===== UI handlers =====
document.getElementById("btnHints").onclick = () => openModal(hintsModal);
document.getElementById("btnMenu").onclick = () => openModal(menuModal);
document.getElementById("btnCloseHints").onclick = () => closeModal(hintsModal);
document.getElementById("btnCloseMenu").onclick = () => closeModal(menuModal);

document.getElementById("btnReset").onclick = () => {
  if (confirm("Opravdu restartovat hru?")) {
    clearSession();
    clearTrail(); // ✅ smaž i breadcrumb trail
    location.href = "index.html";
  }
};

// ===== State =====
let data;
let map;
let targetMarker = null;
let playerMarker = null;

let player = { lat: null, lng: null, acc: null };

// GPS breadcrumb trail
let playerTrail = [];       // [[lat,lng,t], ...]
let playerTrailLine = null; // polyline
const TRAIL_MAX = 300;
const TRAIL_MIN_STEP_M = 8;   // ignoruj menší posun (GPS šum)
const TRAIL_MIN_STEP_SEC = 4; // minimální čas mezi body

// completed route (stage points)
let completedRoute = null; // polyline dokončených bodů
let completedDots = [];    // ✅ tečky dokončených bodů

// session
let session = loadSession();
if (!session?.active) location.href = "index.html";

// ===== Main =====
(async function main() {
  // ✅ mapa naskočí hned
  map = initMap();

  // vrstva breadcrumb trail
  playerTrail = loadTrail(); // může být []
  playerTrailLine = L.polyline(playerTrail.map(p => [p[0], p[1]]), { weight: 4, opacity: 0.8 }).addTo(map);

  // vrstva dokončených bodů
  completedRoute = L.polyline([], { weight: 5, opacity: 0.9 }).addTo(map);

  // načti JSON
  try {
    const res = await fetch("data/case_reichenberg.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`JSON load failed: ${res.status} ${res.statusText}`);
    data = await res.json();
  } catch (e) {
    console.error(e);
    toast("Chyba: nepodařilo se načíst data hry (JSON). Zkontroluj cestu / GitHub Pages.");
    gpsEl.textContent = "—";
    return;
  }

  // timer
  setInterval(() => {
    const base = Math.floor((Date.now() - session.startedAt) / 1000);
    session.elapsedSec = base;
    timerEl.textContent = formatTime(base + (session.penaltySec || 0));
    saveSession(session);
  }, 500);

  // gps
  watchPosition(
    (p) => {
      player.lat = p.coords.latitude;
      player.lng = p.coords.longitude;
      player.acc = Math.round(p.coords.accuracy || 0);

      gpsEl.textContent = `OK (±${player.acc} m)`;

      pushTrailPoint(player.lat, player.lng);

      if (!playerMarker) {
        playerMarker = L.circleMarker([player.lat, player.lng], { radius: 6 }).addTo(map);
      } else {
        playerMarker.setLatLng([player.lat, player.lng]);
      }

      updateDistanceUI();
    },
    () => {
      gpsEl.textContent = "Vypnuto";
      updateDistanceUI(true);
    }
  );

  document.getElementById("btnCenter").onclick = () => {
    if (player.lat != null) map.setView([player.lat, player.lng], 16);
    else if (targetMarker) map.setView(targetMarker.getLatLng(), 16);
  };

  // hint buttons
  document.querySelectorAll("#hintsModal [data-hint]").forEach(btn => {
    btn.addEventListener("click", () => {
      const lvl = Number(btn.dataset.hint);
      useHint(lvl);
    });
  });

  renderStage();
})();

// ===== UI helpers =====
function openModal(el) { el.style.display = "flex"; }
function closeModal(el) { el.style.display = "none"; }

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.display = "block";
  setTimeout(() => (toastEl.style.display = "none"), 1800);
}

// ===== GPS trail =====
function pushTrailPoint(lat, lng) {
  const now = Date.now();
  const last = playerTrail[playerTrail.length - 1];

  if (last) {
    const dt = (now - (last[2] || 0)) / 1000;
    const d = haversineM(last[0], last[1], lat, lng);

    if (dt < TRAIL_MIN_STEP_SEC) return;
    if (d < TRAIL_MIN_STEP_M) return;
  }

  playerTrail.push([lat, lng, now]);

  if (playerTrail.length > TRAIL_MAX) {
    playerTrail = playerTrail.slice(playerTrail.length - TRAIL_MAX);
  }

  if (playerTrailLine) {
    playerTrailLine.setLatLngs(playerTrail.map(p => [p[0], p[1]]));
  }

  saveTrail(playerTrail);
}

// ===== Game logic =====
function currentStage() {
  const total = data?.stages?.length || 0;
  const raw = Number(session.stageIndex || 0);
  const idx = Math.max(0, Math.min(total - 1, Number.isFinite(raw) ? raw : 0));
  session.stageIndex = idx;
  return data.stages[idx];
}

function renderEvidence() {
  evidenceChips.innerHTML = "";
  for (const id of session.evidence || []) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = data.evidence?.[id]?.label || id;
    evidenceChips.appendChild(chip);
  }
}

function updateCompletedRoute() {
  if (!data || !map || !completedRoute) return;

  // ✅ bonus v trase ANO => nefiltrujeme isBonus
  const doneStages = data.stages.slice(0, Math.max(0, session.stageIndex));

  const latlngs = doneStages
    .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map(s => [s.lat, s.lng]);

  completedRoute.setLatLngs(latlngs);

  // Tečky: smaž staré
  completedDots.forEach(d => map.removeLayer(d));
  completedDots = [];

  // Tečky: nakresli nové
  latlngs.forEach(ll => {
    const dot = L.circleMarker(ll, { radius: 5, opacity: 1, fillOpacity: 1 }).addTo(map);
    completedDots.push(dot);
  });
}

function updateProgressUI(stage) {
  const mainStages = data.stages.filter(s => !s.isBonus);
  const mainIndex = mainStages.findIndex(s => s.id === stage.id);

  const completed = stage.isBonus ? mainStages.length : Math.max(0, mainIndex);
  const total = mainStages.length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  if (progressText) progressText.textContent = `Postup: ${completed} / ${total}`;
  if (progressPct) progressPct.textContent = `${pct}%`;
  if (progressFill) progressFill.style.width = `${pct}%`;
}

function renderStage() {
  const stage = currentStage();
  if (!stage) {
    toast("Chyba: nenalezeno stanoviště.");
    return;
  }

  const mainStages = data.stages.filter(s => !s.isBonus);
  const mainIndex = mainStages.findIndex(s => s.id === stage.id);
  const isBonus = !!stage.isBonus;

  kickerEl.textContent = isBonus
    ? "BONUS — Dopadení"
    : `Stanoviště ${Math.max(1, mainIndex + 1)} / ${mainStages.length}`;

  titleEl.textContent = stage.title || "—";
  storyEl.textContent = stage.story || "";
  taskEl.textContent = stage.task || "";

  updateProgressUI(stage);

  // ✅ marker jen pro aktuální bod
  try {
    if (targetMarker) map.removeLayer(targetMarker);
  } catch {}

  if (Number.isFinite(stage.lat) && Number.isFinite(stage.lng)) {
    targetMarker = makeMarker(map, stage.lat, stage.lng, stage.title || "Cíl");
    map.setView([stage.lat, stage.lng], 16);
  } else {
    toast("Chyba: stanoviště nemá souřadnice.");
  }

  // input type
  if (stage.answer?.type === "mcq") {
    answerRow.style.display = "none";
    mcqRow.style.display = "flex";
    mcqRow.innerHTML = "";

    (stage.answer.options || []).forEach(opt => {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = opt;
      b.onclick = () => submitAnswer(opt);
      mcqRow.appendChild(b);
    });
  } else {
    mcqRow.style.display = "none";
    answerRow.style.display = "flex";
    answerInput.value = "";
    btnSubmit.onclick = () => submitAnswer(answerInput.value);
  }

  renderEvidence();
  updateDistanceUI();
  updateCompletedRoute();
}

function updateDistanceUI(gpsOff = false) {
  const stage = currentStage();
  if (!stage) return;

  if (gpsOff || player.lat == null) {
    distPill.textContent = "GPS vypnuto (soft)";
    distPill.className = "pill";
    return;
  }

  const d = Math.round(haversineM(player.lat, player.lng, stage.lat, stage.lng));
  const radius = stage.radiusM || data.meta?.defaultRadiusM || 50;

  distPill.textContent = d <= radius ? `✅ ${d} m` : `⚠️ ${d} m`;
}

function normalize(v) {
  return String(v ?? "").trim().toLowerCase();
}

function isCorrect(stage, givenRaw) {
  const ans = stage.answer || {};
  if (ans.type === "number") {
    const n = Number(givenRaw);
    return Number.isFinite(n) && n === ans.value;
  }
  if (ans.type === "mcq") {
    return normalize(givenRaw) === normalize(ans.value);
  }
  return normalize(givenRaw) === normalize(ans.value);
}

function unlockEvidence(stage) {
  session.evidence = session.evidence || [];
  for (const ev of stage.evidenceUnlock || []) {
    if (!session.evidence.includes(ev)) session.evidence.push(ev);
  }
}

function submitAnswer(given) {
  const stage = currentStage();

  if (!isCorrect(stage, given)) {
    toast("Nesedí to. Zkus to znovu.");
    return;
  }

  unlockEvidence(stage);
  toast("Správně. Nová stopa odhalena.");

  const nextIndex = session.stageIndex + 1;

  // bonus gate
  if (nextIndex < data.stages.length && data.stages[nextIndex].isBonus) {
    const totalTime = (session.elapsedSec || 0) + (session.penaltySec || 0);
    const threshold = data.meta?.bonusTimeThresholdSec ?? 4200;

    session.bonusEligible = totalTime <= threshold;

    if (session.bonusEligible) {
      session.stageIndex = nextIndex;
      saveSession(session);
      renderStage();
      return;
    } else {
      finishGame(false);
      return;
    }
  }

  // bonus completed
  if (stage.isBonus) {
    session.bonusCompleted = true;
    finishGame(true);
    return;
  }

  // end reached
  if (nextIndex >= data.stages.length) {
    finishGame(false);
    return;
  }

  session.stageIndex = nextIndex;
  saveSession(session);
  renderStage();
}

function useHint(level) {
  const stage = currentStage();
  const idx = Math.min(3, Math.max(1, level)) - 1;
  const text = stage.hints?.[idx] || "—";
  hintText.textContent = text;

  const p = data.penalties || { hint1Sec: 120, hint2Sec: 240, hint3Sec: 360 };
  const add = level === 1 ? p.hint1Sec : level === 2 ? p.hint2Sec : p.hint3Sec;

  session.penaltySec = (session.penaltySec || 0) + add;
  session.hintsUsed = (session.hintsUsed || 0) + 1;
  saveSession(session);

  toast(`Nápověda použita (+${Math.round(add / 60)} min)`);
}

function finishGame(bonusDone) {
  session.active = false;
  session.bonusCompleted = !!bonusDone;
  saveSession(session);
  location.href = "end.html";
}
