const CFG = window.INTERCONECTA_CONFIG || {};
if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("PEGA_AQUI") ||
    !CFG.SUPABASE_PUBLISHABLE_KEY || CFG.SUPABASE_PUBLISHABLE_KEY.includes("PEGA_AQUI")) {
  console.warn("InterConecta: falta configurar Supabase en js/config.js");
}

// Cada superficie usa su propia sesión aunque comparta el mismo dominio.
// Esto evita que probar el enlace de cliente cierre la sesión del administrador.
const AUTH_SURFACE = location.pathname.startsWith("/admin") ? "admin" : location.pathname.startsWith("/analytics") ? "analytics" : "client";
const db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: `interconecta-${AUTH_SURFACE}-auth-v1`,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const RM_COMUNAS = [
  "Alhué","Buin","Calera de Tango","Cerrillos","Cerro Navia","Colina","Conchalí","Curacaví","El Bosque","El Monte",
  "Estación Central","Huechuraba","Independencia","Isla de Maipo","La Cisterna","La Florida","La Granja","La Pintana","La Reina","Lampa",
  "Las Condes","Lo Barnechea","Lo Espejo","Lo Prado","Macul","Maipú","María Pinto","Melipilla","Ñuñoa","Padre Hurtado","Paine",
  "Pedro Aguirre Cerda","Peñaflor","Peñalolén","Pirque","Providencia","Pudahuel","Puente Alto","Quilicura","Quinta Normal","Recoleta",
  "Renca","San Bernardo","San Joaquín","San José de Maipo","San Miguel","San Pedro","San Ramón","Santiago","Talagante","Tiltil","Vitacura"
];

function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;")}
function money(n){return Number(n)===0?"Gratis":"$"+Number(n||0).toLocaleString("es-CL")}
function fmtDate(v){if(!v)return"";const d=new Date(v+"T12:00:00");return d.toLocaleDateString("es-CL",{day:"numeric",month:"short",year:"numeric"})}
function fmtTime(v){return String(v||"").slice(0,5)}
function normalizeUsername(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g,".").replace(/[^a-z0-9._-]/g,"").slice(0,40)}
function authEmail(username){return normalizeUsername(username)+"@pilot.interconecta.cl"}
function validUsername(v){return /^[a-z0-9][a-z0-9._-]{2,39}$/.test(normalizeUsername(v))}
function notify(el,msg,type=""){if(!el)return;el.innerHTML=`<div class="notice ${type}">${esc(msg)}</div>`}
async function sessionProfile(){const {data:{session}}=await db.auth.getSession();if(!session)return {session:null,profile:null};const {data:profile}=await db.from("profiles").select("*").eq("id",session.user.id).maybeSingle();return {session,profile}}
async function signOut(){await db.auth.signOut()}
function copyText(text){if(navigator.clipboard)return navigator.clipboard.writeText(text);return Promise.resolve()}

function chileNowParts(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return parts;
}
function chileNowKey(){const p=chileNowParts();return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`}
function chileToday(){return chileNowKey().slice(0,10)}
function activityTimeKey(a){return `${String(a?.event_date||"")}T${fmtTime(a?.event_time)}`}
function activityIsFuture(a){return !!a?.event_date&&!!a?.event_time&&activityTimeKey(a)>chileNowKey()}
function paymentText(a){return Number(a?.price||0)===0?"Actividad gratuita. No se requiere pago.":"Pago directo con el organizador/local. InterConecta no procesa pagos en línea."}

function fillCommuneSelect(el,{all=false}={}){
  if(!el)return;
  const current=String(el.value||"");
  el.innerHTML=(all?'<option value="">Todas las comunas</option>':'<option value="">Selecciona una comuna</option>')+RM_COMUNAS.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
  if(current)setCommuneValue(el,current);
}
function setCommuneValue(el,value){
  if(!el)return;
  const raw=String(value||"").trim();if(!raw){el.value="";return}
  const found=[...el.options].find(o=>o.value.toLocaleLowerCase("es-CL")===raw.toLocaleLowerCase("es-CL"));
  if(found){el.value=found.value;return}
  const opt=document.createElement("option");opt.value=raw;opt.textContent=raw;el.appendChild(opt);el.value=raw;
}
