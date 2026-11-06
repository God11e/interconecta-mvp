const CFG = window.INTERCONECTA_CONFIG || {};
if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("PEGA_AQUI") ||
    !CFG.SUPABASE_PUBLISHABLE_KEY || CFG.SUPABASE_PUBLISHABLE_KEY.includes("PEGA_AQUI")) {
  console.warn("InterConecta: falta configurar Supabase en js/config.js");
}
const db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_PUBLISHABLE_KEY);
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
