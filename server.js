const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const loki = require("lokijs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 }); // 10MB pour les images

const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");
let messages = db.getCollection("messages") || db.addCollection("messages");
let groups = db.getCollection("groups") || db.addCollection("groups");

const activeUsers = {}; 
const userSockets = {}; 

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Royal Elite Social</title>
    <style>
        :root { --gold: linear-gradient(135deg, #d4af37 0%, #f9f295 50%, #b38728 100%); --gold-s: #d4af37; --dark: #050505; --card: #121212; --text: #f1f1f1; }
        body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
        
        /* SIDEBAR DISCORD-LIKE */
        #sidebar { width: 300px; background: var(--card); border-right: 1px solid var(--gold-s); display: flex; flex-direction: column; }
        .sidebar-content { flex: 1; overflow-y: auto; }
        .section-title { padding: 15px; font-size: 0.7rem; color: #555; text-transform: uppercase; letter-spacing: 1px; }
        
        /* USER BAR (BOTTOM LEFT) */
        #user-bar { background: #0a0a0a; padding: 10px; border-top: 1px solid #222; display: flex; align-items: center; gap: 10px; }
        .avatar { width: 35px; height: 35px; border-radius: 50%; background: #333; object-fit: cover; border: 1px solid var(--gold-s); }
        .speaking { box-shadow: 0 0 10px #22c55e; border: 2px solid #22c55e !important; }

        /* CHAT AREA */
        #chat-area { flex: 1; display: flex; flex-direction: column; position: relative; }
        #messages-container { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 8px; }
        .msg-row { display: flex; gap: 10px; margin-bottom: 5px; }
        .msg-bubble { background: #222; padding: 10px; border-radius: 10px; max-width: 70%; position: relative; }
        .msg-bubble.me { background: var(--gold); color: black; margin-left: auto; }
        .msg-author { font-size: 0.7rem; color: var(--gold-s); margin-bottom: 3px; font-weight: bold; }

        /* YT WATCHER & SHARE */
        #media-panel { height: 0; background: #000; transition: 0.3s; overflow: hidden; position: relative; }
        #media-panel.open { height: 300px; border-bottom: 1px solid var(--gold-s); }
        #yt-player { width: 100%; height: 100%; }

        /* MODALS */
        .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 2000; display: flex; align-items: center; justify-content: center; visibility: hidden; }
        .modal.open { visibility: visible; }
        .modal-box { background: var(--card); padding: 30px; border: 1px solid var(--gold-s); border-radius: 15px; width: 350px; text-align: center; }

        .btn { padding: 8px 15px; border-radius: 5px; border: none; cursor: pointer; font-weight: bold; font-size: 0.8rem; }
        .btn-gold { background: var(--gold); color: black; }
        input { background: #1a1a1a; border: 1px solid #333; color: white; padding: 10px; border-radius: 5px; width: 90%; margin-bottom: 10px; }
    </style>
</head>
<body>

<div id="sidebar">
    <div class="sidebar-content">
        <div class="section-title">Amis</div>
        <div id="friends-list"></div>
        <div class="section-title">Groupes <button class="btn-gold" onclick="openModal('group-modal')" style="padding:2px 5px">+</button></div>
        <div id="groups-list"></div>
    </div>
    
    <div id="user-bar">
        <img id="my-avatar" class="avatar" src="https://ui-avatars.com/api/?name=User&background=random" onclick="openModal('settings-modal')">
        <div style="flex:1; overflow:hidden">
            <div id="my-name" style="font-weight:bold; font-size:0.9rem">Noble</div>
            <div style="font-size:0.7rem; color:#22c55e">En ligne</div>
        </div>
        <button class="btn" style="background:transparent; color:#555" onclick="openModal('settings-modal')">⚙️</button>
    </div>
</div>

<div id="chat-area">
    <div id="media-panel">
        <div id="yt-controls" style="position:absolute; top:5px; right:5px; z-index:10; display:flex; gap:5px">
            <input id="yt-url" placeholder="Lien YouTube..." style="width:150px; margin:0; padding:2px">
            <button class="btn-gold" onclick="loadYT()">Lancer</button>
            <button class="btn" onclick="toggleMedia()">X</button>
        </div>
        <div id="yt-player"></div>
        <video id="screenshare-video" style="width:100%; height:100%; display:none" autoplay></video>
    </div>

    <div id="chat-header" style="padding:15px; background:rgba(212,175,55,0.05); display:flex; justify-content:space-between; align-items:center;">
        <h3 id="target-name">Sélectionnez un chat</h3>
        <div id="call-btns" class="hidden">
            <button class="btn-gold" onclick="startVoice()">📞</button>
            <button class="btn-gold" onclick="startScreen()">🖥️</button>
            <button class="btn-gold" onclick="toggleMedia()">📺 YT</button>
        </div>
    </div>

    <div id="messages-container"></div>
    
    <div id="input-area" class="hidden" style="padding:20px; display:flex; gap:10px">
        <input id="chat-inp" placeholder="Envoyer un message..." style="flex:1" onkeypress="if(event.key==='Enter') sendMsg()">
        <button class="btn-gold" onclick="sendMsg()">➤</button>
    </div>
</div>

<div id="settings-modal" class="modal">
    <div class="modal-box">
        <h3>Paramètres du Compte</h3>
        <input id="new-u" placeholder="Nouveau Pseudo">
        <input id="new-p" type="password" placeholder="Nouveau Mot de passe">
        <div style="margin: 10px 0;">
            <label>Photo de profil :</label><br>
            <input type="file" id="avatar-upload" accept="image/*" style="font-size:0.7rem">
        </div>
        <button class="btn-gold" onclick="updateProfile()">Enregistrer</button>
        <button class="btn" onclick="closeModal('settings-modal')">Fermer</button>
    </div>
</div>

<div id="auth-modal" class="modal open">
    <div class="modal-box">
        <h2 style="color:var(--gold-s)">Royal Palace</h2>
        <input id="auth-u" placeholder="Utilisateur">
        <input id="auth-p" type="password" placeholder="Mot de passe">
        <button class="btn-gold" style="width:100%" onclick="login()">Se Connecter</button>
        <button class="btn" style="width:100%; margin-top:5px" onclick="register()">S'Inscrire</button>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
    const socket = io();
    let myData = { name: '', avatar: '' }, activeTarget = null, isGroup = false;
    let player, ytSyncing = false;

    // --- AUTH & PROFILE ---
    function login() { socket.emit('login', { u: $('#auth-u').value, p: $('#auth-p').value }); }
    function register() { socket.emit('register', { u: $('#auth-u').value, p: $('#auth-p').value }); }
    
    socket.on('auth-success', (user) => {
        myData = user;
        $('#my-name').innerText = user.name;
        $('#my-avatar').src = user.avatar || 'https://ui-avatars.com/api/?name='+user.name;
        closeModal('auth-modal');
    });

    function updateProfile() {
        const file = $('#avatar-upload').files[0];
        const reader = new FileReader();
        reader.onload = () => {
            socket.emit('update-profile', {
                name: $('#new-u').value || myData.name,
                pass: $('#new-p').value || null,
                avatar: reader.result
            });
            closeModal('settings-modal');
        };
        if(file) reader.readAsDataURL(file);
        else socket.emit('update-profile', { name: $('#new-u').value, pass: $('#new-p').value });
    }

    // --- CHAT LOGIC ---
    function sendMsg() {
        const text = $('#chat-inp').value;
        if(!text) return;
        socket.emit('send-msg', { to: activeTarget, isGroup, text });
        $('#chat-inp').value = '';
        appendMsg({ from: myData.name, avatar: myData.avatar, text }, true);
    }

    socket.on('new-msg', (data) => {
        if(activeTarget === (data.isGroup ? data.to : data.from)) {
            appendMsg(data, false);
        }
    });

    function appendMsg(data, isMe) {
        const row = document.createElement('div');
        row.className = 'msg-row';
        if(isMe) row.style.flexDirection = 'row-reverse';
        
        const av = \`<img class="avatar" src="\${data.avatar || 'https://ui-avatars.com/api/?name='+data.from}" style="width:25px; height:25px">\`;
        row.innerHTML = av + \`<div class="msg-bubble \${isMe?'me':''}">
            <div class="msg-author">\${data.from}</div>
            <div>\${data.text}</div>
        </div>\`;
        $('#messages-container').appendChild(row);
        $('#messages-container').scrollTop = $('#messages-container').scrollHeight;
    }

    // --- YOUTUBE SYNC ---
    function onYouTubeIframeAPIReady() {
        player = new YT.Player('yt-player', {
            events: { 'onStateChange': onPlayerStateChange }
        });
    }

    function loadYT() {
        const url = $('#yt-url').value;
        const id = url.split('v=')[1]?.split('&')[0];
        if(id) socket.emit('yt-command', { type: 'load', id, target: activeTarget });
    }

    function onPlayerStateChange(event) {
        if(ytSyncing) return;
        const state = event.data;
        const time = player.getCurrentTime();
        socket.emit('yt-command', { type: 'sync', state, time, target: activeTarget });
    }

    socket.on('yt-remote', (data) => {
        ytSyncing = true;
        if(data.type === 'load') player.loadVideoById(data.id);
        if(data.type === 'sync') {
            if(data.state === 1) player.playVideo();
            if(data.state === 2) player.pauseVideo();
            if(Math.abs(player.getCurrentTime() - data.time) > 2) player.seekTo(data.time);
        }
        setTimeout(() => ytSyncing = false, 500);
    });

    // --- VOICE DETECTION (Cercle Vert) ---
    async function startVoice() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        source.connect(analyser);
        
        const data = new Uint8Array(analyser.frequencyBinCount);
        setInterval(() => {
            analyser.getByteFrequencyData(data);
            const volume = data.reduce((a, b) => a + b) / data.length;
            if(volume > 30) socket.emit('speaking', { target: activeTarget, speaking: true });
            else socket.emit('speaking', { target: activeTarget, speaking: false });
        }, 200);
    }

    socket.on('user-speaking', (d) => {
        const el = document.querySelector(\`[data-user="\${d.user}"] .avatar\`);
        if(el) d.speaking ? el.classList.add('speaking') : el.classList.remove('speaking');
    });

    // HELPERS
    function $(id) { return document.querySelector(id); }
    function openModal(id) { $('#'+id).classList.add('open'); }
    function closeModal(id) { $('#'+id).classList.remove('open'); }
    function toggleMedia() { $('#media-panel').classList.toggle('open'); }
</script>
</body>
</html>
`);
});

// --- SERVEUR LOGIQUE ---
io.on("connection", (socket) => {
    socket.on('login', (d) => {
        const u = users.findOne({ u: d.u, p: d.p });
        if(u) loginSuccess(socket, u);
    });

    socket.on('register', (d) => {
        if(d.u.length < 5 || users.findOne({u: d.u})) return;
        const newUser = users.insert({ u: d.u, p: d.p, avatar: '', friends: [] });
        loginSuccess(socket, newUser);
    });

    function loginSuccess(socket, user) {
        activeUsers[socket.id] = user.u;
        userSockets[user.u] = socket.id;
        socket.emit('auth-success', { name: user.u, avatar: user.avatar });
        updateGlobalLists();
    }

    socket.on('update-profile', (d) => {
        const u = users.findOne({ u: activeUsers[socket.id] });
        if(d.name) {
            delete userSockets[u.u];
            u.u = d.name;
            userSockets[d.name] = socket.id;
        }
        if(d.pass) u.p = d.pass;
        if(d.avatar) u.avatar = d.avatar;
        users.update(u);
        socket.emit('auth-success', { name: u.u, avatar: u.avatar });
    });

    socket.on('send-msg', (d) => {
        const me = users.findOne({ u: activeUsers[socket.id] });
        const msg = { from: me.u, avatar: me.avatar, text: d.text, to: d.to, isGroup: d.isGroup };
        messages.insert(msg);
        if(d.isGroup) socket.to(d.to).emit('new-msg', msg);
        else if(userSockets[d.to]) io.to(userSockets[d.to]).emit('new-msg', msg);
    });

    socket.on('yt-command', (d) => {
        io.to(userSockets[d.target] || d.target).emit('yt-remote', d);
    });

    socket.on('speaking', (d) => {
        socket.to(userSockets[d.target] || d.target).emit('user-speaking', { user: activeUsers[socket.id], speaking: d.speaking });
    });

    function updateGlobalLists() {
        // Logique de rafraîchissement des listes d'amis et groupes ici
    }
});

server.listen(3000);
