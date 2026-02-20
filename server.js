const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const loki = require("lokijs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 }); // 10MB max pour les images

// --- BASE DE DONNÉES ---
const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");
let messages = db.getCollection("messages") || db.addCollection("messages");
let groups = db.getCollection("groups") || db.addCollection("groups");
let ytRooms = db.getCollection("ytRooms") || db.addCollection("ytRooms");

const activeUsers = {}; 
const userSockets = {}; 

// Filtre anti-insultes basique
const slurs = /motraciste1|motraciste2|insulte1|insulte2/gi; 

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Royal Elite - Ultimate</title>
    <style>
        :root { --gold: linear-gradient(135deg, #e6c27a 0%, #ffe5a3 50%, #c59b3d 100%); --gold-s: #d4af37; --dark: #080808; --card: #151515; --text: #f1f1f1; --danger: #ff4444; }
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }

        /* UI GÉNÉRALE */
        .btn-royal { background: var(--gold); color: black; padding: 12px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .btn-royal:active { transform: scale(0.95); }
        .btn-icon { background: transparent; border: 1px solid var(--gold-s); color: var(--gold-s); padding: 8px 12px; border-radius: 8px; cursor: pointer; }
        input { background: #111; border: 1px solid #333; color: white; padding: 12px; border-radius: 8px; width: 100%; margin-bottom: 10px; font-size: 16px; outline: none; }
        input:focus { border-color: var(--gold-s); }

        /* SIDEBAR (Responsive) */
        #sidebar { width: 300px; background: var(--card); border-right: 1px solid #222; display: flex; flex-direction: column; transition: transform 0.3s ease; z-index: 100; }
        .sidebar-header { padding: 20px; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; }
        .sidebar-scroll { flex: 1; overflow-y: auto; padding: 15px; }
        .section-title { font-size: 0.7rem; color: #777; text-transform: uppercase; letter-spacing: 1px; margin: 15px 0 10px 5px; }
        
        .list-item { padding: 10px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 10px; margin-bottom: 5px; transition: 0.2s; }
        .list-item:hover { background: rgba(212,175,55,0.05); }
        .list-item.active { background: rgba(212,175,55,0.15); border-left: 3px solid var(--gold-s); }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #444; }
        .online { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
        .avatar { width: 35px; height: 35px; border-radius: 50%; object-fit: cover; border: 1px solid #333; }

        /* USER BAR */
        #user-bar { background: #0a0a0a; padding: 15px; border-top: 1px solid #222; display: flex; align-items: center; gap: 10px; }

        /* MAIN AREA */
        #main-content { flex: 1; display: flex; flex-direction: column; position: relative; min-width: 0; background: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAOklEQVQYV2NkYGAwYkAD////ZwxlwE/iAAZ0xShK8CqEWYgsgKwQWR5dEFk+uhXYFME0EQyFSAuIBQClZhx7Z4nCgQAAAABJRU5ErkJggg==') repeat; }
        #top-bar { padding: 15px 20px; background: rgba(21, 21, 21, 0.95); backdrop-filter: blur(10px); border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; }
        #mobile-menu-btn { display: none; background: none; border: none; color: var(--gold-s); font-size: 1.5rem; cursor: pointer; }

        /* CHAT */
        #chat-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        #messages-container { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        .msg-row { display: flex; gap: 10px; }
        .msg-row.me { flex-direction: row-reverse; }
        .msg-bubble { max-width: 75%; padding: 12px 15px; border-radius: 12px; background: #1a1a1a; word-wrap: break-word; font-size: 0.95rem; }
        .msg-row.me .msg-bubble { background: var(--gold); color: black; }
        .msg-author { font-size: 0.7rem; color: #888; margin-bottom: 5px; }
        .msg-row.me .msg-author { text-align: right; color: #555; }

        /* YOUTUBE ROOM & CALLS */
        #yt-area, #call-area { display: none; flex: 1; flex-direction: column; background: #000; padding: 10px; }
        .video-wrapper { position: relative; width: 100%; aspect-ratio: 16/9; background: #111; border: 1px solid var(--gold-s); border-radius: 8px; overflow: hidden; }
        #yt-player { width: 100%; height: 100%; }
        video { width: 100%; height: 100%; object-fit: contain; }

        /* MODALS */
        .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 2000; display: none; align-items: center; justify-content: center; backdrop-filter: blur(5px); padding: 20px; }
        .modal.open { display: flex; }
        .modal-box { background: var(--card); padding: 25px; border: 1px solid var(--gold-s); border-radius: 15px; width: 100%; max-width: 350px; text-align: center; }
        
        /* NOTIFS */
        .notif-badge { background: var(--danger); color: white; border-radius: 50%; padding: 2px 6px; font-size: 0.6rem; font-weight: bold; }

        /* MEDIA QUERIES (MOBILE) */
        @media (max-width: 768px) {
            #sidebar { position: fixed; height: 100%; transform: translateX(-100%); width: 85%; max-width: 320px; }
            #sidebar.open { transform: translateX(0); box-shadow: 10px 0 30px rgba(0,0,0,0.8); }
            #mobile-menu-btn { display: block; }
            .msg-bubble { max-width: 85%; }
        }
    </style>
</head>
<body>

<div id="auth-modal" class="modal open">
    <div class="modal-box">
        <h2 id="auth-title" style="color:var(--gold-s)">PALAIS ROYAL</h2>
        <input id="auth-u" placeholder="Pseudo" autocomplete="off">
        <input id="auth-p" type="password" placeholder="Mot de passe">
        <button class="btn-royal" style="width:100%" onclick="handleAuth()">ENTRER</button>
        <p style="font-size:0.8rem; margin-top:15px">
            Pas de compte ? <a href="#" onclick="toggleAuth()" style="color:var(--gold-s)" id="auth-toggle">S'inscrire</a>
        </p>
    </div>
</div>

<div id="settings-modal" class="modal">
    <div class="modal-box">
        <h3 style="color:var(--gold-s)">PROFIL & RÉGLAGES</h3>
        <input id="set-u" placeholder="Nouveau Pseudo">
        <input id="set-p" type="password" placeholder="Nouveau Mot de passe">
        <p style="text-align:left; font-size:0.8rem; color:#aaa">Changer d'icône (Image) :</p>
        <input type="file" id="set-av" accept="image/*" style="font-size:0.8rem">
        <button class="btn-royal" style="width:100%; margin-bottom:10px" onclick="saveSettings()">SAUVEGARDER</button>
        <button class="btn-icon" style="width:100%; border-color:#555; color:#aaa" onclick="closeModal('settings-modal')">ANNULER</button>
    </div>
</div>

<div id="sidebar">
    <div class="sidebar-header">
        <h3 style="color:var(--gold-s); margin:0">🔱 ROYAL</h3>
        <button id="close-mobile-btn" class="btn-icon" style="display:none; border:none; font-size:1.2rem" onclick="toggleSidebar()">✕</button>
    </div>
    
    <div class="sidebar-scroll">
        <div class="section-title">Demandes <span id="req-count" class="notif-badge" style="display:none">0</span></div>
        <div style="display:flex; gap:5px; margin-bottom:10px">
            <input id="add-f-in" placeholder="Pseudo..." style="margin:0; padding:8px; font-size:0.8rem">
            <button class="btn-royal" style="padding:8px" onclick="sendFriendReq()">+</button>
        </div>
        <div id="requests-list"></div>

        <div class="section-title">Amis</div>
        <div id="friends-list"></div>

        <div class="section-title">Groupes <button class="btn-icon" style="padding:2px 6px; font-size:0.7rem; float:right" onclick="createGroup()">+</button></div>
        <div id="groups-list"></div>

        <div class="section-title">Salles YouTube <button class="btn-icon" style="padding:2px 6px; font-size:0.7rem; float:right" onclick="createYTRoom()">+</button></div>
        <div id="yt-rooms-list"></div>
    </div>

    <div id="user-bar">
        <img id="my-avatar" class="avatar" src="https://ui-avatars.com/api/?name=?" onclick="openModal('settings-modal')">
        <div style="flex:1; overflow:hidden">
            <div id="my-name" style="font-weight:bold; font-size:0.9rem">...</div>
            <div style="font-size:0.7rem; color:#22c55e">En ligne</div>
        </div>
        <button class="btn-icon" style="border:none" onclick="openModal('settings-modal')">⚙️</button>
    </div>
</div>

<div id="main-content">
    <div id="top-bar">
        <div style="display:flex; align-items:center; gap:15px">
            <button id="mobile-menu-btn" onclick="toggleSidebar()">☰</button>
            <h3 id="target-title" style="margin:0">Sélectionnez un chat</h3>
        </div>
        <div id="action-btns" style="display:none; gap:10px">
            <button class="btn-icon" onclick="startCall('voice')">📞</button>
            <button class="btn-icon" onclick="startCall('screen')">🖥️ 60FPS</button>
        </div>
    </div>

    <div id="chat-area">
        <div id="messages-container"></div>
        <div id="input-area" style="padding:15px; background:rgba(0,0,0,0.5); display:flex; gap:10px; display:none">
            <input id="chat-inp" placeholder="Message..." style="margin:0" onkeypress="if(event.key==='Enter') sendMsg()">
            <button class="btn-royal" style="width:60px" onclick="sendMsg()">➤</button>
        </div>
    </div>

    <div id="call-area">
        <div class="video-wrapper">
            <video id="remote-video" autoplay playsinline></video>
        </div>
        <div style="padding:15px; text-align:center">
            <button class="btn-royal" style="background:var(--danger); color:white" onclick="endCall()">Raccrocher</button>
            <button class="btn-icon" onclick="document.getElementById('remote-video').requestFullscreen()">Plein Écran</button>
        </div>
    </div>

    <div id="yt-area">
        <div class="video-wrapper"><div id="yt-player"></div></div>
        <div style="padding:15px; display:flex; gap:10px">
            <input id="yt-url" placeholder="Lien YouTube..." style="margin:0">
            <button class="btn-royal" onclick="addToYTQueue()">Ajouter à la file</button>
        </div>
        <div id="yt-queue" style="padding:15px; color:#aaa; font-size:0.8rem"></div>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
    const socket = io();
    let myData = {}, activeTarget = null, targetType = 'user'; // user, group, yt
    let isLogin = true;

    // --- RESPONSIVE MOBILE ---
    function toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('open');
        if(window.innerWidth <= 768) {
            document.getElementById('close-mobile-btn').style.display = 'block';
        }
    }

    // --- MODALS ---
    function openModal(id) { document.getElementById(id).classList.add('open'); }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }

    // --- AUTHENTIFICATION ---
    function toggleAuth() {
        isLogin = !isLogin;
        document.getElementById('auth-title').innerText = isLogin ? "PALAIS ROYAL" : "CRÉER UN TITRE";
        document.getElementById('auth-toggle').innerText = isLogin ? "S'inscrire" : "Se connecter";
    }

    function handleAuth() {
        const u = document.getElementById('auth-u').value.trim();
        const p = document.getElementById('auth-p').value.trim();
        if(u.length < 3) return alert("Pseudo trop court.");
        socket.emit(isLogin ? 'login' : 'register', { u, p });
    }

    socket.on('auth-success', u => {
        myData = u;
        document.getElementById('my-name').innerText = u.name;
        document.getElementById('my-avatar').src = u.avatar || 'https://ui-avatars.com/api/?name='+u.name;
        closeModal('auth-modal');
        socket.emit('get-init-data'); // Récupère amis, requêtes, groupes
    });
    socket.on('auth-error', alert);

    // --- PROFIL ---
    function saveSettings() {
        const u = document.getElementById('set-u').value;
        const p = document.getElementById('set-p').value;
        const f = document.getElementById('set-av').files[0];
        const process = (av) => { socket.emit('update-profile', { name: u, pass: p, avatar: av }); closeModal('settings-modal'); };
        if(f) { const r = new FileReader(); r.onload = () => process(r.result); r.readAsDataURL(f); } else process(null);
    }

    // --- AMIS & DEMANDES (CORRIGÉ SANS CONFIRM) ---
    function sendFriendReq() {
        const t = document.getElementById('add-f-in').value.trim();
        if(t && t !== myData.name) socket.emit('send-request', t);
        document.getElementById('add-f-in').value = '';
    }

    socket.on('init-data', d => {
        // MAJ Requêtes
        const reqList = document.getElementById('requests-list');
        reqList.innerHTML = '';
        const badge = document.getElementById('req-count');
        badge.style.display = d.requests.length > 0 ? 'inline-block' : 'none';
        badge.innerText = d.requests.length;

        d.requests.forEach(req => {
            const div = document.createElement('div'); div.className = 'list-item'; div.style.fontSize = '0.8rem';
            div.innerHTML = \`<span>\${req}</span> <button class="btn-royal" style="padding:4px 8px; margin-left:auto" onclick="socket.emit('accept-request', '\${req}')">✔</button>\`;
            reqList.appendChild(div);
        });

        // MAJ Amis
        const fList = document.getElementById('friends-list'); fList.innerHTML = '';
        d.friends.forEach(f => {
            const div = document.createElement('div'); div.className = 'list-item';
            div.innerHTML = \`<img src="\${f.avatar || 'https://ui-avatars.com/api/?name='+f.name}" class="avatar" style="width:25px;height:25px"> <div class="status-dot \${f.online?'online':''}"></div> \${f.name}\`;
            div.onclick = () => switchView('user', f.name);
            fList.appendChild(div);
        });

        // MAJ Groupes & Salles
        const gList = document.getElementById('groups-list'); gList.innerHTML = '';
        d.groups.forEach(g => {
            const div = document.createElement('div'); div.className = 'list-item'; div.innerHTML = '👥 ' + g.name;
            div.onclick = () => switchView('group', g.name);
            gList.appendChild(div);
        });

        const yList = document.getElementById('yt-rooms-list'); yList.innerHTML = '';
        d.ytRooms.forEach(y => {
            const div = document.createElement('div'); div.className = 'list-item'; div.innerHTML = '🎬 ' + y;
            div.onclick = () => switchView('yt', y);
            yList.appendChild(div);
        });
    });

    // --- NAVIGATION ---
    function switchView(type, target) {
        activeTarget = target; targetType = type;
        document.getElementById('target-title').innerText = target;
        document.getElementById('action-btns').style.display = type === 'yt' ? 'none' : 'flex';
        
        ['chat-area', 'call-area', 'yt-area'].forEach(id => document.getElementById(id).style.display = 'none');
        
        if(type === 'yt') {
            document.getElementById('yt-area').style.display = 'flex';
            socket.emit('join-yt-room', target);
        } else {
            document.getElementById('chat-area').style.display = 'flex';
            document.getElementById('input-area').style.display = 'flex';
            socket.emit('load-chat', { type, target });
        }
        if(window.innerWidth <= 768) toggleSidebar();
    }

    // --- CHAT & ANTI-SLUR CLIENT SIDE VISUAL ---
    function sendMsg() {
        const i = document.getElementById('chat-inp');
        if(!i.value) return;
        socket.emit('send-msg', { type: targetType, target: activeTarget, text: i.value });
        i.value = '';
    }

    socket.on('chat-history', msgs => {
        const c = document.getElementById('messages-container'); c.innerHTML = '';
        msgs.forEach(m => appendMsg(m));
    });

    socket.on('new-msg', m => {
        if((targetType === 'user' && (m.from === activeTarget || m.from === myData.name)) || 
           (targetType === 'group' && m.target === activeTarget)) {
            appendMsg(m);
        }
    });

    function appendMsg(m) {
        const isMe = m.from === myData.name;
        const c = document.getElementById('messages-container');
        const r = document.createElement('div'); r.className = 'msg-row ' + (isMe ? 'me' : '');
        r.innerHTML = \`<img src="\${m.avatar || 'https://ui-avatars.com/api/?name='+m.from}" class="avatar">
                       <div><div class="msg-author">\${m.from}</div><div class="msg-bubble">\${m.text}</div></div>\`;
        c.appendChild(r); c.scrollTop = c.scrollHeight;
    }

    // --- CREATIONS ---
    function createGroup() {
        const n = prompt("Nom du groupe ?");
        if(n) socket.emit('create-group', n);
    }
    function createYTRoom() {
        const n = prompt("Nom de la salle de projection ?");
        if(n) socket.emit('create-yt-room', n);
    }

    // --- YOUTUBE SYNC ---
    let player, ytSyncing = false;
    function onYouTubeIframeAPIReady() { player = new YT.Player('yt-player', { events: { 'onStateChange': onPlayerStateChange }}); }
    
    function addToYTQueue() {
        const url = document.getElementById('yt-url').value;
        const id = url.split('v=')[1]?.split('&')[0];
        if(id) { socket.emit('yt-action', { room: activeTarget, action: 'add', id }); document.getElementById('yt-url').value = ''; }
    }

    function onPlayerStateChange(e) {
        if(ytSyncing) return;
        socket.emit('yt-action', { room: activeTarget, action: 'sync', state: e.data, time: player.getCurrentTime() });
    }

    socket.on('yt-sync', d => {
        ytSyncing = true;
        if(d.action === 'add' || d.action === 'load') player.loadVideoById(d.id);
        if(d.action === 'sync') {
            if(d.state === 1) player.playVideo(); else if(d.state === 2) player.pauseVideo();
            if(Math.abs(player.getCurrentTime() - d.time) > 2) player.seekTo(d.time);
        }
        setTimeout(() => ytSyncing = false, 500);
    });

    // --- WEBRTC (Screen & Voice 1v1 Base) ---
    let localStream, pc;
    async function startCall(mode) {
        document.getElementById('chat-area').style.display = 'none';
        document.getElementById('call-area').style.display = 'flex';
        
        if(mode === 'screen') {
            localStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60 } }, audio: true });
        } else {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }
        // Logique WebRTC simplifiée pour l'exemple
        document.getElementById('remote-video').srcObject = localStream; // Auto-retour visuel pour l'instant
        socket.emit('call-request', { target: activeTarget, mode });
    }

    function endCall() {
        if(localStream) localStream.getTracks().forEach(t => t.stop());
        document.getElementById('call-area').style.display = 'none';
        document.getElementById('chat-area').style.display = 'flex';
    }
</script>
</body>
</html>
`);
});

// --- SERVEUR NODE.JS ---
io.on("connection", (socket) => {
    socket.on('register', (d) => {
        if(users.findOne({u: d.u})) return socket.emit('auth-error', 'Nom pris');
        const u = users.insert({ u: d.u, p: d.p, avatar: '', friends: [], requests: [] });
        loginOk(socket, u);
    });

    socket.on('login', (d) => {
        const u = users.findOne({ u: d.u, p: d.p });
        if(u) loginOk(socket, u); else socket.emit('auth-error', 'Erreur identifiants');
    });

    function loginOk(s, u) {
        activeUsers[s.id] = u.u; userSockets[u.u] = s.id;
        s.emit('auth-success', { name: u.u, avatar: u.avatar });
    }

    socket.on('get-init-data', () => refreshUser(socket));

    // AMIS CORRIGÉ
    socket.on('send-request', t => {
        const them = users.findOne({u: t});
        const me = activeUsers[socket.id];
        if(them && !them.requests.includes(me) && !them.friends.includes(me)) {
            them.requests.push(me); users.update(them);
            if(userSockets[t]) refreshUser(io.sockets.sockets.get(userSockets[t]));
        }
    });

    socket.on('accept-request', f => {
        const me = users.findOne({u: activeUsers[socket.id]});
        const them = users.findOne({u: f});
        me.requests = me.requests.filter(r => r !== f);
        if(!me.friends.includes(f)) { me.friends.push(f); them.friends.push(me.u); }
        users.update(me); users.update(them);
        refreshUser(socket); if(userSockets[f]) refreshUser(io.sockets.sockets.get(userSockets[f]));
    });

    // CHAT & ANTI SLUR
    socket.on('send-msg', d => {
        const me = users.findOne({u: activeUsers[socket.id]});
        let cleanText = d.text.replace(slurs, "***"); // Filtre activé
        
        const msg = { from: me.u, avatar: me.avatar, text: cleanText, target: d.target, time: Date.now() };
        messages.insert(msg);
        
        if(d.type === 'group') {
            io.to('group_'+d.target).emit('new-msg', msg);
        } else {
            socket.emit('new-msg', msg);
            if(userSockets[d.target]) io.to(userSockets[d.target]).emit('new-msg', msg);
        }
    });

    socket.on('load-chat', d => {
        const me = activeUsers[socket.id];
        if(d.type === 'group') {
            socket.join('group_'+d.target);
            const h = messages.find({ target: d.target }).sort((a,b)=>a.time-b.time);
            socket.emit('chat-history', h);
        } else {
            const h = messages.find({ $or: [{from:me, target:d.target}, {from:d.target, target:me}] }).sort((a,b)=>a.time-b.time);
            socket.emit('chat-history', h);
        }
    });

    // GROUPES & YT
    socket.on('create-group', n => {
        if(!groups.findOne({name: n})) { groups.insert({name: n, members: [activeUsers[socket.id]]}); refreshAll(); }
    });
    socket.on('create-yt-room', n => {
        if(!ytRooms.findOne({name: n})) { ytRooms.insert({name: n, queue: []}); refreshAll(); }
    });

    socket.on('join-yt-room', r => socket.join('yt_'+r));
    socket.on('yt-action', d => io.to('yt_'+d.room).emit('yt-sync', d));

    // PROFIL
    socket.on('update-profile', d => {
        const u = users.findOne({u: activeUsers[socket.id]});
        if(d.name) { delete userSockets[u.u]; u.u = d.name; userSockets[u.u] = socket.id; activeUsers[socket.id] = u.u; }
        if(d.pass) u.p = d.pass; if(d.avatar) u.avatar = d.avatar;
        users.update(u); socket.emit('auth-success', { name: u.u, avatar: u.avatar }); refreshAll();
    });

    function refreshUser(s) {
        if(!s) return;
        const u = users.findOne({u: activeUsers[s.id]});
        if(u) {
            const fData = u.friends.map(f => { const fu = users.findOne({u:f}); return { name: f, online: !!userSockets[f], avatar: fu?fu.avatar:'' }; });
            const gData = groups.find().filter(g => g.members.includes(u.u));
            const yData = ytRooms.find().map(y => y.name);
            s.emit('init-data', { friends: fData, requests: u.requests, groups: gData, ytRooms: yData });
        }
    }

    function refreshAll() { io.sockets.sockets.forEach(s => refreshUser(s)); }
    socket.on('disconnect', () => { delete userSockets[activeUsers[socket.id]]; delete activeUsers[socket.id]; refreshAll(); });
});

server.listen(3000);
