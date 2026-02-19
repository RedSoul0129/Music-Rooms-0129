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
    <title>YouTube Sync Rooms</title>
    <style>
        body { font-family: 'Segoe UI', Arial; text-align: center; background: #111; color: white; margin: 0; padding: 20px; }
        .container { max-width: 800px; margin: auto; background: #222; padding: 20px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.5); }
        input, button { padding: 10px; margin: 5px; border-radius: 5px; border: none; }
        input { background: #333; color: white; width: 200px; }
        button { background: #ff0000; color: white; cursor: pointer; font-weight: bold; }
        button:hover { background: #cc0000; }
        #player { margin-top: 20px; border: 3px solid #333; }
        .controls { margin-bottom: 20px; border-bottom: 1px solid #444; padding-bottom: 20px; }
    </style>
</head>
<body>

<div class="container">
    <h1>YouTube Sync Rooms</h1>

    <div class="controls">
        <input id="roomName" placeholder="Room name">
        <input id="password" type="password" placeholder="Password">
        <br>
        <button onclick="createRoom()">Create Room</button>
        <button onclick="joinRoom()">Join Room</button>
    </div>

    <div>
        <input id="ytLink" placeholder="Paste YouTube link here" style="width:70%;">
        <button onclick="loadVideo()">Load Video</button>
    </div>

    <div id="player"></div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>

<script>
    const socket = io();
    let player;
    let currentRoom = null;
    let isSyncing = false;

    function extractVideoId(url) {
        const regExp = /(?:youtube\\.com.*(?:\\?|&)v=|youtu\\.be\\/)([^&#]+)/;
        const match = url.match(regExp);
        return match ? match[1] : null;
    }

    function onYouTubeIframeAPIReady() {
        player = new YT.Player('player', {
            height: '390',
            width: '100%',
            videoId: '', // Initialement vide
            playerVars: { 'rel': 0, 'origin': window.location.origin },
            events: {
                'onStateChange': onPlayerStateChange,
                'onReady': onPlayerReady
            }
        });
    }

    function onPlayerReady(event) {
        console.log("YouTube Player est prêt.");
    }

    function createRoom() {
        const roomName = document.getElementById("roomName").value;
        const password = document.getElementById("password").value;
        if(!roomName || !password) return alert("Please fill room name and password");
        socket.emit("createRoom", { roomName, password });
    }

    function joinRoom() {
        const roomName = document.getElementById("roomName").value;
        const password = document.getElementById("password").value;
        if(!roomName || !password) return alert("Please fill room name and password");
        socket.emit("joinRoom", { roomName, password });
    }

    // Réception de la confirmation de connexion à une salle
    socket.on("roomJoined", (data) => {
        if (data.success) {
            currentRoom = document.getElementById("roomName").value;
            alert("Success! You are in room: " + currentRoom);
        } else {
            alert("Error: Wrong room name or password!");
        }
    });

    function loadVideo() {
        if (!currentRoom) return alert("Join a room first!");
        const link = document.getElementById("ytLink").value;
        const videoId = extractVideoId(link);
        if (!videoId) return alert("Invalid YouTube link!");

        player.loadVideoById(videoId);
        socket.emit("videoAction", {
            roomName: currentRoom,
            action: "load",
            videoId: videoId
        });
    }

    function onPlayerStateChange(event) {
        if (!currentRoom || isSyncing) return;

        const currentTime = player.getCurrentTime();

        if (event.data === YT.PlayerState.PLAYING) {
            socket.emit("videoAction", {
                roomName: currentRoom,
                action: "play",
                time: currentTime
            });
        } else if (event.data === YT.PlayerState.PAUSED) {
            socket.emit("videoAction", {
                roomName: currentRoom,
                action: "pause",
                time: currentTime
            });
        }
    }

    // Synchronisation reçue du serveur
    socket.on("videoAction", (data) => {
        // Sécurité : on vérifie si le lecteur est bien initialisé
        if (!player || typeof player.loadVideoById !== 'function') return;

        isSyncing = true;

        if (data.action === "load") {
            player.loadVideoById(data.videoId);
        } else if (data.action === "play") {
            player.seekTo(data.time, true);
            player.playVideo();
        } else if (data.action === "pause") {
            player.seekTo(data.time, true);
            player.pauseVideo();
        }

        // Empêche les boucles infinies d'évènements
        setTimeout(() => { isSyncing = false; }, 800);
    });
</script>

</body>
</html>
`);
});

// LOGIQUE SERVEUR (Node.js)
io.on("connection", (socket) => {
    console.log("Nouveau client connecté : " + socket.id);

    socket.on("createRoom", ({ roomName, password }) => {
        rooms[roomName] = {
            password: password,
            videoState: null
        };
        socket.join(roomName);
        socket.emit("roomJoined", { success: true });
        console.log("Chambre créée : " + roomName);
    });

    socket.on("joinRoom", ({ roomName, password }) => {
        const room = rooms[roomName];

        if (!room || room.password !== password) {
            socket.emit("roomJoined", { success: false });
            return;
        }

        socket.join(roomName);
        socket.emit("roomJoined", { success: true });
        console.log(socket.id + " a rejoint : " + roomName);

        // Envoyer l'état actuel de la vidéo au nouvel arrivant
        if (room.videoState) {
            socket.emit("videoAction", room.videoState);
        }
    });

    socket.on("videoAction", (data) => {
        if (!rooms[data.roomName]) return;

        // On enregistre l'état pour les futurs arrivants
        rooms[data.roomName].videoState = data;

        // On diffuse aux autres membres de la chambre
        socket.to(data.roomName).emit("videoAction", data);
    });

    socket.on("disconnect", () => {
        console.log("Client déconnecté.");
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("Server is running on port " + PORT);
});
