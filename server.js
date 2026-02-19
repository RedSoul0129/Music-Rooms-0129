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
    <title>YouTube Sync & Voice Premium</title>
    <style>
        :root {
            --primary: #ff0044;
            --primary-hover: #cc0033;
            --bg: #0f0f13;
            --card-bg: rgba(255, 255, 255, 0.05);
            --text: #ffffff;
            --accent: #00d4ff;
        }

        body { 
            font-family: 'Inter', 'Segoe UI', sans-serif; 
            background: var(--bg); 
            background-image: radial-gradient(circle at 20% 30%, #1a1a2e 0%, #0f0f13 100%);
            color: var(--text); 
            margin: 0; 
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }

        .container { 
            width: 95%;
            max-width: 1000px; 
            background: var(--card-bg); 
            backdrop-filter: blur(10px);
            padding: 30px; 
            border-radius: 20px; 
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }

        h1 { 
            font-weight: 800; 
            letter-spacing: -1px; 
            margin-bottom: 30px;
            background: linear-gradient(to right, #fff, var(--accent));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .section {
            background: rgba(0,0,0,0.2);
            padding: 20px;
            border-radius: 15px;
            margin-bottom: 20px;
        }

        .grid-controls {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 10px;
        }

        input, select { 
            padding: 12px 15px; 
            background: rgba(255,255,255,0.08); 
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            color: white;
            transition: all 0.3s;
            outline: none;
        }

        input:focus { border-color: var(--accent); background: rgba(255,255,255,0.15); }

        button { 
            padding: 12px 20px; 
            border-radius: 10px; 
            border: none; 
            font-weight: bold; 
            text-transform: uppercase;
            cursor: pointer; 
            transition: all 0.3s;
        }

        .btn-primary { background: var(--primary); color: white; }
        .btn-primary:hover { background: var(--primary-hover); transform: translateY(-2px); }

        .btn-voice { 
            background: #333; 
            color: #aaa; 
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .btn-voice.active { background: #22c55e; color: white; box-shadow: 0 0 15px rgba(34, 197, 94, 0.4); }

        #player { 
            margin-top: 20px; 
            border-radius: 15px; 
            overflow: hidden;
            aspect-ratio: 16 / 9;
            background: #000;
            box-shadow: 0 10px 30px rgba(0,0,0,0.8);
        }

        .status-badge {
            font-size: 0.8rem;
            padding: 5px 12px;
            border-radius: 20px;
            background: rgba(255,255,255,0.1);
            margin-left: 10px;
        }

        .online-dot { 
            height: 8px; width: 8px; background: #666; 
            border-radius: 50%; display: inline-block; margin-right: 6px; 
        }
        .active-dot { background: #22c55e; box-shadow: 0 0 8px #22c55e; }

        .yt-input-group {
            display: flex;
            gap: 10px;
            margin-top: 10px;
        }
        .yt-input-group input { flex: 1; }

    </style>
</head>
<body>

<div class="container">
    <h1>YouTube Sync <span style="font-weight: 300; opacity: 0.6;">& Voice</span></h1>

    <div class="section">
        <div class="grid-controls">
            <input id="roomName" placeholder="Nom de la salle">
            <input id="password" type="password" placeholder="Mot de passe">
        </div>
        <div style="display:flex; gap: 10px;">
            <button class="btn-primary" style="flex:1" onclick="createRoom()">Créer</button>
            <button class="btn-primary" style="flex:1; background: #444;" onclick="joinRoom()">Rejoindre</button>
        </div>
    </div>

    <div class="section">
        <div style="display:flex; align-items: center; gap: 15px; flex-wrap: wrap;">
            <select id="audioSource" onchange="changeAudioSource()" style="flex:1"></select>
            <button id="micBtn" class="btn-voice" onclick="toggleMic()" disabled>
                <span>🎤</span> Activer Micro
            </button>
            <div class="status-badge" id="voiceStatus">
                <span class="online-dot" id="dot"></span> Offline
            </div>
        </div>

        <div class="yt-input-group">
            <input id="ytLink" placeholder="Collez un lien YouTube ici...">
            <button class="btn-primary" style="background: var(--accent); color: black;" onclick="loadVideo()">Charger</button>
        </div>
    </div>

    <div id="player"></div>
    <div id="remote-audios"></div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>

<script>
    const socket = io();
    let player, currentRoom = null, isSyncing = false, localStream, peers = {}; 
    const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

    async function getDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioSelect = document.getElementById('audioSource');
            audioSelect.innerHTML = '';
            devices.forEach(device => {
                if (device.kind === 'audioinput') {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.text = device.label || 'Micro ' + (audioSelect.length + 1);
                    audioSelect.appendChild(option);
                }
            });
        } catch (e) { console.error(e); }
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

    async function initVoice() {
        if (localStream) return true;
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await getDevices(); 
            document.getElementById('micBtn').disabled = false;
            document.getElementById('micBtn').classList.add('active');
            document.getElementById('dot').classList.add('active-dot');
            document.getElementById('voiceStatus').innerHTML = '<span class="online-dot active-dot"></span> Vocal Actif';
            return true;
        } catch (err) {
            alert("Accès micro requis.");
            return false;
        }
    }

    function toggleMic() {
        const track = localStream.getAudioTracks()[0];
        track.enabled = !track.enabled;
        document.getElementById('micBtn').classList.toggle('active', track.enabled);
        document.getElementById('micBtn').innerHTML = track.enabled ? '<span>🎤</span> Mic: ON' : '<span>🔇</span> Mic: OFF';
    }

    async function createRoom() { if(await initVoice()) socket.emit("createRoom", { roomName: document.getElementById("roomName").value, password: document.getElementById("password").value }); }
    async function joinRoom() { if(await initVoice()) socket.emit("joinRoom", { roomName: document.getElementById("roomName").value, password: document.getElementById("password").value }); }

    socket.on("roomJoined", (data) => {
        if (data.success) { currentRoom = document.getElementById("roomName").value; }
        else { alert("Identifiants incorrects"); }
    });

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
    socket.on("ice-candidate", ({ from, candidate }) => { if (peers[from]) peers[from].addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {}); });

    function createPeerConnection(userId) {
        const pc = new RTCPeerConnection(rtcConfig);
        peers[userId] = pc;
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        pc.onicecandidate = (e) => { if (e.candidate) socket.emit("ice-candidate", { target: userId, candidate: e.candidate }); };
        pc.ontrack = (e) => {
            let el = document.getElementById("audio-" + userId) || document.createElement("audio");
            el.id = "audio-" + userId; el.autoplay = true; 
            document.getElementById("remote-audios").appendChild(el);
            el.srcObject = e.streams[0];
        };
        return pc;
    }

    function onYouTubeIframeAPIReady() {
        player = new YT.Player('player', { height: '100%', width: '100%', events: { 'onStateChange': onPlayerStateChange } });
    }

    function loadVideo() {
        if (!currentRoom) return alert("Rejoignez une salle !");
        const regExp = /(?:youtube\\.com.*(?:\\?|&)v=|youtu\\.be\\/)([^&#]+)/;
        const videoId = document.getElementById("ytLink").value.match(regExp)?.[1];
        if (videoId) { player.loadVideoById(videoId); socket.emit("videoAction", { roomName: currentRoom, action: "load", videoId }); }
    }

    function onPlayerStateChange(event) {
        if (!currentRoom || isSyncing) return;
        const time = player.getCurrentTime();
        if (event.data === YT.PlayerState.PLAYING) socket.emit("videoAction", { roomName: currentRoom, action: "play", time });
        if (event.data === YT.PlayerState.PAUSED) socket.emit("videoAction", { roomName: currentRoom, action: "pause", time });
    }

    socket.on("videoAction", (data) => {
        isSyncing = true;
        if (data.action === "load") player.loadVideoById(data.videoId);
        if (data.action === "play") { player.seekTo(data.time, true); player.playVideo(); }
        if (data.action === "pause") { player.seekTo(data.time, true); player.pauseVideo(); }
        setTimeout(() => isSyncing = false, 800);
    });

    socket.on("user-left", (userId) => { if (peers[userId]) { peers[userId].close(); delete peers[userId]; document.getElementById("audio-" + userId)?.remove(); } });
</script>
</body>
</html>
`);
});

io.on("connection", (socket) => {
    socket.on("createRoom", ({ roomName, password }) => { rooms[roomName] = { password, videoState: null }; socket.join(roomName); socket.emit("roomJoined", { success: true }); });
    socket.on("joinRoom", ({ roomName, password }) => {
        const room = rooms[roomName];
        if (!room || room.password !== password) return socket.emit("roomJoined", { success: false });
        socket.join(roomName); socket.emit("roomJoined", { success: true });
        socket.to(roomName).emit("user-joined", socket.id);
        if (room.videoState) socket.emit("videoAction", room.videoState);
    });
    socket.on("offer", ({ target, offer }) => io.to(target).emit("offer", { from: socket.id, offer }));
    socket.on("answer", ({ target, answer }) => io.to(target).emit("answer", { from: socket.id, answer }));
    socket.on("ice-candidate", ({ target, candidate }) => io.to(target).emit("ice-candidate", { from: socket.id, candidate }));
    socket.on("videoAction", (data) => { if (rooms[data.roomName]) { rooms[data.roomName].videoState = data; socket.to(data.roomName).emit("videoAction", data); } });
    socket.on("disconnect", () => io.emit("user-left", socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Lancement réussi sur le port " + PORT));
