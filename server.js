const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const loki = require("lokijs"); // Base de données légère

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Initialisation Base de Données
const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");

const rooms = {};
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
        body { font-family: 'Playfair Display', serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
        
        /* SIDEBAR AMIS */
        #sidebar { width: 280px; background: var(--card); border-right: 1px solid var(--gold-s); display: flex; flex-direction: column; padding: 20px; }
        .friend-item { padding: 10px; border-bottom: 1px solid rgba(212,175,55,0.1); display: flex; align-items: center; gap: 10px; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #444; }
        .online { background: #22c55e; box-shadow: 0 0 5px #22c55e; }

        /* MAIN APP */
        #main-content { flex: 1; display: flex; flex-direction: column; padding: 20px; overflow-y: auto; }
        .royal-header { background: var(--card); border: 1px solid var(--gold-s); padding: 15px; border-radius: 12px; margin-bottom: 20px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        
        /* AUTH MODAL */
        #auth-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .auth-box { background: var(--card); padding: 40px; border: 2px solid var(--gold-s); border-radius: 20px; text-align: center; width: 350px; }
        
        /* CHAT WINDOW */
        #chat-section { width: 300px; background: var(--card); border-left: 1px solid var(--gold-s); display: flex; flex-direction: column; }
        #chat-messages { flex: 1; overflow-y: auto; padding: 15px; font-family: 'Inter', sans-serif; font-size: 0.9rem; }
        #chat-input-area { padding: 15px; border-top: 1px solid rgba(212,175,55,0.2); display: flex; gap: 5px; }

        .video-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 15px; }
        .video-card { background: #000; border: 1px solid var(--gold-s); border-radius: 8px; position: relative; aspect-ratio: 16/9; }
        input, select { padding: 10px; background: #1a1a1a; border: 1px solid #444; color: white; border-radius: 5px; }
        button { padding: 10px 15px; border-radius: 5px; border: none; font-weight: bold; cursor: pointer; text-transform: uppercase; }
        .btn-gold { background: var(--gold); color: #000; }
        .btn-outline { background: transparent; border: 1px solid var(--gold-s); color: var(--gold-s); }
        #player { width: 100%; height: 100%; }
        .hidden { display: none !important; }
    </style>
</head>
<body>

<div id="auth-overlay">
    <div class="auth-box">
        <img src="/logo.png" style="width:80px; margin-bottom:15px; border-radius:10px;">
        <h2 style="color:var(--gold-s)">PALAIS ROYAL</h2>
        <input id="auth-user" placeholder="Nom d'utilisateur" style="width:90%; margin-bottom:10px;"><br>
        <input id="auth-pass" type="password" placeholder="Mot de passe" style="width:90%; margin-bottom:20px;"><br>
        <button class="btn-gold" onclick="login()">Se Connecter</button>
        <button class="btn-outline" onclick="register()">Créer Compte</button>
    </div>
</div>

<div id="sidebar">
    <h3 style="color:var(--gold-s); border-bottom: 2px solid var(--gold-s)">🔱 AMIS</h3>
    <div id="friends-list">
        <p style="font-size: 0.8rem; opacity: 0.5;">Connectez-vous pour voir vos amis...</p>
    </div>
</div>

<div id="main-content">
    <div class="royal-header">
        <span id="welcome-msg" style="color:var(--gold-s); font-weight:bold; margin-right:auto">Visiteur</span>
        <input id="roomName" placeholder="NOM DE LA SALLE">
        <button class="btn-gold" onclick="joinRoom()">REJOINDRE</button>
        <button id="micBtn" class="btn-outline" onclick="toggleMic()" disabled>🎤</button>
        <button class="btn-gold" onclick="toggleScreenShare()">🖥️ ÉCRAN</button>
        <input id="ytLink" placeholder="Lien YouTube..." style="width:200px">
        <button class="btn-gold" onclick="loadVideo()">OK</button>
    </div>

    <div class="video-grid">
        <div id="yt-container" class="video-card">
            <div id="player"></div>
        </div>
    </div>
</div>

<div id="chat-section">
    <div style="padding: 10px; background: var(--gold); color: black; font-weight: bold; text-align: center;">CHAT GÉNÉRAL</div>
    <div id="chat-messages"></div>
    <div id="chat-input-area">
        <input id="chat-msg" placeholder="Votre message..." style="flex:1">
        <button class="btn-gold" onclick="sendChat()">⚡</button>
    </div>
</div>

<div id="remote-audios"></div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>

<script>
    const socket = io();
    let myUser = null, currentRoom = null, localStream;
    let peers = {};

    // --- AUTHENTIFICATION ---
    function login() { socket.emit('login', { u: document.getElementById('auth-user').value, p: document.getElementById('auth-pass').value }); }
    function register() { socket.emit('register', { u: document.getElementById('auth-user').value, p: document.getElementById('auth-pass').value }); }

    socket.on('auth-success', (data) => {
        myUser = data.user;
        document.getElementById('auth-overlay').classList.add('hidden');
        document.getElementById('welcome-msg').innerText = "🏰 " + myUser.toUpperCase();
        initVoice();
    });

    socket.on('auth-error', (msg) => alert(msg));

    socket.on('update-friends', (list) => {
        const container = document.getElementById('friends-list');
        container.innerHTML = '';
        list.forEach(u => {
            container.innerHTML += \`<div class="friend-item"><div class="status-dot \${u.online ? 'online' : ''}"></div> \${u.name}</div>\`;
        });
    });

    // --- MESSAGERIE ---
    function sendChat() {
        const inp = document.getElementById('chat-msg');
        if (inp.value && currentRoom) {
            socket.emit('chat-msg', { room: currentRoom, msg: inp.value, from: myUser });
            inp.value = '';
        } else if (!currentRoom) alert("Rejoignez une salle d'abord !");
    }

    socket.on('chat-msg', (data) => {
        const msgDiv = document.getElementById('chat-messages');
        msgDiv.innerHTML += \`<div><b style="color:var(--gold-s)">\${data.from}:</b> \${data.msg}</div>\`;
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });

    // --- LOGIQUE SALLES & VOIX (Version Courte) ---
    async function initVoice() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            document.getElementById('micBtn').disabled = false;
        } catch(e) { console.log("Micro off"); }
    }

    function toggleMic() {
        const t = localStream.getAudioTracks()[0];
        t.enabled = !t.enabled;
        document.getElementById('micBtn').innerText = t.enabled ? "🎤" : "🔇";
    }

    function joinRoom() {
        currentRoom = document.getElementById('roomName').value;
        socket.emit('joinRoom', { roomName: currentRoom });
        document.getElementById('chat-messages').innerHTML = '<p style="color:gray; font-size:0.7rem">Bienvenue dans ' + currentRoom + '</p>';
    }

    // (Code YouTube & WebRTC simplifié pour la brique)
    function onYouTubeIframeAPIReady() {
        player = new YT.Player('player', { height: '100%', width: '100%', events: { 'onStateChange': onPlayerStateChange } });
    }
    function loadVideo() {
        const id = document.getElementById("ytLink").value.match(/(?:v=|\\/)([^&#\\?]{11})/)?.[1];
        if (id) { player.loadVideoById(id); socket.emit("videoAction", { roomName: currentRoom, action: "load", videoId: id }); }
    }
    function onPlayerStateChange(e) { /* Sync Logic */ }
</script>
</body>
</html>
`);
});

// --- LOGIQUE SERVEUR (Auth & Social) ---
io.on("connection", (socket) => {
    socket.on('register', (data) => {
        if (users.findOne({ u: data.u })) return socket.emit('auth-error', 'Nom déjà pris');
        users.insert({ u: data.u, p: data.p, friends: [] });
        socket.emit('auth-success', { user: data.u });
    });

    socket.on('login', (data) => {
        const user = users.findOne({ u: data.u, p: data.p });
        if (!user) return socket.emit('auth-error', 'Mauvais identifiants');
        activeUsers[socket.id] = data.u;
        socket.emit('auth-success', { user: data.u });
        updateFriendsGlobal();
    });

    socket.on('joinRoom', (d) => {
        socket.join(d.roomName);
       console.log(activeUsers[socket.id] + " est entré dans " + d.roomName);
    });

    socket.on('chat-msg', (data) => {
        io.to(data.room).emit('chat-msg', data);
    });

    socket.on('disconnect', () => {
        delete activeUsers[socket.id];
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

server.listen(process.env.PORT || 3000);

