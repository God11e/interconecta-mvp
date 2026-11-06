let adminSession=null,adminProfile=null,adminAuthMode="login",editingId=null;
let cachedActivities=[],cachedReservations=[],cachedWait=[],cachedViews={};

async function bootAdmin(){
  ({session:adminSession,profile:adminProfile}=await sessionProfile());
  if(adminSession&&adminProfile?.role==="admin"){
    showAdminApp();await refreshAdmin();setInterval(()=>{if(adminSession)refreshAdmin(false)},5000);
  }else if(adminSession){
    await signOut();adminSession=null;adminProfile=null;notify(adminAuthMsg,"Esta cuenta no es de administrador.","error");
  }
}
function setAdminAuthMode(mode){
  adminAuthMode=mode;aLoginTab.classList.toggle("active",mode==="login");aRegisterTab.classList.toggle("active",mode==="register");
  adminRegisterFields.classList.toggle("hidden",mode!=="register");adminAuthSubmit.textContent=mode==="login"?"Ingresar":"Crear cuenta de organizador";adminAuthMsg.innerHTML="";
}
async function submitAdminAuth(){
  const u=normalizeUsername(aUsername.value),p=aPassword.value;
  if(!validUsername(u)){notify(adminAuthMsg,"Usa un nombre de usuario de al menos 3 caracteres, sin espacios.","error");return}
  if(p.length<6){notify(adminAuthMsg,"La contraseña debe tener al menos 6 caracteres.","error");return}
  let result;
  if(adminAuthMode==="register"){
    const name=aDisplayName.value.trim(),org=aOrgName.value.trim();
    if(name.length<2||org.length<2){notify(adminAuthMsg,"Completa el nombre del responsable y del local/taller.","error");return}
    result=await db.auth.signUp({email:authEmail(u),password:p,options:{data:{username:u,display_name:name,role:"admin",org_name:org}}});
    if(!result.error&&!result.data.session){notify(adminAuthMsg,"La cuenta fue creada, pero Supabase está pidiendo confirmar correo. Desactiva Confirm Email para este piloto.","warn");return}
  }else result=await db.auth.signInWithPassword({email:authEmail(u),password:p});
  if(result.error){notify(adminAuthMsg,result.error.message,"error");return}
  ({session:adminSession,profile:adminProfile}=await sessionProfile());
  if(adminProfile?.role!=="admin"){await signOut();notify(adminAuthMsg,"Esta cuenta pertenece a un cliente. Usa la web de clientes.","error");return}
  showAdminApp();await refreshAdmin();
}
function showAdminApp(){
  adminAuth.classList.add("hidden");adminApp.classList.remove("hidden");adminLogout.classList.remove("hidden");
  orgLabel.textContent=adminProfile.org_name||"Mi organización";adminIdentity.textContent=adminProfile.username;
}
async function adminSignOut(){await signOut();location.reload()}
function openAdminTab(name,btn){
  document.querySelectorAll(".admin-tab").forEach(x=>x.classList.remove("active"));document.getElementById("tab-"+name).classList.add("active");
  document.querySelectorAll(".menu button").forEach(x=>x.classList.remove("active"));if(btn)btn.classList.add("active");
}
async function refreshAdmin(showErrors=true){
  if(!adminSession)return;
  const {data:acts,error:ae}=await db.from("activities").select("*").eq("owner_id",adminSession.user.id).order("event_date",{ascending:true}).order("event_time",{ascending:true});
  if(ae){if(showErrors)alert(ae.message);return}
  cachedActivities=acts||[];const ids=cachedActivities.map(a=>a.id);
  const {data:viewRows,error:ve}=await db.rpc("get_my_activity_views");
  if(ve){if(showErrors)console.warn(ve.message);cachedViews={}}else cachedViews=Object.fromEntries((viewRows||[]).map(x=>[x.activity_id,Number(x.visits||0)]));
  if(ids.length){
    const [{data:res,error:re},{data:wait,error:we}]=await Promise.all([
      db.from("reservations").select("*").in("activity_id",ids).order("created_at",{ascending:false}),
      db.from("waitlist").select("*").in("activity_id",ids).eq("status","waiting").order("created_at",{ascending:true})
    ]);
    if(re||we){if(showErrors)alert(re?.message||we?.message);return}
    cachedReservations=res||[];cachedWait=wait||[];
  }else{cachedReservations=[];cachedWait=[]}
  renderAdmin();
}
function statsFor(a){
  const all=cachedReservations.filter(r=>r.activity_id===a.id);
  const confirmed=all.filter(r=>r.status==="confirmed");
  const cancelled=all.filter(r=>r.status==="cancelled");
  const wait=cachedWait.filter(w=>w.activity_id===a.id).length;
  const visits=cachedViews[a.id]||0;
  const generated=all.length;
  const conversion=visits?Math.round(generated/visits*100):0;
  const occupancy=a.capacity?Math.round(a.reserved_count/a.capacity*100):0;
  return {all,confirmed,cancelled,wait,visits,generated,conversion,occupancy,free:Math.max(0,a.capacity-a.reserved_count)};
}
function renderAdmin(){
  const active=cachedActivities.filter(a=>a.status==="active"),confirmed=cachedReservations.filter(r=>r.status==="confirmed");
  const occupied=active.reduce((n,a)=>n+a.reserved_count,0),capacity=active.reduce((n,a)=>n+a.capacity,0);
  const visits=active.reduce((n,a)=>n+(cachedViews[a.id]||0),0),generated=cachedReservations.length,cancelled=cachedReservations.filter(r=>r.status==="cancelled").length;
  const conversion=visits?Math.round(generated/visits*100):0;
  kActive.textContent=active.length;kReservations.textContent=confirmed.length;kOccupied.textContent=occupied;kWait.textContent=cachedWait.length;
  aVisits.textContent=visits;aGenerated.textContent=generated;aConversion.textContent=conversion+"%";
  aOccupancy.textContent=capacity?Math.round(occupied/capacity*100)+"%":"0%";aCancelled.textContent=cancelled;
  overviewActivities.innerHTML=active.slice(0,4).map(activityRow).join("")||'<div class="empty">Todavía no tienes actividades publicadas.</div>';
  activitiesList.innerHTML=cachedActivities.map(activityRow).join("")||'<div class="empty">Crea tu primera actividad para comenzar el piloto.</div>';
  overviewReservations.innerHTML=reservationTable(cachedReservations.slice(0,5));
  reservationsTable.innerHTML=reservationTable(cachedReservations);
  participantsTable.innerHTML=participantTable(cachedReservations);
  waitlistBox.innerHTML=cachedWait.length?cachedWait.map(waitRow).join(""):'<div class="empty">No hay personas en lista de espera.</div>';
  activityMetrics.innerHTML=metricsTable();
}
function activityRow(a){
  const st=a.status,label=st==="active"?"Publicada":st==="paused"?"Pausada":"Cancelada",s=statsFor(a);
  return `<div class="activity-row"><div><strong>${esc(a.title)}</strong>
    <div class="sub">${fmtDate(a.event_date)} · ${fmtTime(a.event_time)} · ${esc(a.venue_name||a.area)}</div>
    <div class="activity-summary">${st==="cancelled"?"Historial conservado · ":""}${a.reserved_count}/${a.capacity} reservados · ${s.free} libres · ${s.cancelled.length} cancelaciones · ${s.wait} en espera · ${s.visits} visitas</div>
  </div>
  <div><span class="status ${st==="active"?"ok":st==="cancelled"?"cancel":"warn"}">${label}</span></div>
  <div><strong>${a.reserved_count}/${a.capacity}</strong><div class="sub">cupos</div></div>
  <div class="quick-actions">
    ${st==="active"?`<button class="btn btn-outline btn-sm" onclick="previewActivity('${a.id}')">Vista previa</button>
    <button class="btn btn-primary btn-sm" onclick="copyReservationLink('${a.id}')">Copiar enlace</button>
    <button class="btn btn-whatsapp btn-sm" onclick="shareWhatsApp('${a.id}')">WhatsApp</button>`:""}
    ${st!=="cancelled"?`<button class="btn btn-outline btn-sm" onclick="editActivity('${a.id}')">Editar</button>
    <button class="btn btn-outline btn-sm" onclick="togglePause('${a.id}')">${st==="paused"?"Reactivar":"Pausar"}</button>
    <button class="btn btn-danger btn-sm" onclick="cancelActivity('${a.id}')">Cancelar</button>`:""}
    <button class="btn btn-outline btn-sm" onclick="duplicateActivity('${a.id}')">Duplicar</button>
  </div></div>`;
}
function reservationTable(arr){
  if(!arr.length)return '<div class="empty">Aún no hay reservas.</div>';
  return `<table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Actividad</th><th>Cupos</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>${arr.map(r=>{
    const a=cachedActivities.find(x=>x.id===r.activity_id);
    return `<tr><td>${esc(r.client_name)}<div class="sub">@${esc(r.client_username)}</div></td>
      <td>${esc(r.contact_phone||"—")}</td><td>${esc(a?.title||"-")}</td><td>${r.qty}</td>
      <td>${r.status==="confirmed"?'<span class="status ok">Confirmada</span>':'<span class="status cancel">Cancelada</span>'}</td>
      <td>${new Date(r.created_at).toLocaleString("es-CL")}</td></tr>`}).join("")}</tbody></table>`;
}
function participantTable(arr){
  const confirmed=arr.filter(r=>r.status==="confirmed");
  if(!confirmed.length)return '<div class="empty">Aún no hay participantes confirmados.</div>';
  return `<table><thead><tr><th>Participante</th><th>Teléfono</th><th>Actividad</th><th>Cupos</th><th>Asistencia</th></tr></thead><tbody>${confirmed.map(r=>{
    const a=cachedActivities.find(x=>x.id===r.activity_id);
    return `<tr><td>${esc(r.client_name)}</td><td>${esc(r.contact_phone||"—")}</td><td>${esc(a?.title||"-")}</td><td>${r.qty}</td>
      <td><button class="btn ${r.attendance?"btn-primary":"btn-outline"} btn-sm" onclick="toggleAttendance('${r.id}',${!r.attendance})">${r.attendance?"Asistió":"Marcar asistencia"}</button></td></tr>`}).join("")}</tbody></table>`;
}
function waitRow(w){
  const a=cachedActivities.find(x=>x.id===w.activity_id);
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--line)">
    <div><strong>${esc(w.client_name)}</strong><div class="sub">${esc(a?.title||"-")} · @${esc(w.client_username)}</div>${w.contact_phone?`<div class="sub">Contacto: ${esc(w.contact_phone)}</div>`:""}</div>
    <button class="btn btn-primary btn-sm" onclick="promoteWait('${w.id}')">Dar cupo</button></div>`;
}
function metricsTable(){
  if(!cachedActivities.length)return '<div class="empty">Crea una actividad para comenzar a medir.</div>';
  return `<table><thead><tr><th>Actividad</th><th>Visitas</th><th>Reservas generadas</th><th>Conversión</th><th>Ocupación</th><th>Cancelaciones</th><th>Espera</th></tr></thead><tbody>
  ${cachedActivities.map(a=>{const s=statsFor(a);return `<tr><td>${esc(a.title)}</td><td>${s.visits}</td><td>${s.generated}</td><td>${s.conversion}%</td><td>${s.occupancy}%</td><td>${s.cancelled.length}</td><td>${s.wait}</td></tr>`}).join("")}
  </tbody></table>`;
}
function showActivityForm(){
  editingId=null;formTitle.textContent="Nueva actividad";saveActivityBtn.textContent="Publicar actividad";activityForm.classList.remove("hidden");activityFormMsg.innerHTML="";
  fTitle.value="";fDate.value="";fTime.value="";fArea.value="";fVenue.value="";fAddress.value="";fPrice.value="0";fCapacity.value="10";fDescription.value="";fIncludes.value="";fPolicy.value="";fInstructions.value="";
}
function hideActivityForm(){activityForm.classList.add("hidden");editingId=null}
function editActivity(id){
  const a=cachedActivities.find(x=>x.id===id);if(!a)return;editingId=id;openAdminTab("activities");activityForm.classList.remove("hidden");
  formTitle.textContent="Editar actividad";saveActivityBtn.textContent="Guardar cambios";
  fTitle.value=a.title;fCategory.value=a.category;fDate.value=a.event_date;fTime.value=fmtTime(a.event_time);fArea.value=a.area;
  fVenue.value=a.venue_name||"";fAddress.value=a.address||"";fPrice.value=a.price;fCapacity.value=a.capacity;fDescription.value=a.description||"";
  fIncludes.value=a.includes||"";fPolicy.value=a.policy||"";fInstructions.value=a.instructions||"";
  activityForm.scrollIntoView({behavior:"smooth"});
}
async function saveActivity(){
  const payload={
    title:fTitle.value.trim(),category:fCategory.value,event_date:fDate.value,event_time:fTime.value,area:fArea.value.trim(),
    venue_name:fVenue.value.trim(),address:fAddress.value.trim(),price:Number(fPrice.value),capacity:Number(fCapacity.value),
    description:fDescription.value.trim(),includes:fIncludes.value.trim(),policy:fPolicy.value.trim(),instructions:fInstructions.value.trim(),
    org_name:adminProfile.org_name||adminProfile.display_name
  };
  if(payload.title.length<3||!payload.event_date||!payload.event_time||!payload.area||!Number.isInteger(payload.capacity)||payload.capacity<1||payload.price<0){
    notify(activityFormMsg,"Completa nombre, fecha, hora, comuna, precio y cupos correctamente.","error");return;
  }
  let error;
  if(editingId){
    const current=cachedActivities.find(a=>a.id===editingId);
    if(payload.capacity<current.reserved_count){notify(activityFormMsg,"No puedes bajar los cupos por debajo de las reservas existentes.","error");return}
    ({error}=await db.from("activities").update(payload).eq("id",editingId));
  }else{
    payload.owner_id=adminSession.user.id;payload.status="active";({error}=await db.from("activities").insert(payload));
  }
  if(error){notify(activityFormMsg,error.message,"error");return}
  notify(activityFormMsg,editingId?"Cambios guardados.":"Actividad publicada.");editingId=null;await refreshAdmin();
}
async function duplicateActivity(id){
  const a=cachedActivities.find(x=>x.id===id);if(!a)return;
  const copy={owner_id:adminSession.user.id,title:a.title+" · copia",category:a.category,event_date:a.event_date,event_time:a.event_time,area:a.area,
    venue_name:a.venue_name,address:a.address,price:a.price,capacity:a.capacity,description:a.description,includes:a.includes,policy:a.policy,
    instructions:a.instructions,org_name:a.org_name,status:"paused"};
  const {error}=await db.from("activities").insert(copy);if(error)alert(error.message);await refreshAdmin();
}
async function togglePause(id){
  const a=cachedActivities.find(x=>x.id===id);if(!a)return;
  const {error}=await db.from("activities").update({status:a.status==="paused"?"active":"paused"}).eq("id",id);if(error)alert(error.message);await refreshAdmin();
}
async function cancelActivity(id){
  const a=cachedActivities.find(x=>x.id===id);if(!a)return;
  const s=statsFor(a);
  const people=s.confirmed.reduce((n,r)=>n+Number(r.qty||0),0);
  const message=`Esta actividad tiene ${s.confirmed.length} reserva(s) confirmada(s) para ${people} cupo(s)${s.wait?` y ${s.wait} persona(s) en lista de espera`:""}.

Al cancelarla, dejará de aparecer en Explorar, las reservas quedarán marcadas como canceladas y el historial se conservará para el organizador y los participantes.

¿Deseas continuar?`;
  if(!confirm(message))return;
  const {error}=await db.rpc("cancel_activity",{p_activity:id});
  if(error){alert(error.message);return}
  alert("Actividad cancelada. El historial de reservas y métricas se conservó.");
  await refreshAdmin();
}
function reservationLink(id){return location.origin+"/?actividad="+id}
function previewActivity(id){window.open(reservationLink(id)+"&preview=1","_blank","noopener")}
async function copyReservationLink(id){
  const link=reservationLink(id);await copyText(link);alert("Enlace de reserva copiado:\n"+link);
}
function shareWhatsApp(id){
  const a=cachedActivities.find(x=>x.id===id);if(!a)return;
  const link=reservationLink(id);
  const text=`Hola 👋 Tenemos cupos para ${a.title} el ${fmtDate(a.event_date)} a las ${fmtTime(a.event_time)}. Puedes reservar directamente aquí: ${link}`;
  window.open("https://wa.me/?text="+encodeURIComponent(text),"_blank","noopener");
}
async function toggleAttendance(id,value){
  const {error}=await db.from("reservations").update({attendance:value}).eq("id",id);if(error)alert(error.message);await refreshAdmin();
}
async function promoteWait(id){
  const {error}=await db.rpc("admin_promote_waitlist",{p_waitlist:id});if(error)alert(error.message);await refreshAdmin();
}
function exportCSV(){
  const rows=[["Nombre","Usuario","Teléfono","Actividad","Cupos","Estado","Fecha"]];
  cachedReservations.forEach(r=>{const a=cachedActivities.find(x=>x.id===r.activity_id);rows.push([r.client_name,r.client_username,r.contact_phone||"",a?.title||"",r.qty,r.status,new Date(r.created_at).toLocaleString("es-CL")])});
  const csv="\ufeff"+rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),el=document.createElement("a");
  el.href=url;el.download="reservas-interconecta.csv";el.click();URL.revokeObjectURL(url);
}
bootAdmin();
