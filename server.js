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
        #player { margin-top: 20px; border: 3px solid #333; pointer-events: auto; }
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
    
    // Voice Chat Variables
    let localStream;
    let peers = {}; 
    const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

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

    // --- Voice Chat Logic ---
    async function initVoice() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            document.getElementById('micBtn').disabled = false;
            document.getElementById('micBtn').innerText = "🎤 Mic: ON";
            document.getElementById('micBtn').classList.add('active');
            document.getElementById('voiceStatus').innerHTML = '<span class="status-dot online"></span>Voice Active';
            return true;
        } catch (err) {
            alert("Could not access microphone. Please check permissions.");
            return false;
        }
    }

    function toggleMic() {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack.enabled) {
            audioTrack.enabled = false;
            document.getElementById('micBtn').innerText = "🔇 Mic: MUTED";
            document.getElementById('micBtn').classList.remove('active');
        } else {
            audioTrack.enabled = true;
            document.getElementById('micBtn').innerText = "🎤 Mic: ON";
            document.getElementById('micBtn').classList.add('active');
        }
    }

    async function createRoom() {
        const roomName = document.getElementById("roomName").value;
        const password = document.getElementById("password").value;
        if(!roomName || !password) return alert("Fill credentials");
        if(await initVoice()) socket.emit("createRoom", { roomName, password });
    }

    async function joinRoom() {
        const roomName = document.getElementById("roomName").value;
        const password = document.getElementById("password").value;
        if(!roomName || !password) return alert("Fill credentials");
        if(await initVoice()) socket.emit("joinRoom", { roomName, password });
    }

    socket.on("roomJoined", (data) => {
        if (data.success) {
            currentRoom = document.getElementById("roomName").value;
            alert("Joined " + currentRoom);
        } else {
            alert("Wrong credentials");
        }
    });

    // --- WebRTC Signaling ---
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

    socket.on("answer", async ({ from, answer }) => {
        await peers[from].setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("ice-candidate", async ({ from, candidate }) => {
        try { await peers[from].addIceCandidate(new RTCIceCandidate(candidate)); } catch(e) {}
    });

    function createPeerConnection(userId) {
        const pc = new RTCPeerConnection(rtcConfig);
        peers[userId] = pc;

        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        pc.onicecandidate = (event) => {
            if (event.candidate) socket.emit("ice-candidate", { target: userId, candidate: event.candidate });
        };

        pc.ontrack = (event) => {
            let el = document.getElementById("audio-" + userId);
            if (!el) {
                el = document.createElement("audio");
                el.id = "audio-" + userId;
                el.autoplay = true;
                document.getElementById("remote-audios").appendChild(el);
            }
            el.srcObject = event.streams[0];
        };

        return pc;
    }

    // --- YouTube Logic ---
    function loadVideo() {
        if (!currentRoom) return alert("Join room first");
        const videoId = extractVideoId(document.getElementById("ytLink").value);
        if (!videoId) return alert("Invalid link");
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

// --- SERVER LOGIC ---
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
        
        // Tell others in the room to connect to this new user for voice
        socket.to(roomName).emit("user-joined", socket.id);

        if (room.videoState) socket.emit("videoAction", room.videoState);
    });

    // Signaling Relay
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
        io.emit("user-left", socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running..."));
