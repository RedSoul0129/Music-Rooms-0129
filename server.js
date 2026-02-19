const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const loki = require("lokijs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");
const activeUsers = {}; // socket.id -> username
const userSockets = {}; // username -> socket.id

app.get("/logo.png", (req, res) => res.sendFile(path.join(__dirname, "logo.png")));

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Royal Messenger</title>
    <link rel="icon" type="image/png" href="/logo.png">
    <style>
        :root { --gold: linear-gradient(135deg, #d4af37 0%, #f9f295 50%, #b38728 100%); --gold-s: #d4af37; --dark: #050505; --card: #121212; --text: #f1f1f1; }
        body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; }
        
        /* SIDEBAR */
        #sidebar { width: 300px; background: var(--card); border-right: 1px solid var(--gold-s); display: flex; flex-direction: column; }
        .sidebar-header { padding: 20px; border-bottom: 1px solid rgba(212,175,55,0.2); }
        .friend-item { padding: 15px; border-bottom: 1px solid #222; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.2s; }
        .friend-item:hover { background: rgba(212,175,55,0.05); }
        .friend-item.active { background: rgba(212,175,55,0.15); border-left: 4px solid var(--gold-s); }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #444; }
        .online { background: #22c55e; box-shadow: 0 0 8px #22c55e; }

        /* CHAT INTERFACE */
        #chat-area { flex: 1; display: flex; flex-direction: column; background: radial-gradient(circle at center, #111 0%, #050505 100%); }
        #chat-header { padding: 15px 25px; background: var(--card); border-bottom: 1px solid var(--gold-s); display: flex; align-items: center; justify-content: space-between; }
        #messages-container { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 70%; padding: 10px 15px; border-radius: 15px; font-size: 0.9rem; }
        .msg.sent { align-self: flex-end; background: var(--gold); color: black; border-bottom-right-radius: 2px; }
        .msg.received { align-self: flex-start; background: #222; color: white; border-bottom-left-radius: 2px; border: 1px solid #444; }

        /* VIDEO CALL AREA */
        #video-call-overlay { position: absolute; top: 70px; right: 20px; width: 320px; display: flex; flex-direction: column; gap: 10px; z-index: 100; }
        .video-box { width: 100%; aspect-ratio: 16/9; background: #000; border: 1px solid var(--gold-s); border-radius: 10px; overflow: hidden; position: relative; }
        video { width: 100%; height: 100%; object-fit: cover; }

        /* AUTH & INPUTS */
        #auth-overlay { position: fixed; inset: 0; background: #000; z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .auth-box { background: var(--card); padding: 40px; border: 1px solid var(--gold-s); border-radius: 20px; text-align: center; }
        input { padding: 10px; background: #1a1a1a; border: 1px solid #333; color: white; border-radius: 8px; outline: none; }
        button { padding: 10px 15px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; transition: 0.3s; }
        .btn-gold { background: var(--gold); color: black; }
        .hidden { display: none !important; }
    </style>
</head>
<body>

<div id="auth-overlay">
    <div class="auth-box">
        <img src="/logo.png" style="width:80px; margin-bottom:10px;">
        <h2 style="color:var(--gold-s)">PALAIS ROYAL</h2>
        <input id="u" placeholder="Utilisateur"><br><br>
        <input id="p" type="password" placeholder="Mot de passe"><br><br>
        <button class="btn-gold" onclick="auth('login')">CONNEXION</button>
        <button style="background:transparent; color:white; border:1px solid #444" onclick="auth('register')">S'INSCRIRE</button>
    </div>
</div>

<div id="sidebar">
    <div class="sidebar-header">
        <h3 style="color:var(--gold-s); margin:0 0 15px 0">🔱 MESSAGERIE</h3>
        <div style="display:flex; gap:5px">
            <input id="add-friend-name" placeholder="Nom de l'ami..." style="flex:1; font-size:0.8rem">
            <button class="btn-gold" onclick="addFriend()">+</button>
        </div>
    </div>
    <div id="friends-list"></div>
</div>

<div id="chat-area">
    <div id="chat-header" class="hidden">
        <div style="display:flex; align-items:center; gap:10px">
            <div id="chat-status" class="status-dot"></div>
            <h3 id="chat-with-name" style="margin:0">Ami</h3>
        </div>
        <button class="btn-gold" onclick="startCall()">📞 APPEL ROYAL</button>
    </div>
    
    <div id="messages-container">
        <div style="margin:auto; opacity:0.3; text-align:center">Sélectionnez un noble pour discuter</div>
    </div>

    <div id="video-call-overlay" class="hidden">
        <div class="video-box"><video id="localVideo" autoplay muted playsinline></video></div>
        <div class="video-box"><video id="remoteVideo" autoplay playsinline></video></div>
        <button onclick="endCall()" style="background:#ff4444; color:white">RACROCHER</button>
    </div>

    <div id="input-area" style="padding:20px; display:flex; gap:10px" class="hidden">
        <input id="chat-input" placeholder="Écrivez ici..." style="flex:1" onkeypress="if(event.key==='Enter') sendMsg()">
        <button class="btn-gold" onclick="sendMsg()">ENVOYER</button>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    let myName = "", activeChat = null;
    let localStream, pc;
    const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    function auth(type) {
        const u = document.getElementById('u').value;
        const p = document.getElementById('p').value;
        socket.emit(type, { u, p });
    }

    socket.on('auth-success', (name) => {
        myName = name;
        document.getElementById('auth-overlay').remove();
    });

    function addFriend() {
        const name = document.getElementById('add-friend-name').value;
        if(name === myName) return alert("Vous êtes déjà votre propre ami.");
        socket.emit('add-friend', name);
    }

    socket.on('update-friends', (friends) => {
        const list = document.getElementById('friends-list');
        list.innerHTML = '';
        friends.forEach(f => {
            const div = document.createElement('div');
            div.className = 'friend-item' + (activeChat === f.name ? ' active' : '');
            div.innerHTML = \`<div class="status-dot \${f.online ? 'online' : ''}"></div> <span>\${f.name}</span>\`;
            div.onclick = () => openChat(f.name);
            list.appendChild(div);
        });
    });

    function openChat(name) {
        activeChat = name;
        document.getElementById('chat-header').classList.remove('hidden');
        document.getElementById('input-area').classList.remove('hidden');
        document.getElementById('chat-with-name').innerText = name;
        document.getElementById('messages-container').innerHTML = '';
        socket.emit('get-messages', name);
        // Refresh sidebar for active class
        socket.emit('refresh-friends');
    }

    function sendMsg() {
        const inp = document.getElementById('chat-input');
        if(!inp.value.trim()) return;
        socket.emit('private-msg', { to: activeChat, msg: inp.value });
        appendMsg(inp.value, 'sent');
        inp.value = '';
    }

    socket.on('msg-received', (data) => {
        if(activeChat === data.from) appendMsg(data.msg, 'received');
    });

    function appendMsg(text, type) {
        const container = document.getElementById('messages-container');
        const div = document.createElement('div');
        div.className = 'msg ' + type;
        div.innerText = text;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    // --- LOGIQUE APPEL VIDEO ---
    async function startCall() {
        document.getElementById('video-call-overlay').classList.remove('hidden');
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('localVideo').srcObject = localStream;
        
        pc = new RTCPeerConnection(rtcConfig);
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        
        pc.onicecandidate = e => e.candidate && socket.emit('call-ice', { to: activeChat, candidate: e.candidate });
        pc.ontrack = e => document.getElementById('remoteVideo').srcObject = e.streams[0];
        
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call-offer', { to: activeChat, offer });
    }

    socket.on('incoming-call', async (data) => {
        if(!confirm("Appel entrant de " + data.from + ". Répondre ?")) return;
        activeChat = data.from;
        openChat(data.from);
        document.getElementById('video-call-overlay').classList.remove('hidden');
        
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('localVideo').srcObject = localStream;
        
        pc = new RTCPeerConnection(rtcConfig);
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        
        pc.onicecandidate = e => e.candidate && socket.emit('call-ice', { to: data.from, candidate: e.candidate });
        pc.ontrack = e => document.getElementById('remoteVideo').srcObject = e.streams[0];
        
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call-answer', { to: data.from, answer });
    });

    socket.on('call-answer', d => pc.setRemoteDescription(new RTCSessionDescription(d.answer)));
    socket.on('call-ice', d => pc.addIceCandidate(new RTCIceCandidate(d.candidate)));

    function endCall() {
        if(pc) pc.close();
        if(localStream) localStream.getTracks().forEach(t => t.stop());
        document.getElementById('video-call-overlay').classList.add('hidden');
        socket.emit('end-call', { to: activeChat });
    }
    socket.on('call-ended', endCall);
</script>
</body>
</html>
`);
});

// --- SERVEUR LOGIQUE ---
io.on("connection", (socket) => {
    socket.on('register', (d) => {
        if(users.findOne({u: d.u})) return socket.emit('auth-error', 'Nom pris');
        users.insert({ u: d.u, p: d.p, friends: [] });
        loginSuccess(socket, d.u);
    });

    socket.on('login', (d) => {
        const u = users.findOne({ u: d.u, p: d.p });
        if(!u) return socket.emit('auth-error', 'Erreur');
        loginSuccess(socket, d.u);
    });

    function loginSuccess(socket, name) {
        activeUsers[socket.id] = name;
        userSockets[name] = socket.id;
        socket.emit('auth-success', name);
        sendFriends(socket);
        io.emit('refresh-friends'); // Notify others
    }

    socket.on('add-friend', (name) => {
        const me = users.findOne({ u: activeUsers[socket.id] });
        const target = users.findOne({ u: name });
        if(target && !me.friends.includes(name)) {
            me.friends.push(name);
            users.update(me);
            // Auto-add back for simplicity in this version
            if(!target.friends.includes(me.u)) {
                target.friends.push(me.u);
                users.update(target);
            }
            sendFriends(socket);
        }
    });

    socket.on('private-msg', (d) => {
        const targetSid = userSockets[d.to];
        if(targetSid) io.to(targetSid).emit('msg-received', { from: activeUsers[socket.id], msg: d.msg });
    });

    socket.on('call-offer', d => io.to(userSockets[d.to]).emit('incoming-call', { from: activeUsers[socket.id], offer: d.offer }));
    socket.on('call-answer', d => io.to(userSockets[d.to]).emit('call-answer', { answer: d.answer }));
    socket.on('call-ice', d => io.to(userSockets[d.to]).emit('call-ice', { candidate: d.candidate }));
    socket.on('end-call', d => io.to(userSockets[d.to]).emit('call-ended'));

    socket.on('refresh-friends', () => sendFriends(socket));

    function sendFriends(s) {
        const me = users.findOne({ u: activeUsers[s.id] });
        if(!me) return;
        const list = me.friends.map(f => ({
            name: f,
            online: !!userSockets[f]
        }));
        s.emit('update-friends', list);
    }

    socket.on('disconnect', () => {
        const name = activeUsers[socket.id];
        delete userSockets[name];
        delete activeUsers[socket.id];
        io.emit('refresh-friends');
    });
});

server.listen(process.env.PORT || 3000);
