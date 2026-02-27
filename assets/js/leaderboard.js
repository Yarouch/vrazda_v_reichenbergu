const SUPABASE_URL = "https://TVUJ_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "TVUJ_ANON_KEY";

const statusEl = document.getElementById("lbStatus");
const listEl = document.getElementById("lbList");

function formatTime(sec){
  sec = Math.max(0, Number(sec) || 0);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

async function supabaseSelectTop(limit=30){
  const url =
    `${SUPABASE_URL}/rest/v1/leaderboard` +
    `?select=team_name,time_sec,hints_used,bonus_completed,created_at` +
    `&order=time_sec.asc,created_at.asc` +
    `&limit=${limit}`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });

  if(!res.ok){
    const t = await res.text();
    throw new Error(`Supabase select failed: ${res.status} ${t}`);
  }
  return res.json();
}

function render(rows){
  if(!rows.length){
    statusEl.textContent = "Zatím žádné výsledky.";
    listEl.innerHTML = "";
    return;
  }

  statusEl.textContent = `Zobrazuji top ${rows.length}`;
  listEl.innerHTML = rows.map((r, i) => {
    const medal = i===0 ? "🥇" : i===1 ? "🥈" : i===2 ? "🥉" : `${i+1}.`;
    const bonus = r.bonus_completed ? "⭐ BONUS" : "";
    return `
      <div style="display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid rgba(34,48,65,.6);">
        <div>
          <div style="font-weight:800;">${medal} ${escapeHtml(r.team_name)}</div>
          <div class="muted" style="font-size:12px;">Nápovědy: ${r.hints_used} ${bonus}</div>
        </div>
        <div class="mono" style="font-weight:900;font-size:16px;">${formatTime(r.time_sec)}</div>
      </div>
    `;
  }).join("");
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

(async function main(){
  try{
    const rows = await supabaseSelectTop(30);
    render(rows);
  } catch(e){
    statusEl.textContent = "Nepodařilo se načíst leaderboard.";
    listEl.innerHTML = `<div class="muted" style="margin-top:8px;">${escapeHtml(e.message)}</div>`;
  }
})();
