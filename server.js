const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const loki = require("lokijs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- BASE DE DONNÉES AVEC PERSISTANCE ---
const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");
let messages = db.getCollection("messages") || db.addCollection("messages"); // Collection pour l'historique

const activeUsers = {}; 
const userSockets = {}; 
const BANNED_WORDS = ["insulte1", "insulte2"]; 

function containsSlur(text) {
    return BANNED_WORDS.some(word => text.toLowerCase().includes(word));
}

app.get("/logo.png", (req, res) => res.sendFile(path.join(__dirname, "logo.png")));

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Royal Messenger Persistent</title>
    <link rel="icon" type="image/png" href="/logo.png">
    <style>
        :root { --gold: linear-gradient(135deg, #d4af37 0%, #f9f295 50%, #b38728 100%); --gold-s: #d4af37; --dark: #050505; --card: #121212; --text: #f1f1f1; }
        body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
        
        #sidebar { width: 320px; background: var(--card); border-right: 1px solid var(--gold-s); display: flex; flex-direction: column; }
        .sidebar-header { padding: 25px; border-bottom: 1px solid rgba(212,175,55,0.2); }
        .friend-item { padding: 15px 25px; border-bottom: 1px solid #1a1a1a; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: 0.3s; }
        .friend-item:hover { background: rgba(212,175,55,0.05); }
        .friend-item.active { background: rgba(212,175,55,0.1); border-left: 4px solid var(--gold-s); }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #444; }
        .online { background: #22c55e; box-shadow: 0 0 8px #22c55e; }

        #chat-area { flex: 1; display: flex; flex-direction: column; }
        #messages-container { flex: 1; overflow-y: auto; padding: 30px; display: flex; flex-direction: column; gap: 15px; }
        .msg { max-width: 65%; padding: 12px 18px; border-radius: 18px; font-size: 0.95rem; }
        .msg.sent { align-self: flex-end; background: var(--gold); color: black; border-bottom-right-radius: 4px; }
        .msg.received { align-self: flex-start; background: #222; border: 1px solid #333; border-bottom-left-radius: 4px; }

        #toast-container { position: fixed; bottom: 20px; right: 20px; z-index: 9999; }
        .toast { background: var(--card); border: 1px solid var(--gold-s); color: white; padding: 15px; border-radius: 10px; margin-top: 10px; cursor: pointer; animation: slide 0.3s; }
        @keyframes slide { from { transform: translateX(100%); } to { transform: translateX(0); } }

        .auth-overlay { position: fixed; inset: 0; background: #000; z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .auth-box { background: var(--card); padding: 40px; border: 1px solid var(--gold-s); border-radius: 20px; text-align: center; width: 350px; }
        
        input { padding: 12px; background: #1a1a1a; border: 1px solid #333; color: white; border-radius: 8px; width: 85%; margin-bottom: 10px; outline: none; }
        button { padding: 12px 20px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; }
        .btn-gold { background: var(--gold); color: black; }
        .hidden { display: none !important; }
    </style>
</head>
<body>

<div id="login-overlay" class="auth-overlay">
    <div class="auth-box">
        <h2 style="color:var(--gold-s)">CONNEXION</h2>
        <input id="login-u" placeholder="Utilisateur">
        <input id="login-p" type="password" placeholder="Mot de passe">
        <button class="btn-gold" style="width:100%" onclick="auth('login')">ENTRER</button>
        <p style="font-size:0.8rem; margin-top:20px;">Pas de compte ? <a href="#" onclick="switchAuth('register')" style="color:var(--gold-s)">S'inscrire</a></p>
    </div>
</div>

<div id="register-overlay" class="auth-overlay hidden">
    <div class="auth-box">
        <h2 style="color:var(--gold-s)">INSCRIPTION</h2>
        <input id="reg-u" placeholder="Nom d'utilisateur">
        <input id="reg-p" type="password" placeholder="Mot de passe">
        <button class="btn-gold" style="width:100%" onclick="auth('register')">CRÉER</button>
        <p style="font-size:0.8rem; margin-top:20px;">Déjà membre ? <a href="#" onclick="switchAuth('login')" style="color:var(--gold-s)">Se connecter</a></p>
    </div>
</div>

<div id="invite-box" style="position:fixed; top:20px; left:50%; transform:translateX(-50%); background:var(--card); border:2px solid var(--gold-s); padding:20px; border-radius:12px; z-index:3000;" class="hidden">
    <span id="invite-text"></span>
    <div style="margin-top:10px; display:flex; gap:10px;">
        <button class="btn-gold" onclick="respondInvite(true)">ACCEPTER</button>
        <button style="background:#444; color:white" onclick="respondInvite(false)">REFUSER</button>
    </div>
</div>

<div id="sidebar">
    <div class="sidebar-header">
        <h3 style="color:var(--gold-s); margin:0 0 15px 0">🔱 NOBLESSE</h3>
        <div style="display:flex; gap:5px">
            <input id="add-friend-input" placeholder="Pseudo..." style="flex:1; margin:0; padding:8px;">
            <button class="btn-gold" onclick="addFriend()">+</button>
        </div>
    </div>
    <div id="friends-list"></div>
</div>

<div id="chat-area">
    <div id="chat-header" style="padding:20px; border-bottom:1px solid #222; display:flex; justify-content:space-between; align-items:center;" class="hidden">
        <h3 id="chat-name" style="margin:0"></h3>
        <div id="call-controls">
            <button class="btn-gold" onclick="startCall()">📞 VOCAL</button>
        </div>
    </div>
    <div id="messages-container"></div>
    <div id="input-area" style="padding:25px; display:flex; gap:12px;" class="hidden">
        <input id="chat-input" placeholder="Message..." style="flex:1; margin:0" onkeypress="if(event.key==='Enter') sendMsg()">
        <button class="btn-gold" onclick="sendMsg()">➤</button>
    </div>
</div>

<div id="toast-container"></div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    let myName = "", activeChat = null, currentInviteFrom = null;

    function switchAuth(target) {
        document.getElementById('login-overlay').classList.add('hidden');
        document.getElementById('register-overlay').classList.add('hidden');
        document.getElementById(target + '-overlay').classList.remove('hidden');
    }

    function auth(type) {
        const prefix = type === 'login' ? 'login-' : 'reg-';
        const u = document.getElementById(prefix + 'u').value.trim();
        const p = document.getElementById(prefix + 'p').value.trim();
        if(u.length < 5 || p.length < 5) return alert("5 caractères minimum.");
        socket.emit(type, { u, p });
    }

    socket.on('auth-success', (name) => {
        myName = name;
        document.getElementById('login-overlay').remove();
        document.getElementById('register-overlay').remove();
    });

    socket.on('auth-error', (msg) => alert(msg));

    function addFriend() {
        const name = document.getElementById('add-friend-input').value.trim();
        if(!name) return;
        if(name === myName) return alert("Majesté, vous ne pouvez pas vous ajouter vous-même.");
        socket.emit('request-friend', name);
    }

    socket.on('friend-request-received', (from) => {
        currentInviteFrom = from;
        document.getElementById('invite-text').innerText = "👑 " + from + " veut vous ajouter !";
        document.getElementById('invite-box').classList.remove('hidden');
    });

    function respondInvite(accept) {
        socket.emit('respond-friend', { from: currentInviteFrom, accept });
        document.getElementById('invite-box').classList.add('hidden');
    }

    socket.on('update-friends', (friends) => {
        const list = document.getElementById('friends-list');
        list.innerHTML = '';
        friends.forEach(f => {
            const div = document.createElement('div');
            div.className = 'friend-item' + (activeChat === f.name ? ' active' : '');
            div.innerHTML = \`<div class="status-dot \${f.online ? 'online' : ''}"></div> <b>\${f.name}</b>\`;
            div.onclick = () => {
                activeChat = f.name;
                document.getElementById('chat-header').classList.remove('hidden');
                document.getElementById('input-area').classList.remove('hidden');
                document.getElementById('chat-name').innerText = f.name;
                document.getElementById('messages-container').innerHTML = '';
                socket.emit('load-history', f.name); // Charger l'historique
                socket.emit('refresh-friends');
            };
            list.appendChild(div);
        });
    });

    socket.on('history', (msgs) => {
        const container = document.getElementById('messages-container');
        container.innerHTML = '';
        msgs.forEach(m => appendMsg(m.text, m.from === myName ? 'sent' : 'received'));
    });

    function sendMsg() {
        const inp = document.getElementById('chat-input');
        if(inp.value.trim() && activeChat) {
            socket.emit('private-msg', { to: activeChat, msg: inp.value });
            appendMsg(inp.value, 'sent');
            inp.value = '';
        }
    }

    socket.on('msg-received', (data) => {
        if(activeChat === data.from) {
            appendMsg(data.msg, 'received');
        } else {
            showToast(data.from, data.msg);
        }
    });

    function showToast(from, msg) {
        const container = document.getElementById('toast-container');
        const t = document.createElement('div');
        t.className = 'toast';
        t.innerHTML = \`<b>🔱 \${from}:</b> \${msg.substring(0, 20)}...\`;
        container.appendChild(t);
        setTimeout(() => t.remove(), 4000);
    }

    function appendMsg(text, type) {
        const c = document.getElementById('messages-container');
        const d = document.createElement('div');
        d.className = 'msg ' + type;
        d.innerText = text;
        c.appendChild(d);
        c.scrollTop = c.scrollHeight;
    }
</script>
</body>
</html>
`);
});

// --- LOGIQUE SERVEUR ---
io.on("connection", (socket) => {
    socket.on('register', (d) => {
        const u = d.u.trim();
        const p = d.p.trim();
        if(u.length < 5 || containsSlur(u)) return socket.emit('auth-error', 'Pseudo invalide.');
        if(users.findOne({u: u})) return socket.emit('auth-error', 'Nom déjà pris.');
        users.insert({ u: u, p: p, friends: [] });
        loginOk(socket, u);
    });

    socket.on('login', (d) => {
        const u = users.findOne({ u: d.u, p: d.p });
        if(!u) return socket.emit('auth-error', 'Identifiants incorrects.');
        loginOk(socket, d.u);
    });

    function loginOk(socket, name) {
        activeUsers[socket.id] = name;
        userSockets[name] = socket.id;
        socket.emit('auth-success', name);
        refresh(socket);
    }

    // CHARGER LES MESSAGES ENREGISTRÉS
    socket.on('load-history', (friendName) => {
        const me = activeUsers[socket.id];
        const history = messages.find({
            $or: [
                { from: me, to: friendName },
                { from: friendName, to: me }
            ]
        }).sort((a, b) => a.meta.created - b.meta.created);
        socket.emit('history', history.map(m => ({ text: m.text, from: m.from })));
    });

    socket.on('request-friend', (target) => {
        if(target === activeUsers[socket.id]) return; // Sécurité serveur
        const sid = userSockets[target];
        if(sid) io.to(sid).emit('friend-request-received', activeUsers[socket.id]);
    });

    socket.on('respond-friend', (d) => {
        if(d.accept) {
            const me = users.findOne({ u: activeUsers[socket.id] });
            const them = users.findOne({ u: d.from });
            if(me && them && !me.friends.includes(d.from)) {
                me.friends.push(d.from); them.friends.push(me.u);
                users.update(me); users.update(them);
            }
            refresh(socket);
            if(userSockets[d.from]) refresh(io.sockets.sockets.get(userSockets[d.from]));
        }
    });

    socket.on('private-msg', (d) => {
        const me = activeUsers[socket.id];
        // Enregistrer le message
        messages.insert({ from: me, to: d.to, text: d.msg });
        
        const sid = userSockets[d.to];
        if(sid) io.to(sid).emit('msg-received', { from: me, msg: d.msg });
    });

    function refresh(s) {
        const u = users.findOne({ u: activeUsers[s.id] });
        if(u) s.emit('update-friends', u.friends.map(f => ({ name: f, online: !!userSockets[f] })));
    }

    socket.on('refresh-friends', () => refresh(socket));

    socket.on('disconnect', () => {
        const name = activeUsers[socket.id];
        delete userSockets[name]; delete activeUsers[socket.id];
        io.emit('refresh-global'); // Pour mettre à jour les points verts
    });
});

server.listen(process.env.PORT || 3000);
