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
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Royal Elite Social</title>
    <style>
        :root { --gold: linear-gradient(135deg, #d4af37 0%, #f9f295 50%, #b38728 100%); --gold-s: #d4af37; --dark: #050505; --card: #121212; --text: #f1f1f1; }
        
        body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }

        /* SIDEBAR ROYALE */
        #sidebar { width: 280px; background: var(--card); border-right: 1px solid var(--gold-s); display: flex; flex-direction: column; transition: 0.3s; }
        .sidebar-header { padding: 20px; border-bottom: 1px solid rgba(212,175,55,0.2); }
        .sidebar-scroll { flex: 1; overflow-y: auto; padding: 10px; }
        .section-title { font-size: 0.65rem; color: #666; text-transform: uppercase; letter-spacing: 1.5px; margin: 15px 0 8px 10px; }
        
        .item-list { padding: 10px 12px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.2s; margin-bottom: 2px; }
        .item-list:hover { background: rgba(212,175,55,0.1); }
        .item-list.active { background: var(--gold); color: black; font-weight: bold; }
        
        .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #444; }
        .online { background: #22c55e; box-shadow: 0 0 5px #22c55e; }

        /* ZONE UTILISATEUR (BAS GAUCHE) */
        #user-info { background: #0a0a0a; padding: 12px; border-top: 1px solid #222; display: flex; align-items: center; gap: 12px; }
        .avatar-frame { position: relative; width: 38px; height: 38px; }
        .avatar { width: 100%; height: 100%; border-radius: 50%; border: 2px solid var(--gold-s); object-fit: cover; background: #222; }
        .speaking { border-color: #22c55e !important; box-shadow: 0 0 10px #22c55e; }

        /* CHAT */
        #main-content { flex: 1; display: flex; flex-direction: column; position: relative; min-width: 0; }
        #messages-container { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        .msg-bubble { max-width: 75%; padding: 12px; border-radius: 15px; background: #1a1a1a; border: 1px solid #333; word-wrap: break-word; }
        .msg-bubble.me { align-self: flex-end; background: var(--gold); color: black; border: none; }

        /* MODALS MOBILE-FRIENDLY */
        .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 2000; display: none; align-items: center; justify-content: center; padding: 20px; }
        .modal.open { display: flex; }
        .modal-box { background: var(--card); padding: 25px; border: 1px solid var(--gold-s); border-radius: 20px; width: 100%; max-width: 320px; text-align: center; }
        
        input { background: #1a1a1a; border: 1px solid #333; color: white; padding: 12px; border-radius: 8px; width: 100%; box-sizing: border-box; margin-bottom: 12px; font-size: 16px; outline: none; }
        .btn-royal { background: var(--gold); color: black; padding: 12px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; width: 100%; font-size: 1rem; }
        
        .hidden { display: none !important; }

        @media (max-width: 600px) {
            #sidebar { width: 70px; }
            #sidebar .section-title, #sidebar span, #my-name, #add-friend-input { display: none; }
            #user-info { justify-content: center; padding: 10px 0; }
        }
    </style>
</head>
<body>

<div id="auth-modal" class="modal open">
    <div class="modal-box">
        <h2 id="auth-title" style="color:var(--gold-s); margin-top:0">PALAIS ROYAL</h2>
        <input id="auth-u" placeholder="Nom du noble" autocomplete="off">
        <input id="auth-p" type="password" placeholder="Mot de passe">
        <button id="auth-btn" class="btn-royal" onclick="handleAuth()">ENTRER</button>
        <p id="auth-switch-text" style="font-size:0.8rem; margin-top:15px">
            Pas de titre ? <a href="javascript:void(0)" onclick="toggleAuthMode('register')" style="color:var(--gold-s)">S'inscrire</a>
        </p>
    </div>
</div>

<div id="sidebar">
    <div class="sidebar-header">
        <h3 style="color:var(--gold-s); margin:0 0 10px 0; font-size: 1rem;">🔱 ROYAL</h3>
        <div style="display:flex; gap:5px">
            <input id="add-f-in" placeholder="Pseudo..." style="padding:5px; margin:0">
            <button class="btn-royal" style="width:35px; padding:0" onclick="addFriend()">+</button>
        </div>
    </div>
    
    <div class="sidebar-scroll">
        <div class="section-title">Amis</div>
        <div id="friends-list"></div>
        <div class="section-title">Groupes</div>
        <div id="groups-list"><div style="font-size:0.7rem; color:#444; padding:10px">Bientôt...</div></div>
        <div class="section-title">Labo</div>
        <div class="item-list" style="border:1px dashed #333; color:#333; font-size:0.7rem">Espace libre</div>
    </div>

    <div id="user-info">
        <div class="avatar-frame">
            <img id="my-avatar" class="avatar" src="https://ui-avatars.com/api/?name=?" onclick="openSettings()">
        </div>
        <div style="flex:1; min-width:0">
            <div id="my-name" style="font-weight:bold; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis">Noble</div>
        </div>
        <button onclick="openSettings()" style="background:none; border:none; color:#555; cursor:pointer">⚙️</button>
    </div>
</div>

<div id="main-content">
    <div id="chat-header" style="padding:15px; border-bottom:1px solid #222; display:flex; justify-content:space-between; align-items:center;">
        <h3 id="target-title" style="margin:0; font-size:1rem">Cercle Royal</h3>
    </div>
    <div id="messages-container"></div>
    <div id="input-area" class="hidden" style="padding:15px; display:flex; gap:10px; background:#0a0a0a">
        <input id="chat-inp" placeholder="Message..." style="flex:1; margin:0" onkeypress="if(event.key==='Enter') sendMsg()">
        <button class="btn-royal" style="width:50px" onclick="sendMsg()">➤</button>
    </div>
</div>

<div id="settings-modal" class="modal">
    <div class="modal-box">
        <h3 style="color:var(--gold-s)">PARAMÈTRES</h3>
        <input id="set-u" placeholder="Nouveau Pseudo">
        <input id="set-p" type="password" placeholder="Nouveau Password">
        <p style="font-size:0.7rem">Avatar: <input type="file" id="set-av" accept="image/*" style="width:auto"></p>
        <button class="btn-royal" onclick="saveSettings()">SAUVER</button>
        <button class="btn-royal" style="background:#333; margin-top:8px" onclick="closeSettings()">FERMER</button>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    let myData = {}, activeChat = null, authMode = 'login';

    // --- AUTH LOGIC (FIXED) ---
    function toggleAuthMode(mode) {
        authMode = mode;
        document.getElementById('auth-title').innerText = mode === 'login' ? "PALAIS ROYAL" : "CRÉER UN TITRE";
        document.getElementById('auth-btn').innerText = mode === 'login' ? "ENTRER" : "S'INSCRIRE";
        document.getElementById('auth-switch-text').innerHTML = mode === 'login' ? 
            'Pas de titre ? <a href="javascript:void(0)" onclick="toggleAuthMode(\\'register\\')" style="color:var(--gold-s)">S\\'inscrire</a>' :
            'Déjà noble ? <a href="javascript:void(0)" onclick="toggleAuthMode(\\'login\\')" style="color:var(--gold-s)">Connexion</a>';
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

    // --- FRIENDS ---
    function addFriend() {
        const t = document.getElementById('add-f-in').value.trim();
        if(t && t !== myData.name) socket.emit('request-friend', t);
        document.getElementById('add-f-in').value = '';
    }

    socket.on('friend-request', f => {
        if(confirm("Accepter " + f + " ?")) socket.emit('respond-friend', { from: f, accept: true });
    });

    socket.on('update-list', fs => {
        const l = document.getElementById('friends-list'); l.innerHTML = '';
        fs.forEach(f => {
            const d = document.createElement('div');
            d.className = 'item-list' + (activeChat === f.name ? ' active' : '');
            d.innerHTML = \`<div class="status-dot \${f.online?'online':''}"></div> <span>\${f.name}</span>\`;
            d.onclick = () => {
                activeChat = f.name;
                document.getElementById('target-title').innerText = f.name;
                document.getElementById('input-area').classList.remove('hidden');
                socket.emit('load-history', f.name);
            };
            l.appendChild(d);
        });
    });

    // --- MESSAGES ---
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

    // --- SETTINGS ---
    function openSettings() { document.getElementById('settings-modal').classList.add('open'); }
    function closeSettings() { document.getElementById('settings-modal').classList.remove('open'); }
    function saveSettings() {
        const u = document.getElementById('set-u').value, p = document.getElementById('set-p').value, f = document.getElementById('set-av').files[0];
        const send = (av) => { socket.emit('update-profile', { name: u, pass: p, avatar: av }); closeSettings(); };
        if(f) { const r = new FileReader(); r.onload = () => send(r.result); r.readAsDataURL(f); } else send(null);
    }
</script>
</body>
</html>
`);
});

// --- SERVEUR ---
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

    socket.on('update-profile', d => {
        const u = users.findOne({ u: activeUsers[socket.id] });
        if(d.name && d.name.length >= 4) { delete userSockets[u.u]; u.u = d.name; userSockets[u.u] = socket.id; activeUsers[socket.id] = u.u; }
        if(d.pass && d.pass.length >= 4) u.p = d.pass;
        if(d.avatar) u.avatar = d.avatar;
        users.update(u);
        socket.emit('auth-success', { name: u.u, avatar: u.avatar });
        io.emit('refresh-all');
    });

    function refresh(s) {
        const u = users.findOne({ u: activeUsers[s.id] });
        if(u) s.emit('update-list', u.friends.map(f => ({ name: f, online: !!userSockets[f] })));
    }

    socket.on('refresh-all', () => io.sockets.sockets.forEach(s => refresh(s)));
    socket.on('disconnect', () => { delete userSockets[activeUsers[socket.id]]; delete activeUsers[socket.id]; io.emit('refresh-all'); });
});

server.listen(process.env.PORT || 3000);
