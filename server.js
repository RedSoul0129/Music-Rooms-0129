const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const loki = require("lokijs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");

const MARKET_ITEMS = [
  { id: "frame_gold", name: "Aura Dorée", price: 100, style: "box-shadow:0 0 10px #d4af37, inset 0 0 5px #d4af37; border:2px solid #d4af37;" },
  { id: "frame_rgb", name: "Chroma RGB", price: 250, style: "animation: rgb 2s linear infinite; border:2px solid;" }
];

function getLevel(xp) {
  return Math.floor(Math.sqrt(xp || 0) / 2) + 1;
}

app.get("/", (req, res) => {
res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Royal Palace</title>
<style>
body{margin:0;font-family:Arial;background:#0f0f0f;color:white;display:flex;height:100vh}
#sidebar{width:260px;background:#181818;padding:15px;display:flex;flex-direction:column}
#main{flex:1;display:flex;flex-direction:column}
button{background:gold;border:none;padding:8px;border-radius:6px;cursor:pointer;margin:3px 0}
input{padding:6px;margin:3px 0;background:#222;border:1px solid #444;color:white}
.section{display:none;flex:1;overflow:auto;padding:15px}
.section.active{display:block}
.friend{padding:5px;background:#222;margin:3px 0;cursor:pointer}
.msg{margin:4px 0}
#chatBox{flex:1;overflow:auto}
#profileModal,#adModal{position:fixed;inset:0;background:rgba(0,0,0,.8);display:none;align-items:center;justify-content:center}
.modal{background:#222;padding:20px;border-radius:10px;width:300px}
.avatar{width:50px;height:50px;border-radius:50%;object-fit:cover}
.frame{position:absolute;inset:-4px;border-radius:50%;pointer-events:none}
@keyframes rgb{0%{border-color:red}33%{border-color:green}66%{border-color:blue}100%{border-color:red}}
</style>
</head>
<body>

<div id="sidebar">
<h3>👑 Royal Palace</h3>
<div>💎 <span id="gems">0</span></div>
<button onclick="showSection('friends')">Amis</button>
<button onclick="showSection('groups')">Groupes</button>
<button onclick="showSection('shop')">Boutique</button>
<button onclick="showSection('quests')">Quêtes</button>
<button onclick="openProfile()">Modifier Profil</button>
<div style="margin-top:auto">
<div style="position:relative;width:50px;height:50px">
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
<div id="friendRequests"></div>
<div id="friendList"></div>
</div>

<div id="groups" class="section">
<h3>Groupes <button onclick="createGroup()">➕</button></h3>
<div id="groupList"></div>
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
<button id="dailyBtn" onclick="claimDaily()">Récompense Quotidienne</button>
<button onclick="watchAd()">Regarder Pub (+15)</button>
</div>
</div>

<div id="profileModal">
<div class="modal">
<h3>Profil</h3>
<input id="avatarUrl" placeholder="URL Avatar">
<button onclick="saveAvatar()">Sauvegarder</button>
<div id="ownedFrames"></div>
<button onclick="closeProfile()">Fermer</button>
</div>
</div>

<div id="adModal">
<div class="modal">
<h3>🌟 Royal Palace</h3>
<p>Invite tes amis et deviens le roi 👑</p>
<p id="adTimer">15</p>
<button id="adClose" disabled onclick="closeAd()">Réclamer</button>
</div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket=io();
let me=null;
let currentGroup=null;
socket.emit("login",{u:prompt("Pseudo?"),p:"pass"});

socket.on("auth-success",u=>{me=u;updateUI()});
socket.on("update-user",u=>{me=u;updateUI()});
socket.on("group-msg",m=>{
const d=document.createElement("div");
d.className="msg";
d.innerHTML="<b>"+m.from+"</b> (Lvl "+m.lvl+"): "+m.txt;
chatBox.appendChild(d);
chatBox.scrollTop=chatBox.scrollHeight;
});

function updateUI(){
gems.innerText=me.gems;
username.innerText=me.u;
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
d.innerHTML=f+" <button onclick=\\"acceptFriend('${f}')\\">Accepter</button>";
friendRequests.appendChild(d);
});
shopItems.innerHTML="";
${JSON.stringify(MARKET_ITEMS)}.forEach(it=>{
const d=document.createElement("div");
d.innerHTML=it.name+" "+it.price+"💎 <button onclick=\\"buy('${it.id}')\\">Acheter</button>";
shopItems.appendChild(d);
});
ownedFrames.innerHTML="";
me.framesOwned.forEach(id=>{
const it=${JSON.stringify(MARKET_ITEMS)}.find(i=>i.id===id);
const d=document.createElement("div");
d.innerHTML=it.name+" <button onclick=\\"switchFrame('${id}')\\">Equiper</button>";
ownedFrames.appendChild(d);
});
if(Date.now()-me.lastDaily<86400000){
dailyBtn.disabled=true;
dailyBtn.style.background="gray";
}else{
dailyBtn.disabled=false;
dailyBtn.style.background="gold";
}
}

function showSection(id){
document.querySelectorAll(".section").forEach(s=>s.classList.remove("active"));
document.getElementById(id).classList.add("active");
}

function addFriend(){socket.emit("add-friend",addFriendInput.value)}
function acceptFriend(n){socket.emit("accept-friend",n)}
function createGroup(){
const members=prompt("Membres séparés par virgule").split(",");
socket.emit("create-group",members);
}
function sendMsg(){
if(!currentGroup)return;
socket.emit("group-msg",{groupId:currentGroup,txt:msgInput.value});
msgInput.value="";
}
function buy(id){socket.emit("buy",id)}
function switchFrame(id){socket.emit("switch-frame",id)}
function openProfile(){profileModal.style.display="flex"}
function closeProfile(){profileModal.style.display="none"}
function saveAvatar(){socket.emit("change-avatar",avatarUrl.value)}
function claimDaily(){socket.emit("claim-daily")}
function watchAd(){
adModal.style.display="flex";
let t=15;
adTimer.innerText=t;
const int=setInterval(()=>{
t--;
adTimer.innerText=t;
if(t<=0){
clearInterval(int);
adClose.disabled=false;
}
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
`);
});

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
me.friends.push(name);
from.friends.push(me.u);
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
if(u){u.groups.push(id);users.update(u);}
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
users.update(u);socket.emit("update-user",u);
}
});

socket.on("watch-ad",()=>{
const u=users.findOne({u:socket.user});
u.gems+=15;users.update(u);
socket.emit("update-user",u);
});
});

server.listen(3000,()=>console.log("Royal Palace 👑 lancé"));
