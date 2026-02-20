const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const loki = require("lokijs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 }); 

// --- BASE DE DONNÉES ---
const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");
let messages = db.getCollection("messages") || db.addCollection("messages");

const activeUsers = {}; 
const userSockets = {}; 

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Royal Elite - Palace Edition</title>
    <style>
        :root { --gold: linear-gradient(135deg, #d4af37 0%, #f9f295 50%, #b38728 100%); --gold-s: #d4af37; --dark: #050505; --card: #121212; --text: #f1f1f1; }
        body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
        
        /* SIDEBAR ROYALE */
        #sidebar { width: 280px; background: var(--card); border-right: 1px solid var(--gold-s); display: flex; flex-direction: column; }
        .sidebar-header { padding: 20px; border-bottom: 1px solid rgba(212,175,55,0.2); }
        .sidebar-scroll { flex: 1; overflow-y: auto; padding: 10px; }
        .section-title { font-size: 0.65rem; color: #666; text-transform: uppercase; letter-spacing: 1.5px; margin: 15px 0 8px 10px; }
        
        .item-list { padding: 8px 12px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.2s; margin-bottom: 2px; }
        .item-list:hover { background: rgba(212,175,55,0.1); }
        .item-list.active { background: var(--gold); color: black; font-weight: bold; }
        
        .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #444; }
        .online { background: #22c55e; box-shadow: 0 0 5px #22c55e; }

        /* ZONE UTILISATEUR (BAS GAUCHE) */
        #user-info { background: #0a0a0a; padding: 15px; border-top: 1px solid #222; display: flex; align-items: center; gap: 12px; }
        .avatar-frame { position: relative; width: 38px; height: 38px; }
        .avatar { width: 100%; height: 100%; border-radius: 50%; border: 2px solid var(--gold-s); object-fit: cover; }
        .speaking { border-color: #22c55e !important; box-shadow: 0 0 10px #22c55e; animation: pulse 1s infinite; }
        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }

        /* CHAT & MEDIA */
        #main-content { flex: 1; display: flex; flex-direction: column; position: relative; }
        #messages-container { flex: 1; overflow-y: auto; padding: 25px; display: flex; flex-direction: column; gap: 12px; }
        .msg-bubble { max-width: 70%; padding: 12px; border-radius: 15px; background: #1a1a1a; border: 1px solid #333; position: relative; }
        .msg-bubble.me { align-self: flex-end; background: var(--gold); color: black; border: none; }
        
        /* YT & SCREEN SHARE PANEL */
        #media-panel { height: 0; background: #000; transition: 0.4s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden; }
        #media-panel.open { height: 350px; border-bottom: 2px solid var(--gold-s); }

        /* MODALS */
        .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 1000; display: none; align-items: center; justify-content: center; backdrop-filter: blur(5px); }
        .modal.open { display: flex; }
        .modal-box { background: var(--card); padding: 30px; border: 1px solid var(--gold-s); border-radius: 20px; width: 340px; text-align: center; box-shadow: 0 0 30px rgba(0,0,0,0.5); }
        
        input { background: #1a1a1a; border: 1px solid #333; color: white; padding: 12px; border-radius: 8px; width: 85%; margin-bottom: 12px; outline: none; }
        input:focus { border-color: var(--gold-s); }
        .btn-royal { background: var(--gold); color: black; padding: 10px 20px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; width: 100%; }
        .btn-royal:hover { transform: translateY(-2px); opacity: 0.9; }
    </style>
</head>
<body>

<div id="auth-modal" class="modal open">
    <div class="modal-box">
        <h2 style="color:var(--gold-s); margin-top:0">BIENVENUE AU PALAIS</h2>
        <input id="auth-u" placeholder="Nom du noble">
        <input id="auth-p" type="password" placeholder="Mot de passe">
        <button class="btn-royal" onclick="auth('login')">ENTRER</button>
        <p style="font-size:0.8rem; margin-top:15px">Pas de titre ? <a href="#" onclick="switchAuth('reg')" style="color:var(--gold-s)">S'inscrire</a></p>
    </div>
</div>

<div id="sidebar">
    <div class="sidebar-header">
        <h3 style="color:var(--gold-s); margin:0 0 15px 0">🔱 ROYAL MESSENGER</h3>
        <div style="display:flex; gap:5px">
            <input id="add-friend-input" placeholder="Ajouter un noble..." style="margin:0; padding:8px; font-size:0.8rem">
            <button class="btn-royal" style="width:40px" onclick="addFriend()">+</button>
        </div>
    </div>
    
    <div class="sidebar-scroll">
        <div class="section-title">Amis</div>
        <div id="friends-list"></div>
        
        <div class="section-title">Groupes</div>
        <div id="groups-list">
             <div class="item-list" style="opacity:0.3; font-style:italic">Prochainement...</div>
        </div>
        
        <div class="section-title">Futurs Ajouts</div>
        <div class="item-list" style="border: 1px dashed #333; color:#444">Emplacement Libre</div>
    </div>

    <div id="user-info">
        <div class="avatar-frame">
            <img id="my-avatar" class="avatar" src="https://ui-avatars.com/api/?name=User" onclick="openSettings()">
        </div>
        <div style="flex:1">
            <div id="my-name" style="font-weight:bold; font-size:0.9rem">Chargement...</div>
            <div style="font-size:0.7rem; color:#666">En ligne</div>
        </div>
        <button onclick="openSettings()" style="background:none; border:none; cursor:pointer; color:#555">⚙️</button>
    </div>
</div>

<div id="main-content">
    <div id="media-panel">
        <div id="yt-player"></div>
    </div>

    <div id="chat-header" style="padding:15px; border-bottom:1px solid #222; display:flex; justify-content:space-between; align-items:center;">
        <h3 id="target-title" style="margin:0">Cercle Royal</h3>
        <div id="action-btns" class="hidden" style="display:flex; gap:10px">
            <button class="btn-royal" style="width:auto" onclick="startCall()">📞</button>
            <button class="btn-royal" style="width:auto" onclick="toggleMedia()">📺</button>
        </div>
    </div>

    <div id="messages-container"></div>
    
    <div id="input-area" class="hidden" style="padding:20px; display:flex; gap:10px">
        <input id="chat-inp" placeholder="Écrire au noble..." style="flex:1; margin:0" onkeypress="if(event.key==='Enter') sendMsg()">
        <button class="btn-royal" style="width:60px" onclick="sendMsg()">➤</button>
    </div>
</div>

<div id="settings-modal" class="modal">
    <div class="modal-box">
        <h3 style="color:var(--gold-s)">PARAMÈTRES</h3>
        <input id="set-u" placeholder="Nouveau Pseudo (min 5)">
        <input id="set-p" type="password" placeholder="Nouveau Mot de passe (min 5)">
        <p style="font-size:0.7rem">Photo : <input type="file" id="set-av" accept="image/*" style="width:auto"></p>
        <button class="btn-royal" onclick="saveSettings()">Enregistrer</button>
        <button class="btn-royal" style="background:#444; margin-top:8px" onclick="closeSettings()">Fermer</button>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    let myData = {}, activeChat = null;

    // --- AUTH ---
    function auth(type) {
        const u = document.getElementById('auth-u').value;
        const p = document.getElementById('auth-p').value;
        if(u.length < 5 || p.length < 5) return alert("Minimum 5 lettres !");
        socket.emit(type === 'login' ? 'login' : 'register', { u, p });
    }

    socket.on('auth-success', (u) => {
        myData = u;
        document.getElementById('my-name').innerText = u.name;
        document.getElementById('my-avatar').src = u.avatar || 'https://ui-avatars.com/api/?name='+u.name;
        document.getElementById('auth-modal').classList.remove('open');
    });

    socket.on('auth-error', m => alert(m));

    // --- AMIS (RÉPARÉ) ---
    function addFriend() {
        const target = document.getElementById('add-friend-input').value.trim();
        if(!target || target === myData.name) return;
        socket.emit('request-friend', target);
        document.getElementById('add-friend-input').value = '';
    }

    socket.on('friend-request', (from) => {
        if(confirm("Le noble " + from + " souhaite vous ajouter. Accepter ?")) {
            socket.emit('respond-friend', { from, accept: true });
        }
    });

    socket.on('update-list', (friends) => {
        const list = document.getElementById('friends-list');
        list.innerHTML = '';
        friends.forEach(f => {
            const div = document.createElement('div');
            div.className = 'item-list' + (activeChat === f.name ? ' active' : '');
            div.innerHTML = \`<div class="status-dot \${f.online?'online':''}"></div> \${f.name}\`;
            div.onclick = () => selectChat(f.name);
            list.appendChild(div);
        });
    });

    function selectChat(name) {
        activeChat = name;
        document.getElementById('target-title').innerText = name;
        document.getElementById('input-area').classList.remove('hidden');
        document.getElementById('action-btns').classList.remove('hidden');
        socket.emit('load-history', name);
    }

    // --- MESSAGERIE ---
    function sendMsg() {
        const text = document.getElementById('chat-inp').value;
        if(!text) return;
        socket.emit('private-msg', { to: activeChat, text });
        appendMsg({ from: myData.name, text }, true);
        document.getElementById('chat-inp').value = '';
    }

    socket.on('new-msg', (m) => {
        if(activeChat === m.from) appendMsg(m, false);
    });

    socket.on('history', (ms) => {
        const c = document.getElementById('messages-container'); c.innerHTML = '';
        ms.forEach(m => appendMsg(m, m.from === myData.name));
    });

    function appendMsg(m, isMe) {
        const c = document.getElementById('messages-container');
        const d = document.createElement('div');
        d.className = 'msg-bubble' + (isMe ? ' me' : '');
        d.innerHTML = \`<div style="font-size:0.6rem; opacity:0.5">\${m.from}</div>\${m.text}\`;
        c.appendChild(d);
        c.scrollTop = c.scrollHeight;
    }

    // --- PARAMÈTRES ---
    function openSettings() { document.getElementById('settings-modal').classList.add('open'); }
    function closeSettings() { document.getElementById('settings-modal').classList.remove('open'); }
    
    function saveSettings() {
        const u = document.getElementById('set-u').value;
        const p = document.getElementById('set-p').value;
        const file = document.getElementById('set-av').files[0];
        
        const reader = new FileReader();
        reader.onload = () => {
            socket.emit('update-profile', { name: u, pass: p, avatar: reader.result });
            closeSettings();
        };
        if(file) reader.readAsDataURL(file);
        else socket.emit('update-profile', { name: u, pass: p });
    }

    function toggleMedia() { document.getElementById('media-panel').classList.toggle('open'); }
</script>
</body>
</html>
`);
});

// --- SERVEUR ---
io.on("connection", (socket) => {
    socket.on('login', (d) => {
        const u = users.findOne({ u: d.u, p: d.p });
        if(u) loginOk(socket, u);
        else socket.emit('auth-error', 'Accès refusé.');
    });

    socket.on('register', (d) => {
        if(users.findOne({u: d.u})) return socket.emit('auth-error', 'Nom déjà pris.');
        const newUser = users.insert({ u: d.u, p: d.p, avatar: '', friends: [] });
        loginOk(socket, newUser);
    });

    function loginOk(socket, user) {
        activeUsers[socket.id] = user.u;
        userSockets[user.u] = socket.id;
        socket.emit('auth-success', { name: user.u, avatar: user.avatar });
        refresh(socket);
        io.emit('refresh-all');
    }

    socket.on('request-friend', (target) => {
        const sid = userSockets[target];
        if(sid) io.to(sid).emit('friend-request', activeUsers[socket.id]);
    });

    socket.on('respond-friend', (d) => {
        const me = users.findOne({ u: activeUsers[socket.id] });
        const them = users.findOne({ u: d.from });
        if(d.accept && me && them) {
            if(!me.friends.includes(them.u)) {
                me.friends.push(them.u); them.friends.push(me.u);
                users.update(me); users.update(them);
            }
            refresh(socket);
            if(userSockets[them.u]) refresh(io.sockets.sockets.get(userSockets[them.u]));
        }
    });

    socket.on('private-msg', (d) => {
        const me = activeUsers[socket.id];
        messages.insert({ from: me, to: d.to, text: d.text, time: Date.now() });
        if(userSockets[d.to]) io.to(userSockets[d.to]).emit('new-msg', { from: me, text: d.text });
    });

    socket.on('load-history', (target) => {
        const me = activeUsers[socket.id];
        const h = messages.find({ $or: [{from:me, to:target}, {from:target, to:me}] }).sort((a,b)=>a.time-b.time);
        socket.emit('history', h);
    });

    socket.on('update-profile', (d) => {
        const u = users.findOne({ u: activeUsers[socket.id] });
        if(d.name && d.name.length >= 5) {
            delete userSockets[u.u];
            u.u = d.name;
            userSockets[d.name] = socket.id;
            activeUsers[socket.id] = d.name;
        }
        if(d.pass && d.pass.length >= 5) u.p = d.pass;
        if(d.avatar) u.avatar = d.avatar;
        users.update(u);
        socket.emit('auth-success', { name: u.u, avatar: u.avatar });
        io.emit('refresh-all');
    });

    function refresh(s) {
        const u = users.findOne({ u: activeUsers[s.id] });
        if(u) s.emit('update-list', u.friends.map(f => ({ name: f, online: !!userSockets[f] })));
    }

    socket.on('refresh-all', () => {
        io.sockets.sockets.forEach(s => refresh(s));
    });

    socket.on('disconnect', () => {
        const name = activeUsers[socket.id];
        delete userSockets[name]; delete activeUsers[socket.id];
        io.emit('refresh-all');
    });
});

server.listen(3000);
