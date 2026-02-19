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

// --- CONFIGURATION ANTI-SLUR (À compléter) ---
const BANNED_WORDS = ["insulte1", "insulte2", "slur3"]; 

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
    <title>Royal Messenger Pro</title>
    <link rel="icon" type="image/png" href="/logo.png">
    <style>
        :root { --gold: linear-gradient(135deg, #d4af37 0%, #f9f295 50%, #b38728 100%); --gold-s: #d4af37; --dark: #050505; --card: #121212; --text: #f1f1f1; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
        
        /* SIDEBAR */
        #sidebar { width: 320px; background: var(--card); border-right: 1px solid var(--gold-s); display: flex; flex-direction: column; z-index: 10; }
        .sidebar-header { padding: 25px; border-bottom: 1px solid rgba(212,175,55,0.2); }
        .friend-item { padding: 15px 25px; border-bottom: 1px solid #1a1a1a; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: 0.3s; }
        .friend-item:hover { background: rgba(212,175,55,0.05); }
        .friend-item.active { background: rgba(212,175,55,0.1); border-left: 4px solid var(--gold-s); }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #444; }
        .online { background: #22c55e; box-shadow: 0 0 8px #22c55e; }

        /* CHAT AREA */
        #chat-area { flex: 1; display: flex; flex-direction: column; position: relative; }
        #messages-container { flex: 1; overflow-y: auto; padding: 30px; display: flex; flex-direction: column; gap: 15px; }
        .msg { max-width: 65%; padding: 12px 18px; border-radius: 18px; font-size: 0.95rem; line-height: 1.4; position: relative; }
        .msg.sent { align-self: flex-end; background: var(--gold); color: black; border-bottom-right-radius: 4px; font-weight: 500; }
        .msg.received { align-self: flex-start; background: #222; border: 1px solid #333; border-bottom-left-radius: 4px; }

        /* NOTIFICATIONS (TOASTS) */
        #toast-container { position: fixed; bottom: 20px; right: 20px; z-index: 9999; }
        .toast { background: var(--card); border: 1px solid var(--gold-s); color: white; padding: 15px 20px; border-radius: 10px; margin-top: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); animation: slideIn 0.3s ease-out; cursor: pointer; }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

        /* AUTH MODALS */
        .auth-overlay { position: fixed; inset: 0; background: #000; z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .auth-box { background: var(--card); padding: 40px; border: 1px solid var(--gold-s); border-radius: 20px; text-align: center; width: 350px; }
        
        /* VOICE CALL UI */
        #voice-call-ui { position: absolute; top: 20px; right: 20px; background: rgba(18, 18, 18, 0.95); border: 2px solid var(--gold-s); padding: 20px; border-radius: 15px; text-align: center; width: 200px; display: none; z-index: 500; }
        .pulse { width: 60px; height: 60px; background: var(--gold); border-radius: 50%; margin: 10px auto; animation: pulse-gold 2s infinite; display: flex; align-items: center; justify-content: center; color: black; font-size: 24px; }
        @keyframes pulse-gold { 0% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.7); } 70% { box-shadow: 0 0 0 20px rgba(212, 175, 55, 0); } 100% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0); } }

        input { padding: 12px; background: #1a1a1a; border: 1px solid #333; color: white; border-radius: 8px; width: 80%; outline: none; margin-bottom: 10px; }
        button { padding: 12px 20px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .btn-gold { background: var(--gold); color: black; }
        .btn-gold:hover { opacity: 0.9; transform: translateY(-1px); }
        .hidden { display: none !important; }
    </style>
</head>
<body>

<div id="login-overlay" class="auth-overlay">
    <div class="auth-box">
        <h2 style="color:var(--gold-s)">CONNEXION ROYALE</h2>
        <input id="login-u" placeholder="Utilisateur">
        <input id="login-p" type="password" placeholder="Mot de passe">
        <button class="btn-gold" style="width:100%" onclick="auth('login')">ENTRER</button>
        <p style="font-size:0.8rem; margin-top:20px;">Pas encore de titre ? <a href="#" onclick="switchAuth('register')" style="color:var(--gold-s)">Créer un compte</a></p>
    </div>
</div>

<div id="register-overlay" class="auth-overlay hidden">
    <div class="auth-box">
        <h2 style="color:var(--gold-s)">REJOINDRE LE PALAIS</h2>
        <p style="font-size:0.7rem; opacity:0.6; margin-bottom:15px;">5 lettres min. / Pas de langage grossier</p>
        <input id="reg-u" placeholder="Nom d'utilisateur">
        <input id="reg-p" type="password" placeholder="Mot de passe">
        <button class="btn-gold" style="width:100%" onclick="auth('register')">S'INSCRIRE</button>
        <p style="font-size:0.8rem; margin-top:20px;">Déjà noble ? <a href="#" onclick="switchAuth('login')" style="color:var(--gold-s)">Se connecter</a></p>
    </div>
</div>

<div id="invite-box" style="position:fixed; top:20px; left:50%; transform:translateX(-50%); background:var(--card); border:2px solid var(--gold-s); padding:20px; border-radius:12px; z-index:3000;" class="hidden">
    <span id="invite-text"></span>
    <div style="margin-top:10px; display:flex; gap:10px; justify-content:center;">
        <button class="btn-gold" onclick="respondInvite(true)">ACCEPTER</button>
        <button style="background:#444; color:white" onclick="respondInvite(false)">REFUSER</button>
    </div>
</div>

<div id="sidebar">
    <div class="sidebar-header">
        <h3 style="color:var(--gold-s); margin:0 0 15px 0">🔱 MESSAGERIE</h3>
        <div style="display:flex; gap:5px">
            <input id="add-friend-input" placeholder="Ajouter un noble..." style="flex:1; margin:0; font-size:0.8rem; padding:8px;">
            <button class="btn-gold" onclick="addFriend()">+</button>
        </div>
    </div>
    <div id="friends-list"></div>
</div>

<div id="chat-area">
    <div id="voice-call-ui">
        <div class="pulse">🎤</div>
        <p id="call-status" style="font-weight:bold; color:var(--gold-s)">En appel...</p>
        <button onclick="endCall()" style="background:#ff4444; color:white; width:100%">RACROCHER</button>
    </div>

    <div id="chat-header" style="padding:20px; background:var(--card); border-bottom:1px solid #222; display:flex; justify-content:space-between; align-items:center;" class="hidden">
        <h3 id="chat-name" style="margin:0"></h3>
        <button class="btn-gold" onclick="startCall()">📞 APPEL VOCAL</button>
    </div>

    <div id="messages-container">
        <div style="margin:auto; opacity:0.2; text-align:center">Sélectionnez un noble pour discuter</div>
    </div>

    <div id="input-area" style="padding:25px; display:flex; gap:12px; background:rgba(0,0,0,0.2)" class="hidden">
        <input id="chat-input" placeholder="Envoyer un message privé..." style="flex:1; margin:0" onkeypress="if(event.key==='Enter') sendMsg()">
        <button class="btn-gold" onclick="sendMsg()">ENVOYER</button>
    </div>
</div>

<div id="toast-container"></div>
<audio id="remoteAudio" autoplay></audio>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    let myName = "", activeChat = null, currentInviteFrom = null;
    let localStream, pc;
    const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    function switchAuth(target) {
        document.getElementById('login-overlay').classList.add('hidden');
        document.getElementById('register-overlay').classList.add('hidden');
        document.getElementById(target + '-overlay').classList.remove('hidden');
    }

    function auth(type) {
        const prefix = type === 'login' ? 'login-' : 'reg-';
        const u = document.getElementById(prefix + 'u').value.trim();
        const p = document.getElementById(prefix + 'p').value.trim();
        if(u.length < 5 || p.length < 5) return alert("Minimum 5 caractères requis.");
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
        if(name) socket.emit('request-friend', name);
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
                socket.emit('refresh-friends');
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
        t.innerHTML = \`<b>🔱 \${from}:</b> \${msg.substring(0, 30)}\${msg.length > 30 ? '...' : ''}\`;
        t.onclick = () => { t.remove(); /* Optionnel: ouvrir le chat */ };
        container.appendChild(t);
        setTimeout(() => t.remove(), 5000);
    }

    function appendMsg(text, type) {
        const c = document.getElementById('messages-container');
        const d = document.createElement('div');
        d.className = 'msg ' + type;
        d.innerText = text;
        c.appendChild(d);
        c.scrollTop = c.scrollHeight;
    }

    // --- LOGIQUE APPEL VOCAL (AUDIO UNIQUEMENT) ---
    async function startCall() {
        document.getElementById('voice-call-ui').style.display = 'block';
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        pc = new RTCPeerConnection(rtcConfig);
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        
        pc.onicecandidate = e => e.candidate && socket.emit('call-ice', { to: activeChat, candidate: e.candidate });
        pc.ontrack = e => document.getElementById('remoteAudio').srcObject = e.streams[0];
        
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call-offer', { to: activeChat, offer });
    }

    socket.on('incoming-call', async (data) => {
        if(!confirm("Appel vocal entrant de " + data.from)) return;
        document.getElementById('voice-call-ui').style.display = 'block';
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        pc = new RTCPeerConnection(rtcConfig);
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        
        pc.onicecandidate = e => e.candidate && socket.emit('call-ice', { to: data.from, candidate: e.candidate });
        pc.ontrack = e => document.getElementById('remoteAudio').srcObject = e.streams[0];
        
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call-answer', { to: data.from, answer });
    });

    socket.on('call-answer', d => pc.setRemoteDescription(new RTCSessionDescription(d.answer)));
    socket.on('call-ice', d => pc.addIceCandidate(new RTCIceCandidate(d.candidate)));
    socket.on('call-ended', () => endCall(false));

    function endCall(notify = true) {
        if(pc) pc.close();
        if(localStream) localStream.getTracks().forEach(t => t.stop());
        document.getElementById('voice-call-ui').style.display = 'none';
        if(notify && activeChat) socket.emit('end-call', { to: activeChat });
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
        if(u.length < 5 || p.length < 5) return socket.emit('auth-error', 'Minimum 5 caractères.');
        if(containsSlur(u)) return socket.emit('auth-error', 'Pseudo interdit.');
        if(users.findOne({u: u})) return socket.emit('auth-error', 'Nom pris.');
        
        users.insert({ u: u, p: p, friends: [] });
        loginOk(socket, u);
    });

    socket.on('login', (d) => {
        const u = users.findOne({ u: d.u, p: d.p });
        if(!u) return socket.emit('auth-error', 'Erreur identifiants.');
        loginOk(socket, d.u);
    });

    function loginOk(socket, name) {
        activeUsers[socket.id] = name;
        userSockets[name] = socket.id;
        socket.emit('auth-success', name);
        refresh(socket);
        io.emit('refresh-global');
    }

    socket.on('request-friend', (target) => {
        const sid = userSockets[target];
        if(!sid) return socket.emit('auth-error', 'Citoyen non trouvé.');
        io.to(sid).emit('friend-request-received', activeUsers[socket.id]);
    });

    socket.on('respond-friend', (d) => {
        if(d.accept) {
            const me = users.findOne({ u: activeUsers[socket.id] });
            const them = users.findOne({ u: d.from });
            if(me && them && !me.friends.includes(d.from)) {
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

    socket.on('call-offer', d => io.to(userSockets[d.to]).emit('incoming-call', { from: activeUsers[socket.id], offer: d.offer }));
    socket.on('call-answer', d => io.to(userSockets[d.to]).emit('call-answer', { answer: d.answer }));
    socket.on('call-ice', d => io.to(userSockets[d.to]).emit('call-ice', { candidate: d.candidate }));
    socket.on('end-call', d => io.to(userSockets[d.to]).emit('call-ended'));

    function refresh(s) {
        const u = users.findOne({ u: activeUsers[s.id] });
        if(u) s.emit('update-friends', u.friends.map(f => ({ name: f, online: !!userSockets[f] })));
    }

    socket.on('refresh-friends', () => refresh(socket));
    socket.on('refresh-global', () => io.sockets.sockets.forEach(s => refresh(s)));

    socket.on('disconnect', () => {
        const name = activeUsers[socket.id];
        delete userSockets[name]; delete activeUsers[socket.id];
        io.emit('refresh-global');
    });
});

server.listen(process.env.PORT || 3000);
