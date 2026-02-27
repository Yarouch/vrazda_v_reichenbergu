const KEY = "reichenberg_session_v1";

export function loadSession(){
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); }
  catch { return null; }
}

export function saveSession(s){
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession(){
  localStorage.removeItem(KEY);
}

export function formatTime(sec){
  sec = Math.max(0, Math.floor(sec));
  const m = String(Math.floor(sec/60)).padStart(2,"0");
  const s = String(sec%60).padStart(2,"0");
  return `${m}:${s}`;
}