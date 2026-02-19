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
<html>
<head>
    <title>YouTube Sync & Voice Rooms</title>
    <style>
        body { font-family: 'Segoe UI', Arial; text-align: center; background: #111; color: white; margin: 0; padding: 20px; }
        .container { max-width: 900px; margin: auto; background: #222; padding: 20px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.5); }
        input, button { padding: 10px; margin: 5px; border-radius: 5px; border: none; }
        input { background: #333; color: white; width: 200px; }
        .btn-main { background: #ff0000; color: white; cursor: pointer; font-weight: bold; }
        .btn-voice { background: #444; color: white; cursor: pointer; min-width: 150px; }
        .btn-voice.active { background: #22ff22; color: black; }
        #player { margin-top: 20px; border: 3px solid #333; }
        .controls { margin-bottom: 20px; border-bottom: 1px solid #444; padding-bottom: 20px; }
        .status-dot { height: 10px; width: 10px; background-color: #bbb; border-radius: 50%; display: inline-block; margin-right: 5px; }
        .online { background-color: #22ff22; }
    </style>
</head>
<body>

<div class="container">
    <h1>YouTube Sync & Voice Rooms</h1>

    <div class="controls">
        <input id="roomName" placeholder="Room name">
        <input id="password" type="password" placeholder="Password">
        <br>
        <button class="btn-main" onclick="createRoom()">Create Room</button>
        <button class="btn-main" onclick="joinRoom()">Join Room</button>
    </div>

    <div style="margin-bottom: 15px;">
        <button id="micBtn" class="btn-voice" onclick="toggleMic()" disabled>🎤 Enable Microphone</button>
        <span id="voiceStatus"><span class="status-dot"></span>Voice Offline</span>
    </div>

    <div>
        <input id="ytLink" placeholder="Paste YouTube link here" style="width:60%;">
        <button class="btn-main" onclick="loadVideo()">Load Video</button>
    </div>

    <div id="player"></div>
    <div id="remote-audios"></div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>

<script>
    const socket = io();
    let player;
    let currentRoom = null;
    let isSyncing = false;
    
    let localStream;
    let peers = {}; 
    const rtcConfig = { 
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" }
        ] 
    };

    function extractVideoId(url) {
        const regExp = /(?:youtube\\.com.*(?:\\?|&)v=|youtu\\.be\\/)([^&#]+)/;
        const match = url.match(regExp);
        return match ? match[1] : null;
    }

    function onYouTubeIframeAPIReady() {
        player = new YT.Player('player', {
            height: '390',
            width: '100%',
            videoId: '',
            playerVars: { 'rel': 0, 'origin': window.location.origin },
            events: { 'onStateChange': onPlayerStateChange }
        });
    }

    async function initVoice() {
        if (localStream) return true;
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            document.getElementById('micBtn').disabled = false;
            document.getElementById('micBtn').innerText = "🎤 Mic: ON";
            document.getElementById('micBtn').classList.add('active');
            document.getElementById('voiceStatus').innerHTML = '<span class="status-dot online"></span>Voice Active';
            return true;
        } catch (err) {
            console.error("Erreur Micro:", err);
            alert("Accès micro refusé ou non disponible.");
            return false;
        }
    }

    function toggleMic() {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        document.getElementById('micBtn').innerText = audioTrack.enabled ? "🎤 Mic: ON" : "🔇 Mic: MUTED";
        document.getElementById('micBtn').classList.toggle('active', audioTrack.enabled);
    }

    async function createRoom() {
        if(await initVoice()) {
            const roomName = document.getElementById("roomName").value;
            const password = document.getElementById("password").value;
            socket.emit("createRoom", { roomName, password });
        }
    }

    async function joinRoom() {
        if(await initVoice()) {
            const roomName = document.getElementById("roomName").value;
            const password = document.getElementById("password").value;
            socket.emit("joinRoom", { roomName, password });
        }
    }

    socket.on("roomJoined", (data) => {
        if (data.success) {
            currentRoom = document.getElementById("roomName").value;
            console.log("Connecté à la salle:", currentRoom);
        } else {
            alert("Mot de passe incorrect");
        }
    });

    // WebRTC SIGNALING
    socket.on("user-joined", async (userId) => {
        console.log("Nouvel utilisateur détecté:", userId);
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

    socket.on("answer", async ({ from, answer }) => {
        if (peers[from]) {
            await peers[from].setRemoteDescription(new RTCSessionDescription(answer));
        }
    });

    socket.on("ice-candidate", async ({ from, candidate }) => {
        if (peers[from]) {
            try { await peers[from].addIceCandidate(new RTCIceCandidate(candidate)); } catch(e) {}
        }
    });

    function createPeerConnection(userId) {
        const pc = new RTCPeerConnection(rtcConfig);
        peers[userId] = pc;

        // On ajoute notre micro à la connexion
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        pc.onicecandidate = (event) => {
            if (event.candidate) socket.emit("ice-candidate", { target: userId, candidate: event.candidate });
        };

        pc.ontrack = (event) => {
            console.log("Flux audio reçu de:", userId);
            let el = document.getElementById("audio-" + userId);
            if (!el) {
                el = document.createElement("audio");
                el.id = "audio-" + userId;
                el.autoplay = true;
                el.controls = false; // Garder caché mais actif
                document.getElementById("remote-audios").appendChild(el);
            }
            el.srcObject = event.streams[0];
            // Fix pour Chrome/Safari : forcer la lecture
            el.play().catch(e => console.log("Lecture auto bloquée, attente interaction..."));
        };

        return pc;
    }

    // YOUTUBE SYNC
    function loadVideo() {
        if (!currentRoom) return alert("Rejoignez une salle d'abord");
        const videoId = extractVideoId(document.getElementById("ytLink").value);
        if (!videoId) return alert("Lien invalide");
        player.loadVideoById(videoId);
        socket.emit("videoAction", { roomName: currentRoom, action: "load", videoId });
    }

    function onPlayerStateChange(event) {
        if (!currentRoom || isSyncing) return;
        const data = { roomName: currentRoom, time: player.getCurrentTime() };
        if (event.data === YT.PlayerState.PLAYING) socket.emit("videoAction", { ...data, action: "play" });
        if (event.data === YT.PlayerState.PAUSED) socket.emit("videoAction", { ...data, action: "pause" });
    }

    socket.on("videoAction", (data) => {
        if (!player || typeof player.loadVideoById !== 'function') return;
        isSyncing = true;
        if (data.action === "load") player.loadVideoById(data.videoId);
        if (data.action === "play") { player.seekTo(data.time, true); player.playVideo(); }
        if (data.action === "pause") { player.seekTo(data.time, true); player.pauseVideo(); }
        setTimeout(() => isSyncing = false, 800);
    });

    socket.on("user-left", (userId) => {
        if (peers[userId]) {
            peers[userId].close();
            delete peers[userId];
        }
        const el = document.getElementById("audio-" + userId);
        if (el) el.remove();
    });
</script>
</body>
</html>
`);
});

// LOGIQUE SERVEUR
io.on("connection", (socket) => {
    socket.on("createRoom", ({ roomName, password }) => {
        rooms[roomName] = { password, videoState: null };
        socket.join(roomName);
        socket.emit("roomJoined", { success: true });
    });

    socket.on("joinRoom", ({ roomName, password }) => {
        const room = rooms[roomName];
        if (!room || room.password !== password) return socket.emit("roomJoined", { success: false });

        socket.join(roomName);
        socket.emit("roomJoined", { success: true });
        
        // On prévient les autres membres de lancer la connexion WebRTC
        socket.to(roomName).emit("user-joined", socket.id);

        if (room.videoState) socket.emit("videoAction", room.videoState);
    });

    socket.on("offer", ({ target, offer }) => io.to(target).emit("offer", { from: socket.id, offer }));
    socket.on("answer", ({ target, answer }) => io.to(target).emit("answer", { from: socket.id, answer }));
    socket.on("ice-candidate", ({ target, candidate }) => io.to(target).emit("ice-candidate", { from: socket.id, candidate }));

    socket.on("videoAction", (data) => {
        if (rooms[data.roomName]) {
            rooms[data.roomName].videoState = data;
            socket.to(data.roomName).emit("videoAction", data);
        }
    });

    socket.on("disconnect", () => {
        socket.broadcast.emit("user-left", socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Serveur lancé sur le port " + PORT));
