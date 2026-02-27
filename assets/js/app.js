import { loadSession, saveSession, clearSession } from "./storage.js";

const btnStart = document.getElementById("btnStart");
const btnResume = document.getElementById("btnResume");

const s = loadSession();
if(s?.active) btnResume.style.display = "block";

btnStart.onclick = async () => {
  clearSession();
  saveSession({
    active:true,
    startedAt: Date.now(),
    elapsedSec: 0,
    penaltySec: 0,
    hintsUsed: 0,
    stageIndex: 0,
    evidence: [],
    bonusEligible: false,
    bonusCompleted: false
  });
  location.href = "game.html";
};

btnResume.onclick = () => location.href = "game.html";
