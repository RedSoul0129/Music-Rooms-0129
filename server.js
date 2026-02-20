const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const loki = require("lokijs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 }); 

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
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Royal Elite - Device Selector</title>
    <style>
        :root { --gold: linear-gradient(135deg, #d4af37 0%, #f9f295 50%, #b38728 100%); --gold-s: #d4af37; --dark: #050505; --card: #121212; --text: #f1f1f1; }
        
        body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }

        /* SELECTEUR DE MODE */
        #device-selector { position: fixed; inset: 0; background: var(--dark); z-index: 3000; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 20px; }
        .device-card { background: var(--card); border: 1px solid var(--gold-s); padding: 30px; border-radius: 20px; width: 250px; cursor: pointer; transition: 0.3s; }
        .device-card:hover { transform: scale(1.05); background: rgba(212,175,55,0.1); }

        /* SIDEBAR ADAPTATIVE */
        #sidebar { width: 300px; background: var(--card); border-right: 1px solid var(--gold-s); display: flex; flex-direction: column; transition: 0.3s; z-index: 1500; }
        
        /* MODE MOBILE OVERRIDE */
        body.is-mobile #sidebar { position: fixed; left: -100%; height: 100%; width: 85%; }
        body.is-mobile #sidebar.open { left: 0; }
        body.is-mobile #menu-toggle { display: block; }
        #menu-toggle { display: none; background: var(--gold); border: none; padding: 10px; font-weight: bold; cursor: pointer; }

        .sidebar-header { padding: 20px; border-bottom: 1px solid rgba(212,175,55,0.1); }
        .sidebar-scroll { flex: 1; overflow-y: auto; padding: 10px; }
        
        .item-list { padding: 12px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 10px; margin-bottom: 5px; }
        .item-list.active { background: var(--gold); color: black; font-weight: bold; }

        #user-info { background: #0a0a0a; padding: 15px; border-top: 1px solid #222; display: flex; align-items: center; gap: 12px; }
        .avatar { width: 40px; height: 40px; border-radius: 50%; border: 2px solid var(--gold-s); object-fit: cover; }

        /* CHAT */
        #main-content { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        #messages-container { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        .msg-bubble { max-width: 80%; padding: 12px; border-radius: 15px; background: #1a1a1a; word-wrap: break-word; font-size: 15px; }
        .msg-bubble.me { align-self: flex-end; background: var(--gold); color: black; }

        /* MODALS */
        .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 2000; display: none; align-items: center; justify-content: center; }
        .modal.open { display: flex; }
        .modal-box { background: var(--card); padding: 25px; border: 1px solid var(--gold-s); border-radius: 20px; width: 90%; max-width: 320px; text-align: center; }
        
        input { background: #1a1a1a; border: 1px solid #333; color: white; padding: 15px; border-radius: 8px; width: 100%; box-sizing: border-box; margin-bottom: 12px; font-size: 16px; outline: none; }
        .btn-royal { background: var(--gold); color: black; padding: 15px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; width: 100%; }
        
        .hidden { display: none !important; }
    </style>
</head>
<body>

<div id="device-selector">
    <h2 style="color:var(--gold-s)">VOTRE APPAREIL</h2>
    <div class="device-card" onclick="setMode('pc')">
        <h1 style="margin:0">💻</h1>
        <h3>ORDINATEUR</h3>
    </div>
    <div class="device-card" onclick="setMode('mobile')">
        <h1 style="margin:0">📱</h1>
        <h3>TÉLÉPHONE</h3>
    </div>
</div>

<div id="auth-modal" class="modal">
    <div class="modal-box">
        <h2 id="auth-title" style="color:var(--gold-s)">ACCÈS ROYAL</h2>
        <input id="auth-u" placeholder="Pseudo" autocomplete="off">
        <input id="auth-p" type="password" placeholder="Mot de passe">
        <button id="auth-btn" class="btn-royal" onclick="handleAuth()">ENTRER</button>
        <p style="font-size:0.8rem; margin-top:10px">
            <a href="javascript:void(0)" id="auth-toggle-link" onclick="toggleAuthMode()" style="color:var(--gold-s)">S'inscrire</a>
        </p>
    </div>
</div>

<div id="sidebar">
    <div class="sidebar-header">
        <div style="display:flex; justify-content:space-between; align-items:center">
            <h3 style="color:var(--gold-s); margin:0">🔱 ROYAL</h3>
            <button id="close-mobile-menu" class="hidden" onclick="toggleSidebar()" style="background:none; border:none; color:white; font-size:1.5rem">✕</button>
        </div>
        <div style="display:flex; gap:5px; margin-top:15px">
            <input id="add-f-in" placeholder="Ajouter..." style="padding:8px; margin:0">
            <button class="btn-royal" style="width:40px; padding:0" onclick="addFriend()">+</button>
        </div>
    </div>
    
    <div class="sidebar-scroll">
        <div style="font-size:0.6rem; color:#555; margin-bottom:10px; text-transform:uppercase">Membres</div>
        <div id="friends-list"></div>
    </div>

    <div id="user-info">
        <img id="my-avatar" class="avatar" src="https://ui-avatars.com/api/?name=?" onclick="openSettings()">
        <div style="flex:1; overflow:hidden">
            <div id="my-name" style="font-weight:bold; font-size:0.9rem; text-overflow:ellipsis; overflow:hidden">...</div>
            <div style="font-size:0.7rem; color:#22c55e">En ligne</div>
        </div>
        <button onclick="openSettings()" style="background:none; border:none; color:#555; cursor:pointer">⚙️</button>
    </div>
</div>

<div id="main-content">
    <div id="chat-header" style="padding:15px; border-bottom:1px solid #222; display:flex; align-items:center; gap:15px">
        <button id="menu-toggle" onclick="toggleSidebar()">☰</button>
        <h3 id="target-title" style="margin:0">Cercle Royal</h3>
    </div>
    
    <div id="messages-container"></div>
    
    <div id="input-area" class="hidden" style="padding:15px; display:flex; gap:10px; background:#0a0a0a">
        <input id="chat-inp" placeholder="Message..." style="flex:1; margin:0" onkeypress="if(event.key==='Enter') sendMsg()">
        <button class="btn-royal" style="width:60px" onclick="sendMsg()">➤</button>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    let myData = {}, activeChat = null, authMode = 'login';

    // --- MODE SELECTOR ---
    function setMode(mode) {
        if(mode === 'mobile') {
            document.body.classList.add('is-mobile');
            document.getElementById('close-mobile-menu').classList.remove('hidden');
        }
        document.getElementById('device-selector').style.display = 'none';
        document.getElementById('auth-modal').classList.add('open');
    }

    function toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('open');
    }

    // --- AUTH ---
    function toggleAuthMode() {
        authMode = (authMode === 'login' ? 'register' : 'login');
        document.getElementById('auth-title').innerText = (authMode === 'login' ? "ACCÈS ROYAL" : "CRÉER UN TITRE");
        document.getElementById('auth-btn').innerText = (authMode === 'login' ? "ENTRER" : "S'INSCRIRE");
        document.getElementById('auth-toggle-link').innerText = (authMode === 'login' ? "S'inscrire" : "Se connecter");
    }

    function handleAuth() {
        const u = document.getElementById('auth-u').value.trim();
        const p = document.getElementById('auth-p').value.trim();
        if(u.length < 4) return alert("Pseudo trop court");
        socket.emit(authMode, { u, p });
    }

    socket.on('auth-success', u => {
        myData = u;
        document.getElementById('my-name').innerText = u.name;
        document.getElementById('my-avatar').src = u.avatar || 'https://ui-avatars.com/api/?name='+u.name;
        document.getElementById('auth-modal').classList.remove('open');
    });

    socket.on('auth-error', m => alert(m));

    // --- LOGIQUE CORE ---
    function addFriend() {
        const t = document.getElementById('add-f-in').value.trim();
        if(t && t !== myData.name) socket.emit('request-friend', t);
        document.getElementById('add-f-in').value = '';
    }

    socket.on('update-list', fs => {
        const l = document.getElementById('friends-list'); l.innerHTML = '';
        fs.forEach(f => {
            const d = document.createElement('div');
            d.className = 'item-list' + (activeChat === f.name ? ' active' : '');
            d.innerHTML = \`<div class="status-dot \${f.online?'online':''}"></div> \${f.name}\`;
            d.onclick = () => {
                activeChat = f.name;
                document.getElementById('target-title').innerText = f.name;
                document.getElementById('input-area').classList.remove('hidden');
                if(document.body.classList.contains('is-mobile')) toggleSidebar();
                socket.emit('load-history', f.name);
            };
            l.appendChild(d);
        });
    });

    function sendMsg() {
        const text = document.getElementById('chat-inp').value;
        if(!text) return;
        socket.emit('private-msg', { to: activeChat, text });
        appendMsg({ from: myData.name, text }, true);
        document.getElementById('chat-inp').value = '';
    }

    socket.on('new-msg', m => { if(activeChat === m.from) appendMsg(m, false); });
    socket.on('history', ms => {
        const c = document.getElementById('messages-container'); c.innerHTML = '';
        ms.forEach(m => appendMsg(m, m.from === myData.name));
    });

    function appendMsg(m, isMe) {
        const c = document.getElementById('messages-container');
        const d = document.createElement('div');
        d.className = 'msg-bubble' + (isMe ? ' me' : '');
        d.innerHTML = \`<div style="font-size:0.6rem; opacity:0.5">\${m.from}</div>\${m.text}\`;
        c.appendChild(d); c.scrollTop = c.scrollHeight;
    }
</script>
</body>
</html>
`);
});

// --- SERVEUR (LOGIQUE IDENTIQUE) ---
io.on("connection", (socket) => {
    socket.on('login', (d) => {
        const u = users.findOne({ u: d.u, p: d.p });
        if(u) loginOk(socket, u); else socket.emit('auth-error', 'Identifiants faux');
    });
    socket.on('register', (d) => {
        if(users.findOne({u: d.u})) return socket.emit('auth-error', 'Nom déjà pris');
        const newUser = users.insert({ u: d.u, p: d.p, avatar: '', friends: [] });
        loginOk(socket, newUser);
    });
    function loginOk(socket, user) {
        activeUsers[socket.id] = user.u;
        userSockets[user.u] = socket.id;
        socket.emit('auth-success', { name: user.u, avatar: user.avatar });
        refresh(socket); io.emit('refresh-all');
    }
    socket.on('request-friend', t => {
        const sid = userSockets[t];
        if(sid) io.to(sid).emit('friend-request', activeUsers[socket.id]);
    });
    socket.on('respond-friend', d => {
        const me = users.findOne({ u: activeUsers[socket.id] }), them = users.findOne({ u: d.from });
        if(d.accept && me && them) {
            if(!me.friends.includes(them.u)) { me.friends.push(them.u); them.friends.push(me.u); users.update(me); users.update(them); }
            refresh(socket); if(userSockets[them.u]) refresh(io.sockets.sockets.get(userSockets[them.u]));
        }
    });
    socket.on('private-msg', d => {
        const me = activeUsers[socket.id];
        messages.insert({ from: me, to: d.to, text: d.text, time: Date.now() });
        if(userSockets[d.to]) io.to(userSockets[d.to]).emit('new-msg', { from: me, text: d.text });
    });
    socket.on('load-history', t => {
        const me = activeUsers[socket.id];
        const h = messages.find({ $or: [{from:me, to:t}, {from:t, to:me}] }).sort((a,b)=>a.time-b.time);
        socket.emit('history', h);
    });
    function refresh(s) {
        const u = users.findOne({ u: activeUsers[s.id] });
        if(u) s.emit('update-list', u.friends.map(f => ({ name: f, online: !!userSockets[f] })));
    }
    socket.on('refresh-all', () => io.sockets.sockets.forEach(s => refresh(s)));
    socket.on('disconnect', () => { delete userSockets[activeUsers[socket.id]]; delete activeUsers[socket.id]; io.emit('refresh-all'); });
});

server.listen(process.env.PORT || 3000);
