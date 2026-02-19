const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const loki = require("lokijs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- BASE DE DONNÉES ---
const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");
const activeUsers = {}; 
const userSockets = {}; 

// --- CONFIGURATION ANTI-SLUR ---
const BANNED_WORDS = ["insulte1", "insulte2", "mauvaismot"]; // À compléter selon tes besoins

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
    <title>Royal Secure Messenger</title>
    <link rel="icon" type="image/png" href="/logo.png">
    <style>
        :root { --gold: linear-gradient(135deg, #d4af37 0%, #f9f295 50%, #b38728 100%); --gold-s: #d4af37; --dark: #050505; --card: #121212; --text: #f1f1f1; }
        body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; }
        
        #sidebar { width: 300px; background: var(--card); border-right: 1px solid var(--gold-s); display: flex; flex-direction: column; }
        .sidebar-header { padding: 20px; border-bottom: 1px solid rgba(212,175,55,0.2); }
        .friend-item { padding: 15px; border-bottom: 1px solid #222; cursor: pointer; display: flex; align-items: center; gap: 10px; }
        .friend-item:hover { background: rgba(212,175,55,0.1); }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #444; }
        .online { background: #22c55e; box-shadow: 0 0 8px #22c55e; }

        /* NOTIFICATION D'INVITATION */
        #notif-box { position: fixed; bottom: 20px; left: 20px; background: var(--card); border: 2px solid var(--gold-s); padding: 20px; border-radius: 10px; z-index: 2000; box-shadow: 0 0 30px rgba(0,0,0,0.8); }
        
        #chat-area { flex: 1; display: flex; flex-direction: column; }
        #messages-container { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 70%; padding: 10px 15px; border-radius: 12px; }
        .msg.sent { align-self: flex-end; background: var(--gold); color: black; }
        .msg.received { align-self: flex-start; background: #222; }

        #auth-overlay { position: fixed; inset: 0; background: #000; z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .auth-box { background: var(--card); padding: 40px; border: 1px solid var(--gold-s); border-radius: 20px; text-align: center; }
        input { padding: 10px; background: #1a1a1a; border: 1px solid #333; color: white; border-radius: 8px; }
        button { padding: 10px 15px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; }
        .btn-gold { background: var(--gold); color: black; }
        .hidden { display: none !important; }
    </style>
</head>
<body>

<div id="auth-overlay">
    <div class="auth-box">
        <h2 style="color:var(--gold-s)">SÉCURITÉ ROYALE</h2>
        <p style="font-size:0.8rem; opacity:0.6">Minimum 5 caractères / Pas d'insultes</p>
        <input id="u" placeholder="Utilisateur"><br><br>
        <input id="p" type="password" placeholder="Mot de passe"><br><br>
        <button class="btn-gold" onclick="auth('login')">CONNEXION</button>
        <button style="background:transparent; color:white; border:1px solid #444" onclick="auth('register')">S'INSCRIRE</button>
    </div>
</div>

<div id="notif-box" class="hidden">
    <p id="notif-text" style="margin:0 0 15px 0"></p>
    <button class="btn-gold" onclick="respondInvite(true)">ACCEPTER</button>
    <button style="background:#444; color:white" onclick="respondInvite(false)">DÉCLINER</button>
</div>

<div id="sidebar">
    <div class="sidebar-header">
        <h3 style="color:var(--gold-s)">🔱 AMIS</h3>
        <div style="display:flex; gap:5px">
            <input id="add-friend-name" placeholder="Rechercher noble..." style="flex:1">
            <button class="btn-gold" onclick="addFriend()">+</button>
        </div>
    </div>
    <div id="friends-list"></div>
</div>

<div id="chat-area">
    <div id="messages-container"></div>
    <div id="input-area" style="padding:20px; display:flex; gap:10px" class="hidden">
        <input id="chat-input" placeholder="Message privé..." style="flex:1" onkeypress="if(event.key==='Enter') sendMsg()">
        <button class="btn-gold" onclick="sendMsg()">ENVOYER</button>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    let myName = "", activeChat = null, currentInviteFrom = null;

    function auth(type) {
        const u = document.getElementById('u').value.trim();
        const p = document.getElementById('p').value.trim();
        if(u.length < 5 || p.length < 5) return alert("Le nom et le mot de passe doivent faire au moins 5 lettres.");
        socket.emit(type, { u, p });
    }

    socket.on('auth-success', (name) => {
        myName = name;
        document.getElementById('auth-overlay').remove();
    });

    socket.on('auth-error', (msg) => alert(msg));

    function addFriend() {
        const name = document.getElementById('add-friend-name').value.trim();
        if(name) socket.emit('request-friend', name);
    }

    // RÉCEPTION D'UNE INVITATION
    socket.on('friend-request-received', (from) => {
        currentInviteFrom = from;
        document.getElementById('notif-text').innerText = "👑 " + from + " souhaite rejoindre votre cercle d'amis.";
        document.getElementById('notif-box').classList.remove('hidden');
    });

    function respondInvite(accept) {
        socket.emit('respond-friend', { from: currentInviteFrom, accept });
        document.getElementById('notif-box').classList.add('hidden');
    }

    socket.on('update-friends', (friends) => {
        const list = document.getElementById('friends-list');
        list.innerHTML = '';
        friends.forEach(f => {
            const div = document.createElement('div');
            div.className = 'friend-item';
            div.innerHTML = '<div class="status-dot ' + (f.online ? 'online' : '') + '"></div>' + f.name;
            div.onclick = () => {
                activeChat = f.name;
                document.getElementById('input-area').classList.remove('hidden');
                document.getElementById('messages-container').innerHTML = '<p style="text-align:center; opacity:0.3">Conversation avec ' + f.name + '</p>';
            };
            list.appendChild(div);
        });
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
        if(activeChat === data.from) appendMsg(data.msg, 'received');
    });

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

// --- SERVEUR ---
io.on("connection", (socket) => {
    socket.on('register', (d) => {
        const u = d.u.trim();
        const p = d.p.trim();
        if(u.length < 5 || p.length < 5) return socket.emit('auth-error', 'Minimum 5 caractères requis.');
        if(containsSlur(u)) return socket.emit('auth-error', 'Ce nom contient un mot interdit.');
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

    socket.on('request-friend', (targetName) => {
        const targetSid = userSockets[targetName];
        if(!targetSid) return socket.emit('auth-error', 'Utilisateur hors-ligne ou inexistant.');
        io.to(targetSid).emit('friend-request-received', activeUsers[socket.id]);
    });

    socket.on('respond-friend', (d) => {
        if(d.accept) {
            const me = users.findOne({ u: activeUsers[socket.id] });
            const them = users.findOne({ u: d.from });
            if(!me.friends.includes(d.from)) {
                me.friends.push(d.from);
                them.friends.push(me.u);
                users.update(me); users.update(them);
            }
            refresh(socket);
            if(userSockets[d.from]) refresh(io.sockets.sockets.get(userSockets[d.from]));
        }
    });

    socket.on('private-msg', (d) => {
        const sid = userSockets[d.to];
        if(sid) io.to(sid).emit('msg-received', { from: activeUsers[socket.id], msg: d.msg });
    });

    function refresh(s) {
        const u = users.findOne({ u: activeUsers[s.id] });
        if(u) s.emit('update-friends', u.friends.map(f => ({ name: f, online: !!userSockets[f] })));
    }

    socket.on('disconnect', () => {
        const name = activeUsers[socket.id];
        delete userSockets[name]; delete activeUsers[socket.id];
        io.emit('refresh-global');
    });
});

server.listen(process.env.PORT || 3000);
