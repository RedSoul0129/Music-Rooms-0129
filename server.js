const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {};

// Cette ligne indique à Express de servir ton image logo.png
// quand le navigateur la demande.
app.get("/logo.png", (req, res) => {
    res.sendFile(path.join(__dirname, "logo.png"));
});

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Royal Sync & Stream Gold</title>
    <link rel="icon" type="image/png" href="/logo.png">
    
    <style>
        :root { 
            --gold: linear-gradient(135deg, #d4af37 0%, #f9f295 50%, #b38728 100%);
            --gold-solid: #d4af37;
            --dark: #050505;
            --card: #121212;
            --text: #f1f1f1;
        }
        
        body { 
            font-family: 'Playfair Display', serif; 
            background: var(--dark); 
            color: var(--text); 
            margin: 0; padding: 20px;
            background-image: radial-gradient(circle at center, #1a1a1a 0%, #050505 100%);
        }
        
        .royal-header { 
            background: var(--card);
            border: 1px solid var(--gold-solid);
            padding: 20px;
            border-radius: 15px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(212, 175, 55, 0.1);
            display: flex; flex-wrap: wrap; gap: 15px; align-items: center;
            justify-content: center;
        }

        .app-logo {
            width: 80px;
            height: 80px;
            border-radius: 15px;
            border: 2px solid var(--gold-solid);
            margin-bottom: 10px;
            object-fit: cover;
            box-shadow: 0 0 15px rgba(212, 175, 55, 0.3);
        }

        h1 { 
            background: var(--gold);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-size: 2.5rem; margin: 0; width: 100%; text-align: center;
            text-transform: uppercase; letter-spacing: 3px;
        }

        input, select { 
            padding: 12px; background: #1a1a1a; border: 1px solid #444; 
            color: white; border-radius: 5px; outline: none; transition: 0.3s;
        }
        input:focus { border-color: var(--gold-solid); box-shadow: 0 0 10px rgba(212, 175, 55, 0.3); }

        button { 
            padding: 12px 20px; border-radius: 5px; border: none; 
            font-weight: bold; cursor: pointer; transition: 0.4s; 
            text-transform: uppercase; letter-spacing: 1px;
        }

        .btn-gold { background: var(--gold); color: #000; box-shadow: 0 4px 15px rgba(212, 175, 55, 0.2); }
        .btn-gold:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(212, 175, 55, 0.4); }
        
        .btn-outline { background: transparent; border: 1px solid var(--gold-solid); color: var(--gold-solid); }
        .btn-outline:hover { background: rgba(212, 175, 55, 0.1); }
        
        .btn-mute-active { background: #ff4444 !important; color: white !important; border-color: #ff4444 !important; }

        #video-grid { 
            display: grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); 
            gap: 25px; width: 100%; 
        }

        .video-card { 
            background: #000; border-radius: 10px; overflow: hidden; 
            border: 1px solid var(--gold-solid); position: relative; aspect-ratio: 16/9;
            box-shadow: 0 15px 35px rgba(0,0,0,0.5);
        }

        .video-label { 
            position: absolute; top: 15px; left: 15px; z-index: 10;
            background: rgba(0,0,0,0.8); border: 1px solid var(--gold-solid);
            padding: 5px 12px; border-radius: 5px; color: var(--gold-solid);
            font-size: 0.8rem; pointer-events: none;
        }

        .fs-btn {
            position: absolute; bottom: 15px; right: 15px; z-index: 10;
            background: var(--gold); border: none; border-radius: 5px;
            padding: 8px; cursor: pointer; opacity: 0.4; transition: 0.3s;
        }
        .video-card:hover .fs-btn { opacity: 1; }

        video { width: 100%; height: 100%; object-fit: contain; }
        #yt-container { grid-column: 1 / -1; }
        #player { width: 100%; height: 100%; }
    </style>
</head>
<body>

<div class="royal-header">
    <img src="/logo.png" class="app-logo" alt="Logo Royal">
    <h1>👑 Royal Sync & Stream</h1>
    
    <input id="roomName" placeholder="NOM DE LA SALLE">
    <input id="password" type="password" placeholder="CLÉ D'ACCÈS">
    <button class="btn-gold" onclick="joinRoom()">Entrer au Palais</button>
    
    <div style="width:100%; height:1px; background:rgba(212,175,55,0.2); margin:15px 0;"></div>
    
    <select id="audioSource" onchange="changeAudioSource()" title="Choisir le micro"></select>
    <button id="micBtn" class="btn-outline" onclick="toggleMic()" disabled>🎤 MICRO : ON</button>
    <button id="screenBtn" class="btn-gold" onclick="toggleScreenShare()">🖥️ Diffuser Écran (60FPS)</button>
    
    <input id="ytLink" placeholder="Coller un lien YouTube..." style="flex-grow:1">
    <button class="btn-gold" onclick="loadVideo()">Charger Vidéo</button>
</div>

<div id="video-grid">
    <div id="yt-container" class="video-card">
        <div class="video-label">Lectorat Royal (YouTube)</div>
        <div id="player"></div>
        <button class="fs-btn" title="Plein Écran" onclick="makeFullScreen('yt-container')">⛶</button>
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

    // --- LOGIQUE MICRO (RÉPARÉE) ---
    function toggleMic() {
        if (!localStream) return;
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        
        const btn = document.getElementById('micBtn');
        if (audioTrack.enabled) {
            btn.innerText = "🎤 MICRO : ON";
            btn.classList.remove('btn-mute-active');
        } else {
            btn.innerText = "🔇 MICRO : COUPÉ";
            btn.classList.add('btn-mute-active');
        }
    }

    // --- PLEIN ÉCRAN ---
    function makeFullScreen(id) {
        const el = document.getElementById(id);
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }

    async function initVoice() {
        if (localStream) return true;
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const select = document.getElementById('audioSource');
            select.innerHTML = '';
            devices.filter(d => d.kind === 'audioinput').forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.deviceId; opt.text = d.label || 'Micro ' + (select.length + 1);
                select.appendChild(opt);
            });
            document.getElementById('micBtn').disabled = false;
            return true;
        } catch (e) { alert("Accès micro requis pour entrer."); return false; }
    }

    async function changeAudioSource() {
        if (!localStream) return;
        const deviceId = document.getElementById('audioSource').value;
        const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
        const newTrack = newStream.getAudioTracks()[0];
        Object.values(peers).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track.kind === 'audio');
            if (sender) sender.replaceTrack(newTrack);
        });
        localStream.getTracks().forEach(t => t.stop());
        localStream = newStream;
    }

    async function toggleScreenShare() {
        if (!currentRoom) return alert("Rejoignez une salle d'abord !");
        if (screenStream) {
            stopScreenShare();
        } else {
            try {
                screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { frameRate: { ideal: 60, max: 60 }, width: 1920, height: 1080 }
                });
                addVideoToGrid('local-screen', screenStream, "Votre Diffusion (60FPS)");
                Object.values(peers).forEach(pc => {
                    screenStream.getTracks().forEach(t => pc.addTrack(t, screenStream));
                    renegotiate(pc);
                });
                screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
            } catch (e) { console.error(e); }
        }
    }

    function stopScreenShare() {
        if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
        document.getElementById('local-screen')?.remove();
    }

    function addVideoToGrid(id, stream, labelText) {
        if (document.getElementById(id)) return;
        const card = document.createElement('div');
        card.id = id; card.className = 'video-card';
        card.innerHTML = \`<div class="video-label">\${labelText}</div>
                          <video autoplay playsinline></video>
                          <button class="fs-btn" onclick="makeFullScreen('\${id}')">⛶</button>\`;
        document.getElementById('video-grid').appendChild(card);
        card.querySelector('video').srcObject = stream;
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
            if (e.track.kind === 'video') addVideoToGrid('remote-' + userId, e.streams[0], "Salle de " + userId.slice(0,4));
            else {
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
            socket.emit("joinRoom", { 
                roomName: document.getElementById("roomName").value, 
                password: document.getElementById("password").value 
            }); 
        }
    }

    socket.on("roomJoined", (data) => { if (data.success) currentRoom = document.getElementById("roomName").value; else alert("Erreur d'accès."); });
    socket.on("user-joined", async (id) => {
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
        document.getElementById("remote-"+id)?.remove();
    });
</script>
</body>
</html>
`);
});

// --- LOGIQUE SERVEUR ---
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
server.listen(PORT, () => console.log("Le serveur Royal est en ligne sur le port " + PORT));
