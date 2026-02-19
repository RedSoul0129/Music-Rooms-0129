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
    <title>Multi-Screen 60FPS Sync</title>
    <style>
        :root { --primary: #ff0044; --accent: #00d4ff; --bg: #0b0b0e; --text: #fff; }
        body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 15px; }
        
        .header { display: flex; flex-wrap: wrap; gap: 10px; background: rgba(255,255,255,0.05); padding: 15px; border-radius: 15px; margin-bottom: 20px; align-items: center; }
        input, select { padding: 8px; background: #222; border: 1px solid #444; color: white; border-radius: 5px; }
        
        button { padding: 8px 15px; border-radius: 6px; border: none; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .btn-p { background: var(--primary); color: white; }
        .btn-s { background: var(--accent); color: black; }
        .active { outline: 3px solid var(--accent); transform: scale(1.02); }

        /* GRILLE DYNAMIQUE */
        #video-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); 
            gap: 15px; 
            width: 100%; 
        }

        .video-card { 
            background: #000; border-radius: 12px; overflow: hidden; 
            border: 2px solid #333; position: relative; aspect-ratio: 16/9;
        }
        .video-card label { position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.6); padding: 2px 8px; border-radius: 4px; font-size: 12px; z-index: 10; }
        video { width: 100%; height: 100%; object-fit: contain; }
        
        #yt-container { grid-column: 1 / -1; margin-bottom: 10px; } /* YouTube prend toute la largeur en haut */
        #player { width: 100%; aspect-ratio: 16/9; border-radius: 12px; }
    </style>
</head>
<body>

<div class="header">
    <h2 style="margin:0; color:var(--primary)">SyncStream 60fps</h2>
    <input id="roomName" placeholder="Salle">
    <input id="password" type="password" placeholder="Pass" style="width:80px">
    <button class="btn-p" onclick="joinRoom()">Rejoindre / Créer</button>
    <div style="border-left: 1px solid #444; height: 30px; margin: 0 10px;"></div>
    <select id="audioSource" onchange="changeAudioSource()"></select>
    <button id="micBtn" style="background:#444; color:white;" onclick="toggleMic()" disabled>🎤</button>
    <button id="screenBtn" class="btn-s" onclick="toggleScreenShare()">🖥️ Partager mon écran (60 FPS)</button>
    <input id="ytLink" placeholder="Lien YouTube..." style="flex-grow:1">
    <button class="btn-p" onclick="loadVideo()">Charger</button>
</div>

<div id="video-grid">
    <div id="yt-container" class="video-card">
        <label>YouTube Sync</label>
        <div id="player"></div>
    </div>
    </div>

<div id="remote-audios"></div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>

<script>
    const socket = io();
    let player, currentRoom = null, isSyncing = false;
    let localStream, screenStream;
    let peers = {}; 
    const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    // --- 60 FPS CONFIG ---
    const screenConstraints = {
        video: {
            cursor: "always",
            frameRate: { ideal: 60, max: 60 }, // FORCER 60 FPS
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        }
    };

    async function initVoice() {
        if (localStream) return true;
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const select = document.getElementById('audioSource');
            devices.filter(d => d.kind === 'audioinput').forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.deviceId; opt.text = d.label || 'Micro';
                select.appendChild(opt);
            });
            document.getElementById('micBtn').disabled = false;
            return true;
        } catch (e) { alert("Micro requis"); return false; }
    }

    async function toggleScreenShare() {
        if (!currentRoom) return alert("Rejoignez une salle !");
        if (screenStream) {
            stopScreenShare();
        } else {
            try {
                screenStream = await navigator.mediaDevices.getDisplayMedia(screenConstraints);
                document.getElementById('screenBtn').classList.add('active');
                
                // On ajoute notre propre vidéo à notre grille
                addVideoToGrid('local-screen', screenStream, "Mon Écran (60 FPS)");

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
        document.getElementById('local-screen')?.remove();
    }

    function addVideoToGrid(id, stream, labelText) {
        if (document.getElementById(id)) return;
        const container = document.getElementById('video-grid');
        const card = document.createElement('div');
        card.id = id;
        card.className = 'video-card';
        card.innerHTML = \`<label>\${labelText}</label><video autoplay playsinline></video>\`;
        container.appendChild(card);
        card.querySelector('video').srcObject = stream;
    }

    async function renegotiate(pc) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { target: pc.userId, offer });
    }

    function createPeerConnection(userId) {
        const pc = new RTCPeerConnection(rtcConfig);
        pc.userId = userId;
        peers[userId] = pc;

        if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        if (screenStream) screenStream.getTracks().forEach(t => pc.addTrack(t, screenStream));

        pc.onicecandidate = (e) => { if (e.candidate) socket.emit("ice-candidate", { target: userId, candidate: e.candidate }); };
        
        pc.ontrack = (e) => {
            if (e.track.kind === 'video') {
                // Un flux vidéo arrive ! On l'ajoute à la grille
                addVideoToGrid('remote-video-' + userId, e.streams[0], "Écran de " + userId.slice(0,4));
            } else {
                let el = document.getElementById("audio-" + userId) || document.createElement("audio");
                el.id = "audio-" + userId; el.autoplay = true;
                document.getElementById("remote-audios").appendChild(el);
                el.srcObject = e.streams[0];
            }
        };
        return pc;
    }

    async function joinRoom() { 
        if(await initVoice()) {
            const roomName = document.getElementById("roomName").value;
            const password = document.getElementById("password").value;
            socket.emit("joinRoom", { roomName, password }); 
        }
    }

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

    // --- YOUTUBE SYNC ---
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

    socket.on("user-left", (id) => { 
        if(peers[id]) { peers[id].close(); delete peers[id]; }
        document.getElementById("audio-"+id)?.remove(); 
        document.getElementById("remote-video-"+id)?.remove();
    });
</script>
</body>
</html>
`);
});

// --- SERVER ---
io.on("connection", (socket) => {
    socket.on("joinRoom", (d) => {
        if (!rooms[d.roomName]) rooms[d.roomName] = { password: d.password, videoState: null };
        const r = rooms[d.roomName];
        if (r.password !== d.password) return socket.emit("roomJoined", { success: false });
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
server.listen(PORT, () => console.log("60FPS Grid Online!"));
