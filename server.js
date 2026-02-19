const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const loki = require("lokijs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- BASE DE DONNÉES LOCALE ---
const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");
const activeUsers = {}; // socket.id -> username

app.get("/logo.png", (req, res) => res.sendFile(path.join(__dirname, "logo.png")));

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Royal Social Club</title>
    <link rel="icon" type="image/png" href="/logo.png">
    <style>
        :root { --gold: linear-gradient(135deg, #d4af37 0%, #f9f295 50%, #b38728 100%); --gold-s: #d4af37; --dark: #050505; --card: #121212; --text: #f1f1f1; }
        body { font-family: 'serif'; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
        
        /* SIDEBAR */
        #sidebar { width: 260px; background: var(--card); border-right: 1px solid var(--gold-s); display: flex; flex-direction: column; padding: 20px; }
        .friend-item { padding: 10px; border-bottom: 1px solid rgba(212,175,55,0.1); display: flex; align-items: center; gap: 10px; font-size: 0.9rem; }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #444; }
        .online { background: #22c55e; box-shadow: 0 0 8px #22c55e; }

        /* MAIN */
        #main-content { flex: 1; display: flex; flex-direction: column; padding: 20px; overflow-y: auto; }
        .royal-header { background: var(--card); border: 1px solid var(--gold-s); padding: 15px; border-radius: 12px; margin-bottom: 20px; display: flex; gap: 10px; align-items: center; }
        
        /* AUTH */
        #auth-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.98); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .auth-box { background: var(--card); padding: 40px; border: 2px solid var(--gold-s); border-radius: 20px; text-align: center; width: 320px; box-shadow: 0 0 50px rgba(212,175,55,0.2); }
        
        /* CHAT */
        #chat-section { width: 300px; background: var(--card); border-left: 1px solid var(--gold-s); display: flex; flex-direction: column; }
        #chat-messages { flex: 1; overflow-y: auto; padding: 15px; font-size: 0.85rem; }
        #chat-input-area { padding: 15px; border-top: 1px solid rgba(212,175,55,0.2); display: flex; gap: 5px; }

        .video-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 15px; }
        .video-card { background: #000; border: 1px solid var(--gold-s); border-radius: 8px; position: relative; aspect-ratio: 16/9; }
        .video-label { position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); color: var(--gold-s); padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; z-index: 5; }
        
        input { padding: 10px; background: #1a1a1a; border: 1px solid #444; color: white; border-radius: 5px; outline: none; }
        input:focus { border-color: var(--gold-s); }
        button { padding: 10px 15px; border-radius: 5px; border: none; font-weight: bold; cursor: pointer; text-transform: uppercase; transition: 0.3s; }
        .btn-gold { background: var(--gold); color: #000; }
        .btn-gold:hover { transform: scale(1.05); }
        .btn-outline { background: transparent; border: 1px solid var(--gold-s); color: var(--gold-s); }
        .fs-btn { position: absolute; bottom: 10px; right: 10px; background: var(--gold); border: none; border-radius: 4px; padding: 5px; cursor: pointer; z-index: 5; }
        
        video { width: 100%; height: 100%; object-fit: contain; }
        .hidden { display: none !important; }
    </style>
</head>
<body>

<div id="auth-overlay">
    <div class="auth-box">
        <img src="/logo.png" style="width:70px; border-radius:10px; margin-bottom:10px;">
        <h2 style="color:var(--gold-s); margin-top:0;">BIENVENUE</h2>
        <input id="auth-user" placeholder="Nom (min 3)" style="width:90%; margin-bottom:10px;"><br>
        <input id="auth-pass" type="password" placeholder="Pass (min 6)" style="width:90%; margin-bottom:20px;"><br>
        <button class="btn-gold" style="width:100%; margin-bottom:10px;" onclick="login()">Se Connecter</button>
        <button class="btn-outline" style="width:100%;" onclick="register()">Créer Compte</button>
    </div>
</div>

<div id="sidebar">
    <h3 style="color:var(--gold-s); border-bottom: 1px solid var(--gold-s); padding-bottom: 10px;">🏰 NOBLESSE</h3>
    <div id="friends-list"></div>
</div>

<div id="main-content">
    <div class="royal-header">
        <span id="welcome-msg" style="color:var(--gold-s); font-weight:bold; margin-right:auto;">Veuillez vous connecter</span>
        <input id="roomName" placeholder="SALLE" style="width:120px">
        <button class="btn-gold" onclick="joinRoom()">REJOINDRE</button>
        <button id="micBtn" class="btn-outline" onclick="toggleMic()" disabled>🎤 ON</button>
        <button class="btn-gold" onclick="toggleScreenShare()">🖥️ ÉCRAN</button>
        <input id="ytLink" placeholder="YouTube Link" style="width:180px">
        <button class="btn-gold" onclick="loadVideo()">OK</button>
    </div>

    <div class="video-grid" id="video-grid">
        <div id="yt-container" class="video-card">
            <div class="video-label">Lectorat Royal</div>
            <div id="player"></div>
            <button class="fs-btn" onclick="makeFullScreen('yt-container')">⛶</button>
        </div>
    </div>
</div>

<div id="chat-section">
    <div style="padding: 10px; background: var(--gold); color: black; font-weight: bold; text-align: center; letter-spacing: 1px;">CHAT ROYAL</div>
    <div id="chat-messages"></div>
    <div id="chat-input-area">
        <input id="chat-msg" placeholder="Message..." style="flex:1" onkeypress="if(event.key==='Enter') sendChat()">
        <button class="btn-gold" onclick="sendChat()">➤</button>
    </div>
</div>

<div id="remote-audios"></div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>

<script>
    const socket = io();
    let myUser = null, currentRoom = null, localStream, screenStream;
    let peers = {};
    const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    // --- AUTHENTIFICATION AVEC RESTRICTIONS ---
    function login() {
        const u = document.getElementById('auth-user').value.trim();
        const p = document.getElementById('auth-pass').value.trim();
        if(!u || !p) return alert("Veuillez remplir les champs.");
        socket.emit('login', { u, p });
    }

    function register() {
        const u = document.getElementById('auth-user').value.trim();
        const p = document.getElementById('auth-pass').value.trim();
        if(u.length < 3) return alert("Nom: 3 caractères minimum.");
        if(p.length < 6) return alert("Mot de passe: 6 caractères minimum.");
        socket.emit('register', { u, p });
    }

    socket.on('auth-success', (data) => {
        myUser = data.user;
        document.getElementById('auth-overlay').classList.add('hidden');
        document.getElementById('welcome-msg').innerText = "⚜️ " + myUser;
        initVoice();
    });

    socket.on('auth-error', (msg) => alert(msg));

    // --- CHAT ---
    function sendChat() {
        const inp = document.getElementById('chat-msg');
        if(!currentRoom) return alert("Rejoignez une salle.");
        if(inp.value.trim()) {
            socket.emit('chat-msg', { room: currentRoom, msg: inp.value, from: myUser });
            inp.value = '';
        }
    }

    socket.on('chat-msg', (data) => {
        const m = document.getElementById('chat-messages');
        m.innerHTML += '<div><b style="color:var(--gold-s)">' + data.from + ':</b> ' + data.msg + '</div>';
        m.scrollTop = m.scrollHeight;
    });

    // --- AMIS ---
    socket.on('update-friends', (list) => {
        const container = document.getElementById('friends-list');
        container.innerHTML = '';
        list.forEach(u => {
            const status = u.online ? 'online' : '';
            container.innerHTML += '<div class="friend-item"><div class="status-dot ' + status + '"></div>' + u.name + '</div>';
        });
    });

    // --- VOIX & ÉCRAN ---
    async function initVoice() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            document.getElementById('micBtn').disabled = false;
        } catch(e) { console.log("Pas de micro."); }
    }

    function toggleMic() {
        const t = localStream.getAudioTracks()[0];
        t.enabled = !t.enabled;
        document.getElementById('micBtn').innerText = t.enabled ? "🎤 ON" : "🔇 OFF";
    }

    function makeFullScreen(id) {
        const el = document.getElementById(id);
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }

    function addVideoToGrid(id, stream, label) {
        if(document.getElementById(id)) return;
        const card = document.createElement('div');
        card.id = id; card.className = 'video-card';
        card.innerHTML = '<div class="video-label">' + label + '</div><video autoplay playsinline></video><button class="fs-btn" onclick="makeFullScreen(\\'' + id + '\\')">⛶</button>';
        document.getElementById('video-grid').appendChild(card);
        card.querySelector('video').srcObject = stream;
    }

    async function toggleScreenShare() {
        if(!currentRoom) return alert("Rejoignez une salle.");
        if(screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
            document.getElementById('local-screen')?.remove();
        } else {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 } });
            addVideoToGrid('local-screen', screenStream, "Ma Diffusion");
            Object.values(peers).forEach(pc => {
                screenStream.getTracks().forEach(t => pc.addTrack(t, screenStream));
                renegotiate(pc);
            });
        }
    }

    async function renegotiate(pc) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { target: pc.userId, offer });
    }

    function createPeerConnection(userId) {
        const pc = new RTCPeerConnection(rtcConfig);
        pc.userId = userId; peers[userId] = pc;
        if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        if (screenStream) screenStream.getTracks().forEach(t => pc.addTrack(t, screenStream));
        pc.onicecandidate = (e) => { if (e.candidate) socket.emit("ice-candidate", { target: userId, candidate: e.candidate }); };
        pc.ontrack = (e) => {
            if (e.track.kind === 'video') addVideoToGrid('remote-' + userId, e.streams[0], "Noble " + userId.slice(0,4));
            else {
                let el = document.getElementById("audio-" + userId) || document.createElement("audio");
                el.id = "audio-" + userId; el.autoplay = true;
                document.getElementById("remote-audios").appendChild(el);
                el.srcObject = e.streams[0];
            }
        };
        return pc;
    }

    function joinRoom() {
        currentRoom = document.getElementById('roomName').value;
        if(!currentRoom) return;
        socket.emit('joinRoom', { roomName: currentRoom });
    }

    socket.on('user-joined', async (id) => {
        const pc = createPeerConnection(id);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { target: id, offer });
    });

    socket.on("offer", async ({ from, offer }) => {
        const pc = createPeerConnection(from);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { target: from, answer });
    });

    socket.on("answer", ({ from, answer }) => { if (peers[from]) peers[from].setRemoteDescription(new RTCSessionDescription(answer)); });
    socket.on("ice-candidate", ({ from, candidate }) => { if (peers[from]) peers[from].addIceCandidate(new RTCIceCandidate(candidate)).catch(e=>{}); });

    // --- YOUTUBE ---
    function onYouTubeIframeAPIReady() {
        player = new YT.Player('player', { height: '100%', width: '100%', events: { 'onStateChange': onPlayerStateChange } });
    }
    function loadVideo() {
        const id = document.getElementById("ytLink").value.match(/(?:v=|\\/)([^&#\\?]{11})/)?.[1];
        if (id) { player.loadVideoById(id); socket.emit("videoAction", { roomName: currentRoom, action: "load", videoId: id }); }
    }
    function onPlayerStateChange(e) {
        if (!currentRoom) return;
        const t = player.getCurrentTime();
        if (e.data === YT.PlayerState.PLAYING) socket.emit("videoAction", { roomName: currentRoom, action: "play", time: t });
        if (e.data === YT.PlayerState.PAUSED) socket.emit("videoAction", { roomName: currentRoom, action: "pause", time: t });
    }
    socket.on("videoAction", (d) => {
        if (d.action === "load") player.loadVideoById(d.videoId);
        if (d.action === "play") { player.seekTo(d.time, true); player.playVideo(); }
        if (d.action === "pause") { player.seekTo(d.time, true); player.pauseVideo(); }
    });
    socket.on("user-left", (id) => { 
        if(peers[id]) { peers[id].close(); delete peers[id]; }
        document.getElementById("audio-"+id)?.remove(); 
        document.getElementById("remote-"+id)?.remove();
    });
</script>
</body>
</html>
`);
});

// --- SERVEUR LOGIQUE ---
io.on("connection", (socket) => {
    socket.on('register', (data) => {
        const u = (data.u || "").trim();
        const p = (data.p || "").trim();
        if (u.length < 3 || p.length < 6) return socket.emit('auth-error', 'Format invalide.');
        if (users.findOne({ u: u })) return socket.emit('auth-error', 'Nom déjà pris.');
        users.insert({ u: u, p: p });
        socket.emit('auth-success', { user: u });
    });

    socket.on('login', (data) => {
        const user = users.findOne({ u: data.u, p: data.p });
        if (!user) return socket.emit('auth-error', 'Identifiants incorrects.');
        activeUsers[socket.id] = data.u;
        socket.emit('auth-success', { user: data.u });
        updateFriendsGlobal();
    });

    socket.on('joinRoom', (d) => {
        socket.join(d.roomName);
        console.log(activeUsers[socket.id] + " a rejoint " + d.roomName);
        socket.to(d.roomName).emit('user-joined', socket.id);
    });

    socket.on('chat-msg', (data) => io.to(data.room).emit('chat-msg', data));
    socket.on('videoAction', (d) => socket.to(d.roomName).emit('videoAction', d));
    socket.on("offer", (d) => io.to(d.target).emit("offer", { from: socket.id, offer: d.offer }));
    socket.on("answer", (d) => io.to(d.target).emit("answer", { from: socket.id, answer: d.answer }));
    socket.on("ice-candidate", (d) => io.to(d.target).emit("ice-candidate", { from: socket.id, candidate: d.candidate }));

    socket.on('disconnect', () => {
        delete activeUsers[socket.id];
        io.emit('user-left', socket.id);
        updateFriendsGlobal();
    });

    function updateFriendsGlobal() {
        const all = users.find().map(u => ({
            name: u.u,
            online: Object.values(activeUsers).includes(u.u)
        }));
        io.emit('update-friends', all);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Palais Royal sur le port " + PORT));
