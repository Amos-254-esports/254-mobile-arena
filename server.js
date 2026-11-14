require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-me";
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const db = new Database(path.join(dataDir, "arena.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS players (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL,
 game_id TEXT NOT NULL, game TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tournaments (
 id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT NOT NULL, title TEXT NOT NULL,
 format TEXT NOT NULL, entry_fee INTEGER NOT NULL, prize TEXT NOT NULL,
 max_players INTEGER NOT NULL, starts_at TEXT NOT NULL, status TEXT DEFAULT 'Open'
);
CREATE TABLE IF NOT EXISTS registrations (
 id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INTEGER NOT NULL,
 tournament_id INTEGER NOT NULL, checkout_request_id TEXT, merchant_request_id TEXT,
 mpesa_receipt TEXT, payment_reference TEXT, amount INTEGER NOT NULL, payment_status TEXT DEFAULT 'Pending',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(player_id) REFERENCES players(id),
 FOREIGN KEY(tournament_id) REFERENCES tournaments(id)
);
CREATE TABLE IF NOT EXISTS results (
 id INTEGER PRIMARY KEY AUTOINCREMENT, tournament_id INTEGER NOT NULL,
 player_name TEXT NOT NULL, position TEXT NOT NULL, score TEXT DEFAULT '',
 FOREIGN KEY(tournament_id) REFERENCES tournaments(id)
);
`);
const registrationColumns = db.prepare("PRAGMA table_info(registrations)").all().map(c=>c.name);
if (!registrationColumns.includes("payment_reference")) db.exec("ALTER TABLE registrations ADD COLUMN payment_reference TEXT");
const count = db.prepare("SELECT COUNT(*) n FROM tournaments").get().n;
if (!count) {
  const add = db.prepare("INSERT INTO tournaments (game,title,format,entry_fee,prize,max_players,starts_at) VALUES (?,?,?,?,?,?,?)");
  add.run("eFootball", "eFootball 1v1 Cup", "1v1 Knockout", 50, "KES 1,500", 64, "Wednesday & Saturday · 8:00 PM EAT");
  add.run("Free Fire", "Weekend Clash Squad", "4v4 Squad Knockout", 400, "KES 2,400", 16, "Saturday · 8:30 PM EAT");
  add.run("PUBG Mobile", "Erangel Solo Challenge", "Solo · TPP", 50, "KES 2,000 + kill prize", 100, "Sunday · 9:00 PM EAT");
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan("tiny"));
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

function adminOnly(req, res, next) {
  try {
    const token = req.cookies.arena_admin;
    if (!token) return res.status(401).json({ error: "Admin login required." });
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: "Please sign in again." }); }
}
function clean(v, max=100) { return String(v || "").trim().slice(0,max); }
function normalizeKenyanPhone(value) {
  let p = String(value || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (p.startsWith("7") || p.startsWith("1")) p = "254" + p;
  if (!/^254[17]\d{8}$/.test(p)) throw new Error("Enter a valid Kenyan M-Pesa number, e.g. 0712345678.");
  return p;
}

app.get("/api/tournaments", (req,res) => {
  const rows = db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id=t.id AND r.payment_status='Paid') AS joined
    FROM tournaments t ORDER BY t.id
  `).all();
  res.json(rows);
});

app.post("/api/register", async (req,res) => {
  try {
    const name = clean(req.body.name, 70);
    const phone = normalizeKenyanPhone(req.body.phone);
    const gameId = clean(req.body.gameId, 80);
    const tournamentId = Number(req.body.tournamentId);
    if (!name || !gameId || !Number.isInteger(tournamentId)) return res.status(400).json({error:"Complete all registration fields."});
    const tournament = db.prepare("SELECT * FROM tournaments WHERE id=? AND status='Open'").get(tournamentId);
    if (!tournament) return res.status(404).json({error:"Tournament not found or closed."});
    const joined = db.prepare("SELECT COUNT(*) n FROM registrations WHERE tournament_id=? AND payment_status='Paid'").get(tournamentId).n;
    if (joined >= tournament.max_players) return res.status(409).json({error:"This tournament is full."});
    const player = db.prepare("INSERT INTO players(name,phone,game_id,game) VALUES(?,?,?,?)").run(name,phone,gameId,tournament.game);
    const registration = db.prepare("INSERT INTO registrations(player_id,tournament_id,amount) VALUES(?,?,?)").run(player.lastInsertRowid,tournamentId,tournament.entry_fee);
    res.status(201).json({registrationId:registration.lastInsertRowid, amount:tournament.entry_fee, message:"Registration created. Continue to M-Pesa payment."});
  } catch(e) { res.status(400).json({error:e.message || "Could not register."}); }
});

async function darajaToken() {
  const host = process.env.MPESA_ENV === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString("base64");
  const r = await fetch(`${host}/oauth/v1/generate?grant_type=client_credentials`, {headers:{Authorization:`Basic ${auth}`}});
  const data = await r.json();
  if (!r.ok || !data.access_token) throw new Error(data.errorMessage || "Unable to authenticate with Daraja.");
  return {token:data.access_token,host};
}
app.get("/api/payment-instructions", (req,res) => {
  res.json({receiveNumber:process.env.MPESA_RECEIVE_NUMBER || "0143222805", method:"Send Money"});
});
app.post("/api/payment/submit", (req,res) => {
  try {
    const registrationId=Number(req.body.registrationId);
    const reference=clean(req.body.transactionCode,20).toUpperCase().replace(/\s/g,"");
    if (!Number.isInteger(registrationId) || registrationId<1 || !/^[A-Z0-9]{8,12}$/.test(reference))
      return res.status(400).json({error:"Enter a valid M-Pesa transaction code."});
    const reg=db.prepare("SELECT id,payment_status FROM registrations WHERE id=?").get(registrationId);
    if (!reg) return res.status(404).json({error:"Registration not found."});
    if (reg.payment_status==="Paid") return res.status(409).json({error:"This registration is already confirmed as paid."});
    const duplicate=db.prepare("SELECT id FROM registrations WHERE payment_reference=? AND id<>?").get(reference,registrationId);
    if (duplicate) return res.status(409).json({error:"That transaction code has already been submitted."});
    db.prepare("UPDATE registrations SET payment_reference=?,payment_status='Submitted' WHERE id=?").run(reference,registrationId);
    res.json({message:"Payment code submitted. Your entry will be confirmed after the admin verifies the M-Pesa transaction."});
  } catch(e) { res.status(400).json({error:e.message || "Could not submit payment code."}); }
});

app.post("/api/mpesa/callback", (req,res) => {
  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) return res.json({ResultCode:0,ResultDesc:"Accepted"});
    const checkoutId = callback.CheckoutRequestID;
    if (Number(callback.ResultCode) === 0) {
      const items = callback.CallbackMetadata?.Item || [];
      const receipt = items.find(x=>x.Name==="MpesaReceiptNumber")?.Value || "";
      db.prepare("UPDATE registrations SET payment_status='Paid', mpesa_receipt=? WHERE checkout_request_id=?")
        .run(String(receipt),checkoutId);
    } else {
      db.prepare("UPDATE registrations SET payment_status='Failed' WHERE checkout_request_id=?").run(checkoutId);
    }
    res.json({ResultCode:0,ResultDesc:"Accepted"});
  } catch { res.json({ResultCode:0,ResultDesc:"Accepted"}); }
});

app.get("/api/payment-status/:id", (req,res) => {
  const row = db.prepare("SELECT id,payment_status,mpesa_receipt FROM registrations WHERE id=?").get(Number(req.params.id));
  if (!row) return res.status(404).json({error:"Registration not found."});
  res.json(row);
});

app.post("/api/admin/login", async (req,res) => {
  const email = clean(req.body.email,120).toLowerCase();
  const password = String(req.body.password || "");
  if (email !== String(process.env.ADMIN_EMAIL || "").toLowerCase() || !process.env.ADMIN_PASSWORD ||
      !(await bcrypt.compare(password, await bcrypt.hash(process.env.ADMIN_PASSWORD, 10)))) {
    return res.status(401).json({error:"Incorrect admin email or password."});
  }
  const token = jwt.sign({email,role:"admin"},JWT_SECRET,{expiresIn:"8h"});
  res.cookie("arena_admin",token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:8*60*60*1000});
  res.json({message:"Signed in."});
});
app.post("/api/admin/logout",(req,res)=>{res.clearCookie("arena_admin");res.json({message:"Signed out."});});
app.get("/api/admin/summary",adminOnly,(req,res)=>{
  const totals = {
    players:db.prepare("SELECT COUNT(*) n FROM players").get().n,
    paid:db.prepare("SELECT COUNT(*) n FROM registrations WHERE payment_status='Paid'").get().n,
    pending:db.prepare("SELECT COUNT(*) n FROM registrations WHERE payment_status IN ('Pending','Submitted')").get().n,
    revenue:db.prepare("SELECT COALESCE(SUM(amount),0) n FROM registrations WHERE payment_status='Paid'").get().n
  };
  const registrations = db.prepare(`
    SELECT r.id,r.amount,r.payment_status,r.mpesa_receipt,r.payment_reference,r.created_at,p.name,p.phone,p.game_id,t.title
    FROM registrations r JOIN players p ON p.id=r.player_id JOIN tournaments t ON t.id=r.tournament_id
    ORDER BY r.id DESC LIMIT 100
  `).all();
  const tournaments = db.prepare("SELECT * FROM tournaments ORDER BY id").all();
  res.json({totals,registrations,tournaments});
});
app.patch("/api/admin/registrations/:id/payment",adminOnly,(req,res)=>{
  const status=req.body.status;
  if (!["Paid","Failed"].includes(status)) return res.status(400).json({error:"Invalid payment status."});
  const result=db.prepare("UPDATE registrations SET payment_status=? WHERE id=? AND payment_reference IS NOT NULL").run(status,Number(req.params.id));
  if (!result.changes) return res.status(404).json({error:"Submitted payment not found."});
  res.json({message:status==="Paid"?"Payment approved.":"Payment rejected."});
});
app.post("/api/admin/tournaments",adminOnly,(req,res)=>{
  const {game,title,format,entryFee,prize,maxPlayers,startsAt}=req.body;
  if(!clean(game,40)||!clean(title,100)||!Number.isInteger(Number(entryFee))||Number(entryFee)<0||!Number.isInteger(Number(maxPlayers))||Number(maxPlayers)<2)
    return res.status(400).json({error:"Check tournament details."});
  const result=db.prepare("INSERT INTO tournaments(game,title,format,entry_fee,prize,max_players,starts_at) VALUES(?,?,?,?,?,?,?)")
    .run(clean(game,40),clean(title,100),clean(format,80),Number(entryFee),clean(prize,80),Number(maxPlayers),clean(startsAt,80));
  res.json({id:result.lastInsertRowid});
});
app.patch("/api/admin/tournaments/:id",adminOnly,(req,res)=>{
  const status = ["Open","Closed","Completed"].includes(req.body.status) ? req.body.status : null;
  if(!status) return res.status(400).json({error:"Invalid status."});
  db.prepare("UPDATE tournaments SET status=? WHERE id=?").run(status,Number(req.params.id));
  res.json({message:"Tournament updated."});
});
app.post("/api/admin/results",adminOnly,(req,res)=>{
  const id=Number(req.body.tournamentId), name=clean(req.body.playerName,70), position=clean(req.body.position,30), score=clean(req.body.score,30);
  if(!id||!name||!position) return res.status(400).json({error:"Complete result details."});
  db.prepare("INSERT INTO results(tournament_id,player_name,position,score) VALUES(?,?,?,?)").run(id,name,position,score);
  res.json({message:"Result saved."});
});
app.get("/api/results",(req,res)=>{
  res.json(db.prepare("SELECT r.*,t.title FROM results r JOIN tournaments t ON t.id=r.tournament_id ORDER BY r.id DESC LIMIT 50").all());
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`254 Mobile Arena running on port ${PORT}`));
