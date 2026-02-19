const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {};

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Sync, Voice & Screen Premium</title>
    <style>
        :root {
            --primary: #ff0044;
            --accent: #00d4ff;
            --bg: #0f0f13;
            --card-bg: rgba(255, 255, 255, 0.05);
            --text: #ffffff;
        }

        body { 
            font-family: 'Inter', sans-serif; 
            background: var(--bg); 
            background-image: radial-gradient(circle at 20% 30%, #1a1a2e 0%, #0f0f13 100%);
            color: var(--text); margin: 0; padding: 20px;
            display: flex; flex-direction: column; align-items: center;
        }

        .container { 
            width: 95%; max-width: 1100px; 
            background: var(--card-bg); backdrop-filter: blur(10px);
            padding: 25px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1);
        }

        .section { background: rgba(0,0,0,0.3); padding: 15px; border-radius: 15px; margin-bottom: 20px; }
        
        input, select { padding: 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: white; margin: 5px; }
        
        button { padding: 10px 18px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; transition: 0.3s; margin: 5px; }
        .btn-primary { background: var(--primary); color: white; }
        .btn-screen { background: var(--accent); color: black; }
        .btn-voice { background: #444; color: white; }
        .active { box-shadow: 0 0 15px var(--accent); transform: scale(1.05); }

        #main-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
        @media (min-width: 900px) { #main-grid { grid-template-columns: 1fr 1fr; } }

        #player, #screen-video { 
            width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 12px; overflow: hidden; 
            border: 2px solid #333;
        }

        #screen-video { display: none; } /* Caché par défaut */
        video { width: 100%; height: 100%; object-fit: contain; }
    </style>
</head>
<body>

<div class="container">
    <h1 style="margin-top:0;">YouTube <span style="color:var(--primary)">Sync</span> & Screen</h1>

    <div class="section">
        <input id="roomName" placeholder="Salle">
        <input id="password" type="password" placeholder="Pass">
        <button class="btn-primary" onclick="createRoom()">Créer</button>
        <button class="btn-primary" style="background:#444" onclick="joinRoom()">Rejoindre</button>
    </div>

    <div class="section">
        <select id="audioSource" onchange="changeAudioSource()"></select>
        <button id="micBtn" class="btn-voice" onclick="toggleMic()" disabled>🎤 Micro</button>
        <button id="screenBtn" class="btn-screen" onclick="toggleScreenShare()">🖥️ Partager l'écran</button>
        <input id="ytLink" placeholder="Lien YouTube..." style="width:40%">
        <button class="btn-primary" onclick="loadVideo()">Charger</button>
    </div>

    <div id="main-grid">
        <div>
            <label>🎬 YouTube</label>
            <div id="player"></div>
        </div>
        <div id="screen-container">
            <label>🖥️ Partage d'écran</label>
            <div id="screen-video">
                <video id="remoteScreen" autoplay playsinline></video>
            </div>
        </div>
    </div>
    
    <div id="remote-audios"></div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>

<script>
    const socket = io();
    let player, currentRoom = null, isSyncing = false;
    let localStream, screenStream;
    let peers = {}; 
    const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    // --- INITIALISATION ---
    async function initVoice() {
        if (localStream) return true;
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            getDevices();
            document.getElementById('micBtn').disabled = false;
            return true;
        } catch (e) { alert("Micro requis"); return false; }
    }

    async function getDevices() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const select = document.getElementById('audioSource');
        select.innerHTML = '';
        devices.filter(d => d.kind === 'audioinput').forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.deviceId; opt.text = d.label || 'Micro';
            select.appendChild(opt);
        });
    }

    // --- PARTAGE D'ÉCRAN ---
    async function toggleScreenShare() {
        if (!currentRoom) return alert("Rejoignez une salle d'abord");
        
        if (screenStream) {
            stopScreenShare();
        } else {
            try {
                screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                document.getElementById('screenBtn').classList.add('active');
                
                // Afficher localement
                const videoBox = document.getElementById('screen-video');
                videoBox.style.display = 'block';
                document.getElementById('remoteScreen').srcObject = screenStream;

                // Ajouter le flux aux connexions existantes
                Object.values(peers).forEach(pc => {
                    screenStream.getTracks().forEach(track => pc.addTrack(track, screenStream));
                    renegotiate(pc);
                });

                screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
            } catch (e) { console.error(e); }
        }
    }

    function stopScreenShare() {
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
        }
        document.getElementById('screenBtn').classList.remove('active');
        document.getElementById('screen-video').style.display = 'none';
    }

    async function renegotiate(pc) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { target: pc.userId, offer });
    }

    // --- WebRTC ---
    function createPeerConnection(userId) {
        const pc = new RTCPeerConnection(rtcConfig);
        pc.userId = userId;
        peers[userId] = pc;

        if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        if (screenStream) screenStream.getTracks().forEach(t => pc.addTrack(t, screenStream));

        pc.onicecandidate = (e) => { if (e.candidate) socket.emit("ice-candidate", { target: userId, candidate: e.candidate }); };
        
        pc.ontrack = (e) => {
            if (e.track.kind === 'video') {
                document.getElementById('screen-video').style.display = 'block';
                document.getElementById('remoteScreen').srcObject = e.streams[0];
            } else {
                let el = document.getElementById("audio-" + userId) || document.createElement("audio");
                el.id = "audio-" + userId; el.autoplay = true;
                document.getElementById("remote-audios").appendChild(el);
                el.srcObject = e.streams[0];
            }
        };
        return pc;
    }

    // --- LOGIQUE SALLES ---
    async function createRoom() { if(await initVoice()) socket.emit("createRoom", { roomName: document.getElementById("roomName").value, password: document.getElementById("password").value }); }
    async function joinRoom() { if(await initVoice()) socket.emit("joinRoom", { roomName: document.getElementById("roomName").value, password: document.getElementById("password").value }); }

    socket.on("roomJoined", (data) => { if (data.success) currentRoom = document.getElementById("roomName").value; });
    socket.on("user-joined", async (userId) => {
        const pc = createPeerConnection(userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { target: userId, offer });
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

    // --- YOUTUBE SYNC (Standard) ---
    function onYouTubeIframeAPIReady() {
        player = new YT.Player('player', { height: '100%', width: '100%', events: { 'onStateChange': onPlayerStateChange } });
    }
    function loadVideo() {
        const id = document.getElementById("ytLink").value.match(/(?:v=|\\/)([^&#\\?]{11})/)?.[1];
        if (id) { player.loadVideoById(id); socket.emit("videoAction", { roomName: currentRoom, action: "load", videoId: id }); }
    }
    function onPlayerStateChange(e) {
        if (!currentRoom || isSyncing) return;
        const t = player.getCurrentTime();
        if (e.data === YT.PlayerState.PLAYING) socket.emit("videoAction", { roomName: currentRoom, action: "play", time: t });
        if (e.data === YT.PlayerState.PAUSED) socket.emit("videoAction", { roomName: currentRoom, action: "pause", time: t });
    }
    socket.on("videoAction", (d) => {
        isSyncing = true;
        if (d.action === "load") player.loadVideoById(d.videoId);
        if (d.action === "play") { player.seekTo(d.time, true); player.playVideo(); }
        if (d.action === "pause") { player.seekTo(d.time, true); player.pauseVideo(); }
        setTimeout(() => isSyncing = false, 800);
    });

    socket.on("user-left", (id) => { if(peers[id]) { peers[id].close(); delete peers[id]; document.getElementById("audio-"+id)?.remove(); } });
</script>
</body>
</html>
`);
});

// --- SERVER (LOGIQUE) ---
io.on("connection", (socket) => {
    socket.on("createRoom", (d) => { rooms[d.roomName] = { password: d.password, videoState: null }; socket.join(d.roomName); socket.emit("roomJoined", { success: true }); });
    socket.on("joinRoom", (d) => {
        const r = rooms[d.roomName];
        if (!r || r.password !== d.password) return socket.emit("roomJoined", { success: false });
        socket.join(d.roomName); socket.emit("roomJoined", { success: true });
        socket.to(d.roomName).emit("user-joined", socket.id);
        if (r.videoState) socket.emit("videoAction", r.videoState);
    });
    socket.on("offer", (d) => io.to(d.target).emit("offer", { from: socket.id, offer: d.offer }));
    socket.on("answer", (d) => io.to(d.target).emit("answer", { from: socket.id, answer: d.answer }));
    socket.on("ice-candidate", (d) => io.to(d.target).emit("ice-candidate", { from: socket.id, candidate: d.candidate }));
    socket.on("videoAction", (d) => { if(rooms[d.roomName]) { rooms[d.roomName].videoState = d; socket.to(d.roomName).emit("videoAction", d); } });
    socket.on("disconnect", () => io.emit("user-left", socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Prêt !"));
