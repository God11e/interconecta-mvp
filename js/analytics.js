let analyticsSession=null,analyticsProfile=null,analyticsRows=[];

async function bootAnalytics(){
  ({session:analyticsSession,profile:analyticsProfile}=await sessionProfile());
  if(analyticsSession){
    const ok=await loadTeamAnalytics(false);
    if(ok){showAnalyticsApp();return}
    await signOut();analyticsSession=null;analyticsProfile=null;
  }
}
function showAnalyticsApp(){
  analyticsAuth.classList.add("hidden");analyticsApp.classList.remove("hidden");analyticsLogout.classList.remove("hidden");
  analyticsIdentity.textContent=analyticsProfile?.username||"Equipo";
}
async function submitAnalyticsAuth(){
  const u=normalizeUsername(analyticsUsername.value),p=analyticsPassword.value;
  if(!validUsername(u)){notify(analyticsAuthMsg,"Revisa el nombre de usuario.","error");return}
  if(p.length<6){notify(analyticsAuthMsg,"La contraseña debe tener al menos 6 caracteres.","error");return}
  const result=await db.auth.signInWithPassword({email:authEmail(u),password:p});
  if(result.error){notify(analyticsAuthMsg,result.error.message,"error");return}
  ({session:analyticsSession,profile:analyticsProfile}=await sessionProfile());
  const ok=await loadTeamAnalytics(false);
  if(!ok){await signOut();analyticsSession=null;analyticsProfile=null;notify(analyticsAuthMsg,"Esta cuenta no está autorizada para ver la analítica global.","error");return}
  analyticsAuthMsg.innerHTML="";showAnalyticsApp();
}
async function analyticsSignOut(){await signOut();location.reload()}

async function loadTeamAnalytics(showError=true){
  const {data,error}=await db.rpc("get_team_analytics");
  if(error){if(showError)alert(error.message);return false}
  analyticsRows=data||[];renderTeamAnalytics();return true;
}
function rowFuture(r){return activityIsFuture(r)}
function activityState(r){
  if(r.status==="cancelled")return {label:"Cancelada",cls:"cancel"};
  if(r.status==="paused")return {label:"Pausada",cls:"warn"};
  if(!rowFuture(r))return {label:"Finalizada",cls:""};
  return {label:"Próxima",cls:"ok"};
}
function renderTeamAnalytics(){
  const rows=analyticsRows;
  const locales=new Set(rows.map(r=>r.org_name||"Sin nombre"));
  const visits=rows.reduce((n,r)=>n+Number(r.visits||0),0);
  const reservations=rows.reduce((n,r)=>n+Number(r.reservations_generated||0),0);
  tLocales.textContent=locales.size;tActivities.textContent=rows.length;tVisits.textContent=visits;tReservations.textContent=reservations;tConversion.textContent=(visits?Math.round(reservations/visits*100):0)+"%";

  const grouped={};
  rows.forEach(r=>{
    const k=r.org_name||"Sin nombre";
    grouped[k]??={org:k,activities:0,visits:0,reservations:0,cancelled:0,capacity:0,reserved:0};
    const g=grouped[k];g.activities++;g.visits+=Number(r.visits||0);g.reservations+=Number(r.reservations_generated||0);g.cancelled+=Number(r.cancellations||0);g.capacity+=Number(r.capacity||0);g.reserved+=Number(r.reserved_count||0);
  });
  const locals=Object.values(grouped).sort((a,b)=>a.org.localeCompare(b.org,"es"));
  localAnalytics.innerHTML=locals.length?`<table><thead><tr><th>Local</th><th>Actividades</th><th>Visitas</th><th>Reservas</th><th>Conversión</th><th>Ocupación actual</th><th>Cancelaciones</th></tr></thead><tbody>${locals.map(g=>`<tr><td><strong>${esc(g.org)}</strong></td><td>${g.activities}</td><td>${g.visits}</td><td>${g.reservations}</td><td>${g.visits?Math.round(g.reservations/g.visits*100):0}%</td><td>${g.capacity?Math.round(g.reserved/g.capacity*100):0}%</td><td>${g.cancelled}</td></tr>`).join("")}</tbody></table>`:'<div class="empty">Aún no hay datos de locales.</div>';

  const sorted=[...rows].sort((a,b)=>String(b.event_date+b.event_time).localeCompare(String(a.event_date+a.event_time)));
  activityAnalytics.innerHTML=sorted.length?`<table><thead><tr><th>Local</th><th>Actividad</th><th>Fecha</th><th>Estado</th><th>Visitas</th><th>Reservas</th><th>Conversión</th><th>Ocupación</th><th>Cancelaciones</th><th>Espera</th></tr></thead><tbody>${sorted.map(r=>{const st=activityState(r);return `<tr><td>${esc(r.org_name||"—")}</td><td><strong>${esc(r.title)}</strong></td><td>${fmtDate(r.event_date)} · ${fmtTime(r.event_time)}</td><td><span class="status ${st.cls}">${st.label}</span></td><td>${Number(r.visits||0)}</td><td>${Number(r.reservations_generated||0)}</td><td>${Number(r.visits||0)?Math.round(Number(r.reservations_generated||0)/Number(r.visits||0)*100):0}%</td><td>${Number(r.capacity||0)?Math.round(Number(r.reserved_count||0)/Number(r.capacity||0)*100):0}%</td><td>${Number(r.cancellations||0)}</td><td>${Number(r.waiting||0)}</td></tr>`}).join("")}</tbody></table>`:'<div class="empty">Aún no hay actividades registradas.</div>';
}
bootAnalytics();
