const SUPABASE_URL = "https://hpawsxioispppkfiridq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwYXdzeGlvaXNwcHBrZmlyaWRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTY5NTEsImV4cCI6MjA4Nzc5Mjk1MX0.Hts2vRw-u-QQ0cJnKy7lt6cmDeZSLdDp2BuimJ_aPQ0";
const TOP_N = 20;

const statusEl = document.getElementById("lbStatus");
const listEl = document.getElementById("lbList");

function formatTime(sec){
  sec = Math.max(0, Number(sec) || 0);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

async function loadTop(){
  const url =
    `${SUPABASE_URL}/rest/v1/leaderboard` +
    `?select=team_name,time_sec,hints_used,bonus_completed,created_at` +
    `&order=time_sec.asc,created_at.asc` +
    `&limit=${TOP_N}`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });

  if(!res.ok){
    const t = await res.text();
    throw new Error(`Supabase SELECT failed: ${res.status} ${t}`);
  }

  return res.json();
}

function medal(i){
  if(i === 0) return "🥇";
  if(i === 1) return "🥈";
  if(i === 2) return "🥉";
  return `${i+1}.`;
}

function render(rows){
  if(!rows.length){
    statusEl.textContent = "Zatím žádné výsledky.";
    listEl.innerHTML = `<p class="muted">Buďte první, kdo odešle výsledek z konce hry.</p>`;
    return;
  }

  statusEl.textContent = `Načteno ${rows.length} / ${TOP_N}`;

  listEl.innerHTML = rows.map((r, i) => {
    const bonus = r.bonus_completed ? "⭐ BONUS" : "";
    const hints = Number(r.hints_used || 0);

    return `
      <div class="row" style="padding:10px 0; border-bottom:1px solid rgba(34,48,65,.55);">
        <div>
          <div style="font-weight:800;">${medal(i)} ${escapeHtml(r.team_name)}</div>
          <div class="muted" style="font-size:12px;">Nápovědy: ${hints} ${bonus}</div>
        </div>
        <div class="mono" style="font-weight:900; font-size:16px;">${formatTime(r.time_sec)}</div>
      </div>
    `;
  }).join("");
}

(async function main(){
  try{
    const rows = await loadTop();
    render(rows);
  } catch(e){
    statusEl.textContent = "Chyba";
    listEl.innerHTML = `
      <p class="muted">Nepodařilo se načíst leaderboard.</p>
      <p class="muted" style="font-size:12px;">${escapeHtml(e.message)}</p>
    `;
  }
})();
