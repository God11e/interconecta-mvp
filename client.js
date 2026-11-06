let clientSession=null,clientProfile=null,currentActivity=null,authMode="login",pendingReserveId=null,pendingAction="reserve",reserveMode="reserve";

function visitorKey(){
  let key=localStorage.getItem("interconecta_visitor_key");
  if(!key){
    key=(crypto.randomUUID?crypto.randomUUID():"visitor-"+Date.now()+"-"+Math.random().toString(36).slice(2));
    localStorage.setItem("interconecta_visitor_key",key);
  }
  return key;
}
async function trackView(activityId){
  try{await db.rpc("track_activity_view",{p_activity:activityId,p_visitor_key:visitorKey()})}catch(e){}
}
async function bootClient(){
  ({session:clientSession,profile:clientProfile}=await sessionProfile());
  renderSession();await loadActivities();
  const id=new URLSearchParams(location.search).get("actividad");
  if(id)await openActivity(id,false);
}
function renderSession(){
  const logged=!!clientSession&&clientProfile?.role==="client";
  authBtn.classList.toggle("hidden",logged);logoutBtn.classList.toggle("hidden",!logged);bookingsBtn.classList.toggle("hidden",!logged);
}
async function clientLogout(){await signOut();clientSession=null;clientProfile=null;renderSession();showExplore()}
function showExplore(){
  exploreView.classList.remove("hidden");detailView.classList.add("hidden");bookingsView.classList.add("hidden");
  history.replaceState(null,"",location.pathname);loadActivities();
}
async function loadActivities(){
  const {data,error}=await db.from("activities").select("*").eq("status","active").order("event_date",{ascending:true}).order("event_time",{ascending:true});
  if(error){activityGrid.innerHTML=`<div class="empty">${esc(error.message)}</div>`;return}
  const text=q.value.trim().toLowerCase(),area=areaFilter.value.trim().toLowerCase(),date=dateFilter.value;
  const arr=(data||[]).filter(a=>(!text||(a.title+" "+(a.description||"")+" "+(a.category||"")+" "+(a.venue_name||"")).toLowerCase().includes(text))&&(!area||String(a.area).toLowerCase().includes(area))&&(!date||a.event_date===date));
  count.textContent=arr.length+" actividad(es)";
  activityGrid.innerHTML=arr.length?arr.map(activityCard).join(""):`<div class="empty" style="grid-column:1/-1">No encontramos actividades.</div>`;
}
function activityCard(a){
  const free=Math.max(0,a.capacity-a.reserved_count);
  return `<article class="card"><div class="card-media"><h3>${esc(a.title)}</h3></div><div class="card-body">
    <div class="meta">${fmtDate(a.event_date)} · ${fmtTime(a.event_time)} · ${esc(a.area)}</div>
    <div class="meta">${esc(a.org_name||"Organizador")}${a.venue_name?` · ${esc(a.venue_name)}`:""}</div>
    <p class="desc">${esc(a.description||"")}</p>
    <div class="card-foot"><div><div class="price">${money(a.price)}</div><div class="availability">${free>0?free+" cupos disponibles":"Sin cupos · lista de espera"}</div></div>
    <button class="btn btn-primary" onclick="openActivity('${a.id}')">Ver actividad</button></div></div></article>`;
}
async function openActivity(id,push=true){
  const {data:a,error}=await db.from("activities").select("*").eq("id",id).maybeSingle();
  if(error||!a){exploreView.classList.add("hidden");detailView.classList.remove("hidden");detailView.innerHTML=`<div class="empty">Esta actividad no existe o ya no está disponible.</div>`;return}
  currentActivity=a;if(new URLSearchParams(location.search).get("preview")!=="1")trackView(id);
  if(push)history.pushState(null,"",`?actividad=${encodeURIComponent(id)}`);
  exploreView.classList.add("hidden");bookingsView.classList.add("hidden");detailView.classList.remove("hidden");
  const free=Math.max(0,a.capacity-a.reserved_count);
  detailView.innerHTML=`<button class="btn btn-outline btn-sm" onclick="showExplore()">← Volver</button>
  <div class="detail-grid" style="margin-top:14px"><div class="detail-main"><div class="detail-cover"><h1>${esc(a.title)}</h1></div><div class="detail-copy">
    <div class="meta">${fmtDate(a.event_date)} · ${fmtTime(a.event_time)} · ${esc(a.area)}</div>
    ${a.venue_name?`<p><strong>Lugar:</strong> ${esc(a.venue_name)}</p>`:""}
    ${a.address?`<p><strong>Dirección:</strong> ${esc(a.address)}</p>`:""}
    <p>${esc(a.description||"")}</p>
    <div class="info-grid">
      <div class="info"><small>Cupos disponibles</small><strong>${free} de ${a.capacity}</strong></div>
      <div class="info"><small>Precio</small><strong>${money(a.price)}</strong></div>
      <div class="info"><small>Incluye</small><strong>${esc(a.includes||"—")}</strong></div>
      <div class="info"><small>Cancelación</small><strong>${esc(a.policy||"Consulta al organizador")}</strong></div>
    </div>
    ${a.instructions?`<div class="instructions"><strong>Antes de asistir</strong><p>${esc(a.instructions)}</p></div>`:""}
    <h3>Organiza</h3><p>${esc(a.org_name||"Organizador")}</p>
  </div></div>
  <aside class="sidebox"><small class="sub">Reserva</small><h2>${money(a.price)}</h2><p class="sub">${free>0?free+" cupos disponibles":"Actividad completa"}</p>
    ${free>0?`<button class="btn btn-accent" style="width:100%" onclick="reserveClick('${a.id}')">Reservar ahora</button>`:`<button class="btn btn-primary" style="width:100%" onclick="waitlistClick('${a.id}')">Unirme a lista de espera</button>`}
    <button class="btn btn-outline" style="width:100%;margin-top:8px" onclick="shareClientActivity('${a.id}')">Compartir</button>
  </aside></div>`;
}
function openAuth(mode="login"){authModal.classList.add("open");setAuthMode(mode)}
function closeAuth(){authModal.classList.remove("open")}
function setAuthMode(mode){
  authMode=mode;loginTab.classList.toggle("active",mode==="login");registerTab.classList.toggle("active",mode==="register");
  registerNameField.classList.toggle("hidden",mode!=="register");authSubmit.textContent=mode==="login"?"Ingresar":"Crear cuenta";authMsg.innerHTML="";
}
async function submitClientAuth(){
  const u=normalizeUsername(username.value),p=password.value;
  if(!validUsername(u)){notify(authMsg,"Usa un nombre de usuario de al menos 3 caracteres, sin espacios.","error");return}
  if(p.length<6){notify(authMsg,"La contraseña debe tener al menos 6 caracteres.","error");return}
  let result;
  if(authMode==="register"){
    const name=displayName.value.trim();
    if(name.length<2){notify(authMsg,"Escribe tu nombre.","error");return}
    result=await db.auth.signUp({email:authEmail(u),password:p,options:{data:{username:u,display_name:name,role:"client"}}});
    if(!result.error&&!result.data.session){notify(authMsg,"La cuenta fue creada, pero Supabase está pidiendo confirmar correo. Desactiva Confirm Email para este piloto.","warn");return}
  }else result=await db.auth.signInWithPassword({email:authEmail(u),password:p});
  if(result.error){notify(authMsg,result.error.message,"error");return}
  ({session:clientSession,profile:clientProfile}=await sessionProfile());
  if(clientProfile?.role!=="client"){await signOut();notify(authMsg,"Esta cuenta pertenece a un organizador. Usa la página de administradores.","error");return}
  closeAuth();renderSession();
  if(pendingReserveId){const id=pendingReserveId,action=pendingAction;pendingReserveId=null;pendingAction="reserve";await openActivity(id,false);openReserve(action)}
}
function reserveClick(id){
  if(!clientSession){pendingReserveId=id;pendingAction="reserve";openAuth("login");notify(authMsg,"Ingresa o crea una cuenta para reservar.");return}
  openReserve("reserve");
}
function openReserve(mode="reserve"){
  reserveMode=mode;reserveMsg.innerHTML="";reservePhone.value="";reserveQty.value="1";
  reserveForm.classList.remove("hidden");reserveSuccess.classList.add("hidden");reserveSuccess.innerHTML="";
  reserveQtyField.classList.toggle("hidden",mode==="waitlist");
  reserveSubmitBtn.textContent=mode==="waitlist"?"Unirme a lista de espera":"Confirmar reserva";
  reserveModal.classList.add("open");reserveTitle.textContent=mode==="waitlist"?"Lista de espera":"Confirmar reserva";
}
function closeReserve(){reserveModal.classList.remove("open")}
function validPhone(v){const d=String(v||"").replace(/\D/g,"");return d.length>=8&&d.length<=15}
async function confirmReservation(){
  if(!currentActivity){notify(reserveMsg,"Vuelve a abrir la actividad.","error");return}
  const qty=reserveMode==="waitlist"?1:Number(reserveQty.value),phone=reservePhone.value.trim();
  if(!validPhone(phone)){notify(reserveMsg,"Ingresa un teléfono o WhatsApp válido.","error");return}

  if(reserveMode==="waitlist"){
    const {error}=await db.rpc("join_waitlist",{p_activity:currentActivity.id,p_phone:phone});
    if(error){notify(reserveMsg,error.message,"error");return}
    reserveForm.classList.add("hidden");reserveSuccess.classList.remove("hidden");reserveTitle.textContent="Lista de espera";
    reserveSuccess.innerHTML=`<div class="confirmation-card"><div class="confirmation-icon">✓</div><h2>Te agregamos a la lista de espera</h2>
      <p><strong>${esc(currentActivity.title)}</strong></p>
      <p class="sub">Si se libera un cupo, el sistema podrá asignártelo. El organizador tendrá tu teléfono para contactarte si es necesario.</p>
      <div class="quick-actions" style="justify-content:center;margin-top:14px"><button class="btn btn-primary" onclick="closeReserve();showBookings()">Ver mis reservas</button></div></div>`;
    return;
  }

  const {error}=await db.rpc("reserve_activity",{p_activity:currentActivity.id,p_qty:qty,p_phone:phone});
  if(error){notify(reserveMsg,error.message,"error");return}
  const {data:fresh}=await db.from("activities").select("*").eq("id",currentActivity.id).maybeSingle();
  if(fresh)currentActivity=fresh;
  reserveForm.classList.add("hidden");reserveSuccess.classList.remove("hidden");reserveTitle.textContent="Reserva confirmada";
  reserveSuccess.innerHTML=`<div class="confirmation-card"><div class="confirmation-icon">✓</div><h2>¡Listo! Tu reserva está confirmada</h2>
    <p><strong>${esc(currentActivity.title)}</strong></p>
    <div class="confirmation-details">
      <div><span>Fecha</span><strong>${fmtDate(currentActivity.event_date)} · ${fmtTime(currentActivity.event_time)}</strong></div>
      <div><span>Lugar</span><strong>${esc(currentActivity.venue_name||currentActivity.area)}</strong></div>
      ${currentActivity.address?`<div><span>Dirección</span><strong>${esc(currentActivity.address)}</strong></div>`:""}
      <div><span>Cupos</span><strong>${qty}</strong></div>
      <div><span>Contacto entregado</span><strong>${esc(phone)}</strong></div>
    </div>
    ${currentActivity.instructions?`<div class="notice warn"><strong>Antes de asistir:</strong> ${esc(currentActivity.instructions)}</div>`:""}
    <div class="quick-actions" style="margin-top:14px">
      <button class="btn btn-primary" onclick="downloadCalendar()">Agregar al calendario</button>
      <button class="btn btn-outline" onclick="closeReserve();showBookings()">Ver mis reservas</button>
    </div></div>`;
}
function icsEscape(v){return String(v||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;")}
function calendarStamp(date,time){
  const clean=String(time||"00:00").slice(0,5).replace(":","");
  return String(date||"").replace(/-/g,"")+"T"+clean+"00";
}
function downloadCalendar(){
  if(!currentActivity)return;
  const start=calendarStamp(currentActivity.event_date,currentActivity.event_time);
  const location=[currentActivity.venue_name,currentActivity.address,currentActivity.area].filter(Boolean).join(", ");
  const text=[
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//InterConecta//Pilot//ES","BEGIN:VEVENT",
    "UID:"+currentActivity.id+"@interconecta",
    "DTSTART:"+start,
    "SUMMARY:"+icsEscape(currentActivity.title),
    "LOCATION:"+icsEscape(location),
    "DESCRIPTION:"+icsEscape((currentActivity.description||"")+(currentActivity.instructions?"\\nIndicaciones: "+currentActivity.instructions:"")),
    "END:VEVENT","END:VCALENDAR"
  ].join("\r\n");
  const blob=new Blob([text],{type:"text/calendar;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=(currentActivity.title||"actividad").replace(/[^\w\-]+/g,"-")+".ics";a.click();URL.revokeObjectURL(url);
}
async function waitlistClick(id){
  if(!clientSession){pendingReserveId=id;pendingAction="waitlist";openAuth("login");notify(authMsg,"Ingresa o crea una cuenta para entrar a la lista de espera.");return}
  openReserve("waitlist");
}
async function showBookings(){
  if(!clientSession){openAuth("login");return}
  exploreView.classList.add("hidden");detailView.classList.add("hidden");bookingsView.classList.remove("hidden");
  const [{data:res,error:re},{data:wait,error:we}]=await Promise.all([
    db.from("reservations").select("*,activities(title,event_date,event_time,area,venue_name,address)").eq("client_id",clientSession.user.id).order("created_at",{ascending:false}),
    db.from("waitlist").select("*,activities(title,event_date,event_time,area,venue_name,address)").eq("client_id",clientSession.user.id).eq("status","waiting").order("created_at",{ascending:false})
  ]);
  if(re||we){myBookings.innerHTML=`<div class="empty">${esc(re?.message||we?.message)}</div>`;return}
  const wh=(wait||[]).map(w=>`<div class="block"><div class="block-body"><strong>${esc(w.activities?.title||"Actividad")}</strong>
    <div class="sub">${fmtDate(w.activities?.event_date)} · ${fmtTime(w.activities?.event_time)} · ${esc(w.activities?.venue_name||w.activities?.area||"")}</div>
    ${w.contact_phone?`<div class="sub">Contacto: ${esc(w.contact_phone)}</div>`:""}<div class="status warn" style="margin-top:8px">Lista de espera</div>
    <div class="quick-actions"><button class="btn btn-danger btn-sm" onclick="leaveWait('${w.id}')">Salir de la lista</button></div></div></div>`).join("");
  const rh=(res||[]).map(r=>`<div class="block"><div class="block-body"><div style="display:flex;justify-content:space-between;gap:10px">
    <div><strong>${esc(r.activities?.title||"Actividad")}</strong><div class="sub">${fmtDate(r.activities?.event_date)} · ${fmtTime(r.activities?.event_time)} · ${esc(r.activities?.venue_name||r.activities?.area||"")}</div>
    ${r.contact_phone?`<div class="sub">Contacto: ${esc(r.contact_phone)}</div>`:""}</div>
    <span class="status ${r.status==="confirmed"?"ok":"cancel"}">${r.status==="confirmed"?"Confirmada":"Cancelada"}</span></div>
    ${r.reason?`<p class="sub">${esc(r.reason)}</p>`:""}
    ${r.status==="confirmed"?`<div class="quick-actions"><button class="btn btn-danger btn-sm" onclick="cancelReservation('${r.id}')">Cancelar reserva</button></div>`:""}
  </div></div>`).join("");
  myBookings.innerHTML=(wh+rh)||`<div class="empty">Aún no tienes reservas.</div>`;
}
async function cancelReservation(id){
  if(!confirm("¿Cancelar esta reserva?"))return;
  const {error}=await db.rpc("cancel_reservation",{p_reservation:id});if(error)alert(error.message);await showBookings();
}
async function leaveWait(id){const {error}=await db.rpc("leave_waitlist",{p_waitlist:id});if(error)alert(error.message);await showBookings()}
async function shareClientActivity(id){
  const link=location.origin+location.pathname+"?actividad="+id;
  try{if(navigator.share){await navigator.share({title:currentActivity?.title||"InterConecta",url:link});return}}catch(e){if(e.name==="AbortError")return}
  await copyText(link);alert("Enlace copiado.");
}
window.addEventListener("popstate",()=>{const id=new URLSearchParams(location.search).get("actividad");if(id)openActivity(id,false);else showExplore()});
bootClient();
