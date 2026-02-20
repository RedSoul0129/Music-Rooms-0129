const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const loki = require("lokijs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ================= DATABASE =================
const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");

// ================= MARKET =================
const MARKET_ITEMS = [
  { id: "frame_gold", name: "Aura Dorée", price: 100, style: "box-shadow:0 0 15px #d4af37, inset 0 0 8px #d4af37; border:2px solid #d4af37;" },
  { id: "frame_rgb", name: "Chroma RGB", price: 250, style: "animation: rgb 2s linear infinite; border:2px solid;" }
];

function getLevel(xp) {
  return Math.floor(Math.sqrt(xp || 0) / 2) + 1;
}

// ================= HTML PAGE =================
const PAGE = `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Royal Palace 👑</title>
<style>
body{margin:0;font-family:Segoe UI;background:#0f0f0f;color:#f1f1f1;display:flex;height:100vh}
#sidebar{width:260px;background:#181818;padding:15px;display:flex;flex-direction:column}
#main{flex:1;display:flex;flex-direction:column}
button{background:linear-gradient(135deg,#e6c27a,#c59b3d);border:none;padding:8px;border-radius:6px;cursor:pointer;margin:4px 0;font-weight:bold}
button:disabled{background:gray}
input{padding:6px;margin:4px 0;background:#222;border:1px solid #444;color:white;border-radius:6px}
.section{display:none;flex:1;overflow:auto;padding:15px}
.section.active{display:block}
.friend{padding:6px;background:#222;margin:4px 0;border-radius:6px}
.msg{margin:4px 0}
#chatBox{flex:1;overflow:auto;background:#111;padding:10px;border-radius:6px;margin-bottom:5px}
.avatar{width:60px;height:60px;border-radius:50%;object-fit:cover}
.frame{position:absolute;inset:-5px;border-radius:50%;pointer-events:none}
.modalOverlay{position:fixed;inset:0;background:rgba(0,0,0,.8);display:none;align-items:center;justify-content:center}
.modal{background:#222;padding:20px;border-radius:10px;width:300px}
@keyframes rgb{0%{border-color:red}33%{border-color:green}66%{border-color:blue}100%{border-color:red}}
</style>
</head>
<body>

<div id="sidebar">
<h2>👑 Royal Palace</h2>
<div>💎 <span id="gems">0</span></div>
<button onclick="showSection('friends')">Amis</button>
<button onclick="showSection('groups')">Groupes</button>
<button onclick="showSection('shop')">Boutique</button>
<button onclick="showSection('quests')">Quêtes</button>
<button onclick="openProfile()">Modifier Profil</button>

<div style="margin-top:auto;text-align:center">
<div style="position:relative;display:inline-block">
<img id="avatar" class="avatar">
<div id="frame" class="frame"></div>
</div>
<div id="username"></div>
<div>Niveau <span id="level">1</span></div>
</div>
</div>

<div id="main">
<div id="friends" class="section active">
<h3>Amis</h3>
<input id="addFriendInput" placeholder="Pseudo">
<button onclick="addFriend()">Ajouter</button>
<h4>Demandes</h4>
<div id="friendRequests"></div>
<h4>Liste</h4>
<div id="friendList"></div>
</div>

<div id="groups" class="section">
<h3>Groupes <button onclick="createGroup()">➕</button></h3>
<div id="chatBox"></div>
<input id="msgInput" placeholder="Message..." onkeypress="if(event.key==='Enter')sendMsg()">
<button onclick="sendMsg()">Envoyer</button>
</div>

<div id="shop" class="section">
<h3>Boutique</h3>
<div id="shopItems"></div>
</div>

<div id="quests" class="section">
<h3>Quêtes</h3>
<button id="dailyBtn" onclick="claimDaily()">Récompense Quotidienne (+50)</button>
<button onclick="watchAd()">Regarder Pub (+15)</button>
</div>
</div>

<div id="profileModal" class="modalOverlay">
<div class="modal">
<h3>Profil</h3>
<input id="avatarUrl" placeholder="URL Avatar">
<button onclick="saveAvatar()">Sauvegarder</button>
<h4>Cadres possédés</h4>
<div id="ownedFrames"></div>
<button onclick="closeProfile()">Fermer</button>
</div>
</div>

<div id="adModal" class="modalOverlay">
<div class="modal">
<h3>🌟 Royal Palace</h3>
<p>Invite tes amis et domine le royaume 👑</p>
<p>Temps restant : <span id="adTimer">15</span>s</p>
<button id="adClose" disabled onclick="closeAd()">Réclamer</button>
</div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket=io();
let me=null;
let currentGroup=null;

const username=prompt("Choisis ton pseudo:");
if(username){
 socket.emit("login",{u:username,p:"pass"});
}

socket.on("auth-success",u=>{me=u;updateUI();});
socket.on("update-user",u=>{me=u;updateUI();});
socket.on("group-msg",m=>{
 const d=document.createElement("div");
 d.className="msg";
 d.innerHTML="<b>"+m.from+"</b> (Lvl "+m.lvl+"): "+m.txt;
 chatBox.appendChild(d);
 chatBox.scrollTop=chatBox.scrollHeight;
});

function updateUI(){
 gems.innerText=me.gems;
 usernameDiv=document.getElementById("username");
 usernameDiv.innerText=me.u;
 level.innerText=Math.floor(Math.sqrt(me.xp||0)/2)+1;
 avatar.src=me.avatar||"https://ui-avatars.com/api/?name="+me.u;
 frame.style=me.activeFrame||"";
 friendList.innerHTML="";
 me.friends.forEach(f=>{
   const d=document.createElement("div");
   d.className="friend";
   d.innerText=f;
   friendList.appendChild(d);
 });
 friendRequests.innerHTML="";
 me.friendRequests.forEach(f=>{
   const d=document.createElement("div");
   d.innerHTML=f+" <button onclick='acceptFriend(\""+f+"\")'>Accepter</button>";
   friendRequests.appendChild(d);
 });
 shopItems.innerHTML="";
 const MARKET=${JSON.stringify(MARKET_ITEMS)};
 MARKET.forEach(it=>{
   const d=document.createElement("div");
   d.innerHTML=it.name+" - "+it.price+"💎 <button onclick='buy(\""+it.id+"\")'>Acheter</button>";
   shopItems.appendChild(d);
 });
 ownedFrames.innerHTML="";
 me.framesOwned.forEach(id=>{
   const it=MARKET.find(i=>i.id===id);
   const d=document.createElement("div");
   d.innerHTML=it.name+" <button onclick='switchFrame(\""+id+"\")'>Équiper</button>";
   ownedFrames.appendChild(d);
 });
 if(Date.now()-me.lastDaily<86400000){
   dailyBtn.disabled=true;
 }else{
   dailyBtn.disabled=false;
 }
}

function showSection(id){
 document.querySelectorAll(".section").forEach(s=>s.classList.remove("active"));
 document.getElementById(id).classList.add("active");
}

function addFriend(){socket.emit("add-friend",addFriendInput.value);}
function acceptFriend(n){socket.emit("accept-friend",n);}
function createGroup(){
 const members=prompt("Membres séparés par virgule:");
 if(!members)return;
 const arr=members.split(",").map(x=>x.trim());
 socket.emit("create-group",arr);
 currentGroup="grp_"+Date.now();
}
function sendMsg(){
 if(!msgInput.value)return;
 socket.emit("group-msg",{groupId:currentGroup,txt:msgInput.value});
 msgInput.value="";
}
function buy(id){socket.emit("buy",id);}
function switchFrame(id){socket.emit("switch-frame",id);}
function openProfile(){profileModal.style.display="flex";}
function closeProfile(){profileModal.style.display="none";}
function saveAvatar(){socket.emit("change-avatar",avatarUrl.value);}
function claimDaily(){socket.emit("claim-daily");}
function watchAd(){
 adModal.style.display="flex";
 let t=15;
 adTimer.innerText=t;
 const i=setInterval(()=>{
  t--;adTimer.innerText=t;
  if(t<=0){clearInterval(i);adClose.disabled=false;}
 },1000);
}
function closeAd(){
 socket.emit("watch-ad");
 adModal.style.display="none";
 adClose.disabled=true;
}
</script>

</body>
</html>
`;

app.get("/", (req, res) => {
  res.send(PAGE);
});

// ================= SOCKET =================
io.on("connection",socket=>{
socket.on("login",d=>{
 let u=users.findOne({u:d.u});
 if(!u){
  u=users.insert({
   u:d.u,p:d.p,gems:100,xp:0,lastDaily:0,
   activeFrame:"",avatar:"",
   framesOwned:[],friends:[],
   friendRequests:[],groups:[]
  });
 }
 socket.user=u.u;
 socket.emit("auth-success",u);
});

socket.on("add-friend",name=>{
 const me=users.findOne({u:socket.user});
 const target=users.findOne({u:name});
 if(me&&target&&!target.friendRequests.includes(me.u)){
  target.friendRequests.push(me.u);
  users.update(target);
 }
});

socket.on("accept-friend",name=>{
 const me=users.findOne({u:socket.user});
 const from=users.findOne({u:name});
 if(me&&from){
  if(!me.friends.includes(name))me.friends.push(name);
  if(!from.friends.includes(me.u))from.friends.push(me.u);
  me.friendRequests=me.friendRequests.filter(n=>n!==name);
  users.update(me);users.update(from);
  socket.emit("update-user",me);
 }
});

socket.on("create-group",members=>{
 const id="grp_"+Date.now();
 members.push(socket.user);
 members.forEach(n=>{
  const u=users.findOne({u:n});
  if(u&&!u.groups.includes(id)){u.groups.push(id);users.update(u);}
 });
 socket.join(id);
});

socket.on("group-msg",d=>{
 const u=users.findOne({u:socket.user});
 if(!u)return;
 u.xp+=5;users.update(u);
 io.to(d.groupId).emit("group-msg",{from:u.u,txt:d.txt,lvl:getLevel(u.xp)});
 socket.emit("update-user",u);
});

socket.on("buy",id=>{
 const u=users.findOne({u:socket.user});
 const it=MARKET_ITEMS.find(i=>i.id===id);
 if(u&&it&&u.gems>=it.price&&!u.framesOwned.includes(id)){
  u.gems-=it.price;
  u.framesOwned.push(id);
  users.update(u);
  socket.emit("update-user",u);
 }
});

socket.on("switch-frame",id=>{
 const u=users.findOne({u:socket.user});
 const it=MARKET_ITEMS.find(i=>i.id===id);
 if(u&&it&&u.framesOwned.includes(id)){
  u.activeFrame=it.style;
  users.update(u);
  socket.emit("update-user",u);
 }
});

socket.on("change-avatar",url=>{
 const u=users.findOne({u:socket.user});
 if(u){u.avatar=url;users.update(u);socket.emit("update-user",u);}
});

socket.on("claim-daily",()=>{
 const u=users.findOne({u:socket.user});
 if(Date.now()-u.lastDaily>=86400000){
  u.gems+=50;u.lastDaily=Date.now();
  users.update(u);
  socket.emit("update-user",u);
 }
});

socket.on("watch-ad",()=>{
 const u=users.findOne({u:socket.user});
 u.gems+=15;users.update(u);
 socket.emit("update-user",u);
});
});

server.listen(3000,()=>console.log("Royal Palace 👑 lancé"));
