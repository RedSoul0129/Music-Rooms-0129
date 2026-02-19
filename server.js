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
let messages = db.getCollection("messages") || db.addCollection("messages");

const activeUsers = {}; // socket.id -> username
const userSockets = {}; // username -> socket.id

app.get("/logo.png", (req, res) => res.sendFile(path.join(__dirname, "logo.png")));

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Royal Messenger - Final Edition</title>
    <style>
        :root { --gold: linear-gradient(135deg, #d4af37 0%, #f9f295 50%, #b38728 100%); --gold-s: #d4af37; --dark: #050505; --card: #121212; --text: #f1f1f1; }
        body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
        
        /* SIDEBAR */
        #sidebar { width: 320px; background: var(--card); border-right: 1px solid var(--gold-s); display: flex; flex-direction: column; }
        .sidebar-header { padding: 25px; border-bottom: 1px solid rgba(212,175,55,0.2); }
        .friend-item { padding: 15px 25px; border-bottom: 1px solid #1a1a1a; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: 0.2s; }
        .friend-item.active { background: rgba(212,175,55,0.1); border-left: 4px solid var(--gold-s); }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #444; }
        .online { background: #22c55e; box-shadow: 0 0 8px #22c55e; }

        /* ZONE CENTRALE (CHAT) */
        #chat-area { flex: 1; display: flex; flex-direction: column; border-right: 1px solid #222; }
        #messages-container { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 65%; padding: 12px; border-radius: 12px; font-size: 0.9rem; }
        .msg.sent { align-self: flex-end; background: var(--gold); color: black; border-bottom-right-radius: 2px; }
        .msg.received { align-self: flex-start; background: #222; border: 1px solid #333; border-bottom-left-radius: 2px; }

        /* ESPACE FUTURS AJOUTS (DROITE) */
        #future-expansion { width: 200px; background: #0a0a0a; display: flex; flex-direction: column; padding: 15px; border-left: 1px solid rgba(212,175,55,0.1); }
        .expansion-slot { border: 1px dashed #333; height: 100px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #333; font-size: 0.7rem; margin-bottom: 15px; }

        /* CALL BAR */
        #call-bar { background: #1a1a1a; border-bottom: 2px solid var(--gold-s); padding: 10px; display: none; align-items: center; gap: 10px; justify-content: center; }
        .call-btn { padding: 5px 12px; border-radius: 4px; cursor: pointer; border: 1px solid var(--gold-s); font-weight: bold; background: transparent; color: var(--gold-s); }
        select { background: #222; color: white; border: 1px solid var(--gold-s); padding: 5px; font-size: 0.8rem; }

        .auth-overlay { position: fixed; inset: 0; background: #000; z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .auth-box { background: var(--card); padding: 40px; border: 1px solid var(--gold-s); border-radius: 20px; text-align: center; width: 320px; }
        input { padding: 12px; background: #1a1a1a; border: 1px solid #333; color: white; border-radius: 8px; width: 85%; margin-bottom: 10px; outline: none; }
        button { padding: 10px 20px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; transition: 0.3s; }
        .btn-gold { background: var(--gold); color: black; }
        .hidden { display: none !important; }
    </style>
</head>
<body>

<div id="login-overlay" class="auth-overlay">
    <div class="auth-box">
        <h2 style="color:var(--gold-s)">PALAIS ROYAL</h2>
        <input id="login-u" placeholder="Utilisateur">
        <input id="login-p" type="password" placeholder="Mot de passe">
        <button class="btn-gold" style="width:100%" onclick="auth('login')">SE CONNECTER</button>
        <p style="font-size:0.8rem; margin-top:20px;">Nouveau ? <a href="#" onclick="switchAuth('register')" style="color:var(--gold-s)">S'inscrire</a></p>
    </div>
</div>

<div id="register-overlay" class="auth-overlay hidden">
    <div class="auth-box">
        <h2 style="color:var(--gold-s)">INSCRIPTION</h2>
        <input id="reg-u" placeholder="Utilisateur">
        <input id="reg-p" type="password" placeholder="Mot de passe">
        <button class="btn-gold" style="width:100%" onclick="auth('register')">CRÉER COMPTE</button>
        <p style="font-size:0.8rem; margin-top:20px;">Déjà inscrit ? <a href="#" onclick="switchAuth('login')" style="color:var(--gold-s)">Se connecter</a></p>
    </div>
</div>

<div id="sidebar">
    <div class="sidebar-header">
        <h3 style="color:var(--gold-s); margin:0 0 10px 0">🔱 NOBLESSE</h3>
        <div style="display:flex; gap:5px"><input id="add-f" placeholder="Chercher..." style="flex:1; padding:5px"><button class="btn-gold" onclick="addFriend()">+</button></div>
    </div>
    <div id="friends-list"></div>
</div>

<div id="chat-area">
    <div id="call-bar">
        <span style="font-size:0.8rem">🎙️ AUDIO</span>
        <button id="mute-btn" class="call-btn" onclick="toggleMute()">MUTER</button>
        <select id="audio-input-select" onchange="changeAudioInput()"></select>
        <button class="call-btn" style="color:#ff4444; border-color:#ff4444" onclick="endCall()">X</button>
    </div>

    <div id="chat-header" style="padding:15px; border-bottom:1px solid #222; display:flex; justify-content:space-between; align-items:center;" class="hidden">
        <h3 id="chat-name" style="margin:0"></h3>
        <button class="btn-gold" onclick="startCall()">📞 APPEL</button>
    </div>

    <div id="messages-container"></div>
    
    <div id="input-area" style="padding:20px; display:flex; gap:10px;" class="hidden">
        <input id="chat-input" placeholder="Message..." style="flex:1" onkeypress="if(event.key==='Enter') sendMsg()">
        <button class="btn-gold" onclick="sendMsg()">➤</button>
    </div>
</div>

<div id="future-expansion">
    <h4 style="color:var(--gold-s); font-size:0.7rem; text-align:center; border-bottom:1px solid #222; padding-bottom:10px;">EXPANSION</h4>
    <div class="expansion-slot">EMPLACEMENT 1</div>
    <div class="expansion-slot">EMPLACEMENT 2</div>
    <div class="expansion-slot">EMPLACEMENT 3</div>
    <p style="font-size:0.6rem; color:#444; text-align:center;">Prêt pour futurs ajouts</p>
</div>

<audio id="remoteAudio" autoplay></audio>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    let myName = "", activeChat = null;
    let localStream, pc, isMuted = false;
    const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    function switchAuth(t) {
        document.getElementById('login-overlay').classList.add('hidden');
        document.getElementById('register-overlay').classList.add('hidden');
        document.getElementById(t + '-overlay').classList.remove('hidden');
    }

    function auth(type) {
        const p = type === 'login' ? 'login-' : 'reg-';
        socket.emit(type, { u: document.getElementById(p+'u').value, p: document.getElementById(p+'p').value });
    }

    socket.on('auth-success', (n) => { myName = n; document.querySelectorAll('.auth-overlay').forEach(e=>e.remove()); });
    socket.on('auth-error', (m) => alert(m));

    function addFriend() {
        const n = document.getElementById('add-f').value.trim();
        if(n && n !== myName) socket.emit('request-friend', n);
        document.getElementById('add-f').value = '';
    }

    socket.on('friend-request-received', (f) => {
        if(confirm("L'utilisateur " + f + " souhaite vous ajouter.")) socket.emit('respond-friend', { from: f, accept: true });
    });

    socket.on('update-friends', (fs) => {
        const l = document.getElementById('friends-list'); l.innerHTML = '';
        fs.forEach(f => {
            const d = document.createElement('div');
            d.className = 'friend-item' + (activeChat === f.name ? ' active' : '');
            d.innerHTML = \`<div class="status-dot \${f.online ? 'online' : ''}"></div> \${f.name}\`;
            d.onclick = () => {
                activeChat = f.name;
                document.getElementById('chat-header').classList.remove('hidden');
                document.getElementById('input-area').classList.remove('hidden');
                document.getElementById('chat-name').innerText = f.name;
                socket.emit('load-history', f.name);
                socket.emit('refresh-friends');
            };
            l.appendChild(d);
        });
    });

    socket.on('history', (ms) => {
        const c = document.getElementById('messages-container'); c.innerHTML = '';
        ms.forEach(m => appendMsg(m.text, m.from === myName ? 'sent' : 'received'));
    });

    function sendMsg() {
        const i = document.getElementById('chat-input');
        if(i.value && activeChat) { socket.emit('private-msg', { to: activeChat, msg: i.value }); appendMsg(i.value, 'sent'); i.value = ''; }
    }

    socket.on('msg-received', (d) => { if(activeChat === d.from) appendMsg(d.msg, 'received'); });

    function appendMsg(t, type) {
        const c = document.getElementById('messages-container');
        const d = document.createElement('div'); d.className = 'msg ' + type; d.innerText = t;
        c.appendChild(d); c.scrollTop = c.scrollHeight;
    }

    // VOICE LOGIC
    async function getDevices() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const select = document.getElementById('audio-input-select');
        select.innerHTML = '';
        devices.filter(d => d.kind === 'audioinput').forEach(d => {
            const opt = document.createElement('option'); opt.value = d.deviceId; opt.text = d.label || 'Microphone';
            select.appendChild(opt);
        });
    }

    async function changeAudioInput() {
        const deviceId = document.getElementById('audio-input-select').value;
        localStream.getTracks().forEach(t => t.stop());
        localStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
        const sender = pc.getSenders().find(s => s.track.kind === 'audio');
        sender.replaceTrack(localStream.getAudioTracks()[0]);
    }

    function toggleMute() {
        isMuted = !isMuted;
        localStream.getAudioTracks()[0].enabled = !isMuted;
        document.getElementById('mute-btn').innerText = isMuted ? "UNMUTE" : "MUTER";
    }

    async function startCall() {
        document.getElementById('call-bar').style.display = 'flex';
        await getDevices();
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
        if(!confirm("Appel de " + data.from)) return;
        document.getElementById('call-bar').style.display = 'flex';
        await getDevices();
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
        document.getElementById('call-bar').style.display = 'none';
        if(notify && activeChat) socket.emit('end-call', { to: activeChat });
    }
</script>
</body>
</html>
`);
});

// --- LOGIQUE SERVEUR (DÉCONNEXION OPTIMISÉE) ---
io.on("connection", (socket) => {
    socket.on('register', (d) => {
        if(d.u.length < 5 || users.findOne({u: d.u})) return socket.emit('auth-error', 'Identifiant invalide.');
        users.insert({ u: d.u, p: d.p, friends: [] });
        loginOk(socket, d.u);
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
        io.emit('refresh-global');
    }

    socket.on('load-history', (fn) => {
        const me = activeUsers[socket.id];
        const h = messages.find({ $or: [{from:me, to:fn}, {from:fn, to:me}] }).sort((a,b)=>a.meta.created-b.meta.created);
        socket.emit('history', h.map(m=>({text:m.text, from:m.from})));
    });

    socket.on('request-friend', (t) => {
        const sid = userSockets[t];
        if(sid) io.to(sid).emit('friend-request-received', activeUsers[socket.id]);
    });

    socket.on('respond-friend', (d) => {
        if(d.accept) {
            const me = users.findOne({u:activeUsers[socket.id]}), them = users.findOne({u:d.from});
            if(me && !me.friends.includes(d.from)) { 
                me.friends.push(d.from); them.friends.push(me.u); 
                users.update(me); users.update(them); 
            }
            refresh(socket); if(userSockets[d.from]) refresh(io.sockets.sockets.get(userSockets[d.from]));
        }
    });

    socket.on('private-msg', (d) => {
        const me = activeUsers[socket.id];
        messages.insert({ from: me, to: d.to, text: d.msg });
        if(userSockets[d.to]) io.to(userSockets[d.to]).emit('msg-received', { from: me, msg: d.msg });
    });

    socket.on('call-offer', d => io.to(userSockets[d.to]).emit('incoming-call', { from: activeUsers[socket.id], offer: d.offer }));
    socket.on('call-answer', d => io.to(userSockets[d.to]).emit('call-answer', { answer: d.answer }));
    socket.on('call-ice', d => io.to(userSockets[d.to]).emit('call-ice', { candidate: d.candidate }));
    socket.on('end-call', d => io.to(userSockets[d.to]).emit('call-ended'));

    function refresh(s) {
        const u = users.findOne({u:activeUsers[s.id]});
        if(u) s.emit('update-friends', u.friends.map(f=>({name:f, online:!!userSockets[f]})));
    }

    socket.on('refresh-friends', () => refresh(socket));

    // --- LE CŒUR DE LA DÉCONNEXION INSTANTANÉE ---
    socket.on('disconnect', () => {
        const username = activeUsers[socket.id];
        if (username) {
            console.log(username + " a quitté le palais.");
            delete userSockets[username];
            delete activeUsers[socket.id];
            // On prévient tout le monde immédiatement pour mettre les points en gris
            io.emit('refresh-global');
        }
    });

    socket.on('refresh-global', () => {
        io.sockets.sockets.forEach(s => refresh(s));
    });
});

server.listen(process.env.PORT || 3000);
