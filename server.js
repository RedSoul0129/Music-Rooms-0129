const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const loki = require("lokijs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e7 }); 

// --- BASE DE DONNÉES ---
const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");
let messages = db.getCollection("messages") || db.addCollection("messages");
let groups = db.getCollection("groups") || db.addCollection("groups");
let ytRooms = db.getCollection("ytRooms") || db.addCollection("ytRooms");

const activeUsers = {}; 
const userSockets = {}; 

// --- CONFIGURATION DU MAGASIN ---
const MARKET_ITEMS = [
    { id: 'frame_gold', name: 'Aura Dorée', price: 100, type: 'frame', style: 'box-shadow: 0 0 10px #d4af37, inset 0 0 5px #d4af37; border: 2px solid #d4af37;' },
    { id: 'frame_rgb', name: 'Chroma RGB', price: 250, type: 'frame', style: 'animation: rgb-anim 2s linear infinite; border: 2px solid;' },
    { id: 'banner_empire', name: 'Bannière Empire', price: 50, type: 'banner', url: 'https://images.unsplash.com/photo-1519751138087-5bf79df62d5b?w=500' }
];

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Royal Palace - Elite</title>
    <style>
        :root { --gold: linear-gradient(135deg, #e6c27a 0%, #ffe5a3 50%, #c59b3d 100%); --gold-s: #d4af37; --dark: #0a0a0a; --card: #151515; --text: #f1f1f1; }
        
        @keyframes rgb-anim { 0% { border-color: red; } 33% { border-color: green; } 66% { border-color: blue; } 100% { border-color: red; } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }

        body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
        
        /* UI COMPONENTS */
        .btn-royal { background: var(--gold); color: black; padding: 10px 15px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; }
        .btn-royal:disabled { filter: grayscale(1); opacity: 0.5; }
        .gem-badge { background: rgba(0,0,0,0.5); border: 1px solid var(--gold-s); padding: 5px 12px; border-radius: 20px; color: var(--gold-s); font-weight: bold; display: flex; align-items: center; gap: 5px; }

        /* NAVIGATION & VIEWS */
        #sidebar { width: 300px; background: var(--card); border-right: 1px solid #222; display: flex; flex-direction: column; z-index: 100; }
        .nav-link { padding: 12px 20px; cursor: pointer; transition: 0.3s; border-left: 3px solid transparent; }
        .nav-link:hover { background: rgba(255,255,255,0.05); }
        .nav-link.active { background: rgba(212, 175, 55, 0.1); border-left-color: var(--gold-s); color: var(--gold-s); }

        .view { display: none; flex: 1; flex-direction: column; animation: slideIn 0.3s ease-out; height: 100%; overflow: hidden; }
        .view.active { display: flex; }

        /* MARKET */
        .market-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 15px; padding: 20px; }
        .item-card { background: #1a1a1a; border: 1px solid #333; border-radius: 10px; padding: 15px; text-align: center; }

        /* CALL UI */
        #call-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 3000; display: none; flex-direction: column; align-items: center; justify-content: center; }
        #remote-video { width: 80%; max-width: 900px; border-radius: 12px; border: 2px solid var(--gold-s); background: #000; }
        .controls { margin-top: 20px; display: flex; gap: 15px; }

        /* CUSTOMS */
        .avatar-wrap { position: relative; width: 40px; height: 40px; }
        .frame-layer { position: absolute; inset: -3px; border-radius: 50%; pointer-events: none; }
        .avatar-img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
    </style>
</head>
<body>

<div id="call-overlay">
    <h2 id="call-status">Appel en cours...</h2>
    <video id="remote-video" autoplay playsinline></video>
    <div class="controls">
        <button class="btn-royal" id="mute-btn" onclick="toggleMute()">🎤 Mute</button>
        <button class="btn-royal" onclick="toggleScreen()">🖥️ Partager Écran (60 FPS)</button>
        <button class="btn-royal" style="background:red; color:white;" onclick="endCall()">Raccrocher</button>
    </div>
</div>

<div id="ad-modal" class="modal">
    <div class="modal-box" style="border: 2px solid var(--gold-s);">
        <h2 style="color:var(--gold-s)">🔱 REJOIGNEZ LE PALAIS</h2>
        <p>Saviez-vous que vous pouvez créer vos propres Salles Vidéo gratuitement ?</p>
        <div style="background:#222; padding:15px; border-radius:8px; margin:10px 0;">
             <p style="font-size:0.9rem">Invitez vos amis et gagnez des titres de noblesse !</p>
        </div>
        <button class="btn-royal" onclick="closeAd()">Réclamer 10 💎</button>
    </div>
</div>

<div id="sidebar">
    <div style="padding: 20px; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="color:var(--gold-s); margin:0">🔱 ROYAL</h3>
        <div class="gem-badge">💎 <span id="gem-count">0</span></div>
    </div>
    
    <div class="nav-link active" onclick="showView('chat')">💬 Messagerie</div>
    <div class="nav-link" onclick="showView('market')">🛒 Magasin</div>
    <div class="nav-link" onclick="showView('quests')">🎯 Quêtes</div>
    <div class="nav-link" onclick="openModal('settings-modal')">⚙️ Paramètres</div>

    <div style="flex:1; overflow-y:auto; padding:10px;" id="friends-list">
        </div>

    <div id="user-bar">
        <div class="avatar-wrap">
            <img id="my-avatar" class="avatar-img" src="">
            <div id="my-frame" class="frame-layer"></div>
        </div>
        <div style="flex:1; margin-left:10px">
            <div id="my-name" style="font-weight:bold; font-size:0.9rem">...</div>
        </div>
    </div>
</div>

<div id="main-content" style="flex:1; position:relative;">
    <div id="view-chat" class="view active">
        <div id="top-bar" style="padding:15px; border-bottom:1px solid #222; display:flex; justify-content:space-between;">
            <h3 id="target-title">Sélectionnez un chat</h3>
            <div id="chat-actions" style="display:none; gap:10px;">
                <button class="btn-royal" onclick="initCall()">📞 Appel</button>
            </div>
        </div>
        <div id="messages-container" style="flex:1; overflow-y:auto; padding:20px;"></div>
        <div id="input-area" style="padding:15px; display:flex; gap:10px; display:none;">
            <input id="chat-inp" placeholder="Message..." onkeypress="if(event.key==='Enter') sendMsg()">
            <button class="btn-royal" onclick="sendMsg()">➤</button>
        </div>
    </div>

    <div id="view-market" class="view">
        <h2 style="padding:20px; margin:0; color:var(--gold-s)">Boutique Royale</h2>
        <div class="market-grid" id="market-items"></div>
    </div>

    <div id="view-quests" class="view">
        <h2 style="padding:20px; margin:0; color:var(--gold-s)">Quêtes de Gemmes</h2>
        <div style="padding:20px">
            <div class="item-card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <div style="text-align:left"><b>Bonus Quotidien</b><br><small>Disponible toutes les 24h</small></div>
                <button class="btn-royal" id="daily-btn" onclick="socket.emit('claim-daily')">Réclamer 50 💎</button>
            </div>
            <div class="item-card" style="display:flex; justify-content:space-between; align-items:center;">
                <div style="text-align:left"><b>Annonce Locale</b><br><small>Soutenez le site</small></div>
                <button class="btn-royal" onclick="openModal('ad-modal')">Regarder (+10 💎)</button>
            </div>
        </div>
    </div>
</div>

<div id="settings-modal" class="modal">
    <div class="modal-box">
        <h3>PARAMÈTRES</h3>
        <input id="set-u" placeholder="Nouveau Pseudo">
        <input type="file" id="set-av" accept="image/*">
        <button class="btn-royal" style="width:100%" onclick="saveSettings()">SAUVEGARDER</button>
        <button class="btn-royal" style="width:100%; background:#333; margin-top:5px" onclick="closeModal('settings-modal')">FERMER</button>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    let myData = {}, activeTarget = null;
    let localStream, peerConnection;

    // --- NAVIGATION ---
    function showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.getElementById('view-' + viewId).classList.add('active');
        event.currentTarget.classList.add('active');
    }

    function openModal(id) { document.getElementById(id).classList.add('open'); }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }

    // --- ECONOMIE & MARKET ---
    function closeAd() {
        closeModal('ad-modal');
        socket.emit('watch-ad');
    }

    const shopItems = ${JSON.stringify(MARKET_ITEMS)};
    const shopContainer = document.getElementById('market-items');
    shopItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'item-card';
        div.innerHTML = \`
            <div style="height:50px; margin-bottom:10px; display:flex; align-items:center; justify-content:center; \${item.type==='frame'?item.style:''}">
                \${item.type==='frame' ? 'Aperçu' : '<img src="'+item.url+'" style="width:100%; height:30px; object-fit:cover">'}
            </div>
            <div style="font-size:0.8rem; font-weight:bold">\${item.name}</div>
            <button class="btn-royal" style="margin-top:10px; width:100%; font-size:0.7rem" onclick="buyItem('\${item.id}')">\${item.price} 💎</button>
        \`;
        shopContainer.appendChild(div);
    });

    function buyItem(id) { socket.emit('buy-item', id); }

    // --- APPEL AUDIO & ECRAN ---
    async function initCall() {
        document.getElementById('call-overlay').style.display = 'flex';
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            console.log("Micro activé");
        } catch (e) { alert("Erreur micro : " + e); }
    }

    async function toggleScreen() {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                video: { frameRate: { ideal: 60 } }, 
                audio: false 
            });
            document.getElementById('remote-video').srcObject = screenStream;
        } catch (e) { console.error(e); }
    }

    function toggleMute() {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        document.getElementById('mute-btn').innerText = audioTrack.enabled ? "🎤 Mute" : "🔇 Unmute";
    }

    function endCall() {
        if(localStream) localStream.getTracks().forEach(t => t.stop());
        document.getElementById('call-overlay').style.display = 'none';
    }

    // --- SOCKETS ---
    const pseudo = prompt("Pseudo ?") || "Noble" + Math.floor(Math.random()*1000);
    socket.emit('login', { u: pseudo, p: '123' });

    socket.on('auth-success', u => {
        myData = u;
        updateUI();
        socket.emit('get-init-data');
    });

    function updateUI() {
        document.getElementById('gem-count').innerText = myData.gems || 0;
        document.getElementById('my-name').innerText = myData.name;
        document.getElementById('my-avatar').src = myData.avatar || 'https://ui-avatars.com/api/?name='+myData.name;
        document.getElementById('my-frame').style = myData.activeFrame || '';
        if(myData.banner) {
            document.getElementById('user-bar').style.backgroundImage = \`linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url(\${myData.banner})\`;
            document.getElementById('user-bar').style.backgroundSize = 'cover';
        }
    }

    socket.on('update-gems', g => { myData.gems = g; updateUI(); });
    socket.on('buy-success', (newData) => { myData = newData; updateUI(); alert("Objet équipé !"); });

    // (Reste de tes fonctions de chat à conserver ici...)
    function sendMsg() {
        const i = document.getElementById('chat-inp');
        if(!i.value) return;
        socket.emit('send-msg', { target: activeTarget, text: i.value });
        i.value = '';
    }

</script>
</body>
</html>
`);
});

// --- SERVEUR NODE.JS ---
io.on("connection", (socket) => {
    socket.on('login', (d) => {
        let u = users.findOne({ u: d.u });
        if(!u) u = users.insert({ u: d.u, p: d.p, gems: 100, lastDaily: 0, avatar: '', banner: '', activeFrame: '' });
        activeUsers[socket.id] = u.u;
        userSockets[u.u] = socket.id;
        socket.emit('auth-success', { name: u.u, gems: u.gems, avatar: u.avatar, banner: u.banner, activeFrame: u.activeFrame });
    });

    socket.on('claim-daily', () => {
        const u = users.findOne({ u: activeUsers[socket.id] });
        const now = Date.now();
        if(now - u.lastDaily > 86400000) { // 24h
            u.gems += 50;
            u.lastDaily = now;
            users.update(u);
            socket.emit('update-gems', u.gems);
        }
    });

    socket.on('watch-ad', () => {
        const u = users.findOne({ u: activeUsers[socket.id] });
        u.gems += 10;
        users.update(u);
        socket.emit('update-gems', u.gems);
    });

    socket.on('buy-item', (itemId) => {
        const u = users.findOne({ u: activeUsers[socket.id] });
        const item = MARKET_ITEMS.find(i => i.id === itemId);
        if(u && item && u.gems >= item.price) {
            u.gems -= item.price;
            if(item.type === 'frame') u.activeFrame = item.style;
            if(item.type === 'banner') u.banner = item.url;
            users.update(u);
            socket.emit('buy-success', { name: u.u, gems: u.gems, avatar: u.avatar, banner: u.banner, activeFrame: u.activeFrame });
        }
    });

    // ... Reste de ta logique de message/groupe ...
});

server.listen(3000, () => console.log("Palais Royal sur le port 3000"));
