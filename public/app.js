const $=s=>document.querySelector(s);
let tournaments=[];
function toast(msg){const t=$("#toast");t.textContent=msg;t.style.display="block";setTimeout(()=>t.style.display="none",3000)}
function notice(id,msg,error=false){const el=$(id);el.textContent=msg;el.classList.toggle("error",error)}
async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{"Content-Type":"application/json",...(opts.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"Something went wrong.");return d}
function nav(page){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.page===page));document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===page));if(page==="scores")loadResults();if(page==="admin")checkAdmin()}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.page)));
const icons={"eFootball":"⚽","Free Fire":"🔥","PUBG Mobile":"🪂"};
async function loadTournaments(){
 try{
  tournaments=await api("/api/tournaments");
  $("#tournaments").innerHTML=tournaments.map(t=>{const n=Number(t.joined||0),pct=Math.min(100,n/Number(t.max_players)*100);return `<article class="tournament"><div class="game-icon">${icons[t.game]||"🎮"}</div><span class="pill ${t.status!=="Open"?"closed":""}">${esc(t.status)}</span><h3>${esc(t.title)}</h3><p class="muted">${esc(t.format)} · ${esc(t.starts_at)}</p><div class="meta"><span>Entry <b>KES ${Number(t.entry_fee).toLocaleString()}</b></span><span>Prize <b>${esc(t.prize)}</b></span></div><div class="bar"><span style="width:${pct}%"></span></div><p class="muted">${n} / ${t.max_players} paid entries</p></article>`}).join("")||'<div class="empty">No tournaments listed yet.</div>';
  $("#tournamentSelect").innerHTML='<option value="">Choose a tournament</option>'+tournaments.filter(t=>t.status==="Open").map(t=>`<option value="${t.id}">${esc(t.title)} — KES ${t.entry_fee}</option>`).join("");
  $("#resultTournament").innerHTML=tournaments.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join("");
 }catch(e){$("#tournaments").innerHTML=`<div class="empty">${esc(e.message)}</div>`}
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("#refresh").onclick=loadTournaments;
let currentRegistrationId=null;
$("#registerForm").addEventListener("submit",async e=>{
 e.preventDefault();const f=Object.fromEntries(new FormData(e.target));
 try{
  const reg=await api("/api/register",{method:"POST",body:JSON.stringify(f)});
  currentRegistrationId=reg.registrationId;
  const instructions=await api("/api/payment-instructions");
  $("#receiveNumber").textContent=instructions.receiveNumber;
  $("#paymentPanel").classList.remove("hidden");
  $("#paymentMessage").textContent="";
  notice("#registerMessage",`Registration #${reg.registrationId} created. Send KES ${reg.amount} to ${instructions.receiveNumber}, then submit your transaction code below.`);
  $("#paymentPanel").scrollIntoView({behavior:"smooth",block:"center"});
 }catch(err){notice("#registerMessage",err.message,true)}
});
$("#copyNumber").onclick=async()=>{try{await navigator.clipboard.writeText($("#receiveNumber").textContent);toast("M-Pesa number copied.")}catch{toast("Select and copy the number manually.")}};
$("#paymentForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!currentRegistrationId)return notice("#paymentMessage","Register for a tournament first.",true);
 const transactionCode=new FormData(e.target).get("transactionCode");
 try{
  const d=await api("/api/payment/submit",{method:"POST",body:JSON.stringify({registrationId:currentRegistrationId,transactionCode})});
  notice("#paymentMessage",d.message);e.target.reset();
 }catch(err){notice("#paymentMessage",err.message,true)}
});

async function loadResults(){try{const rows=await api("/api/results");$("#results").innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Tournament</th><th>Player</th><th>Position</th><th>Score</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.title)}</td><td>${esc(r.player_name)}</td><td>${esc(r.position)}</td><td>${esc(r.score)}</td></tr>`).join("")}</tbody></table></div>`:'<div class="empty">Results will appear here after tournaments are completed.</div>'}catch(e){$("#results").textContent=e.message}}
$("#loginForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/admin/login",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});notice("#adminMessage","Signed in successfully.");await checkAdmin()}catch(err){notice("#adminMessage",err.message,true)}});
async function checkAdmin(){try{const d=await api("/api/admin/summary");$("#adminPanel").classList.remove("hidden");$("#adminStats").innerHTML=[["Players",d.totals.players],["Paid entries",d.totals.paid],["Pending",d.totals.pending],["Revenue","KES "+d.totals.revenue.toLocaleString()]].map(x=>`<div class="stat"><b>${x[1]}</b><small>${x[0]}</small></div>`).join("");$("#registrationTable").innerHTML=`<table><thead><tr><th>Name</th><th>Tournament</th><th>Phone</th><th>Amount</th><th>Status</th><th>M-Pesa code</th><th>Verify</th></tr></thead><tbody>${d.registrations.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.title)}</td><td>${esc(r.phone)}</td><td>KES ${r.amount}</td><td>${esc(r.payment_status)}</td><td>${esc(r.payment_reference||r.mpesa_receipt||"—")}</td><td>${r.payment_status==="Submitted"?`<button class="small" data-payment-id="${r.id}" data-status="Paid">Approve</button> <button class="small" data-payment-id="${r.id}" data-status="Failed">Reject</button>`:"—"}</td></tr>`).join("")}</tbody></table>`}catch{$("#adminPanel").classList.add("hidden")}}
$("#registrationTable").addEventListener("click",async e=>{
 const b=e.target.closest("button[data-payment-id]");if(!b)return;
 if(!confirm(`Mark this submitted payment as ${b.dataset.status}? Verify the transaction in M-Pesa first.`))return;
 try{await api(`/api/admin/registrations/${b.dataset.paymentId}/payment`,{method:"PATCH",body:JSON.stringify({status:b.dataset.status})});toast("Payment status updated.");await checkAdmin();await loadTournaments()}catch(err){toast(err.message)}
});
$("#logout").onclick=async()=>{await api("/api/admin/logout",{method:"POST"});$("#adminPanel").classList.add("hidden");toast("Signed out.")};
$("#tournamentForm").addEventListener("submit",async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{await api("/api/admin/tournaments",{method:"POST",body:JSON.stringify(f)});notice("#tournamentMessage","Tournament created.");e.target.reset();await loadTournaments();await checkAdmin()}catch(err){notice("#tournamentMessage",err.message,true)}});
$("#resultForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/admin/results",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});notice("#resultMessage","Result published.");e.target.reset()}catch(err){notice("#resultMessage",err.message,true)}});
loadTournaments();
let installPrompt;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;$("#installBtn").classList.remove("hidden")});
$("#installBtn").onclick=async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$("#installBtn").classList.add("hidden")};
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
