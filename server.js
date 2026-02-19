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
body { font-family: Arial; text-align: center; background: #111; color: white; }
input, button { padding: 8px; margin: 5px; }
#player { margin-top: 20px; }
</style>
</head>
<body>

<h1>YouTube Sync Rooms</h1>

<div>
<input id="roomName" placeholder="Room name">
<input id="password" placeholder="Password">
<button onclick="createRoom()">Create</button>
<button onclick="joinRoom()">Join</button>
</div>

<br>

<input id="ytLink" placeholder="Paste YouTube link here" style="width:300px;">
<button onclick="loadVideo()">Load Video</button>

<div id="player"></div>

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
    width: '640',
    events: {
      'onStateChange': onPlayerStateChange
    }
  });
}

function createRoom() {
  const roomName = document.getElementById("roomName").value;
  const password = document.getElementById("password").value;
  socket.emit("createRoom", { roomName, password });
  currentRoom = roomName;
}

function joinRoom() {
  const roomName = document.getElementById("roomName").value;
  const password = document.getElementById("password").value;
  socket.emit("joinRoom", { roomName, password });
  currentRoom = roomName;
}

function loadVideo() {
  if (!currentRoom) return alert("Join a room first");

  const link = document.getElementById("ytLink").value;
  const videoId = extractVideoId(link);
  if (!videoId) return alert("Invalid YouTube link");

  player.loadVideoById(videoId);

  socket.emit("videoAction", {
    roomName: currentRoom,
    action: "load",
    videoId
  });
}

function onPlayerStateChange(event) {
  if (!currentRoom || isSyncing) return;

  if (event.data === YT.PlayerState.PLAYING) {
    socket.emit("videoAction", {
      roomName: currentRoom,
      action: "play",
      time: player.getCurrentTime()
    });
  }

  if (event.data === YT.PlayerState.PAUSED) {
    socket.emit("videoAction", {
      roomName: currentRoom,
      action: "pause",
      time: player.getCurrentTime()
    });
  }
}

socket.on("videoAction", (data) => {
  isSyncing = true;

  if (data.action === "load") {
    player.loadVideoById(data.videoId);
  }

  if (data.action === "play") {
    player.seekTo(data.time, true);
    player.playVideo();
  }

  if (data.action === "pause") {
    player.seekTo(data.time, true);
    player.pauseVideo();
  }

  setTimeout(() => isSyncing = false, 500);
});
</script>

</body>
</html>
`);
});

io.on("connection", (socket) => {

  socket.on("createRoom", ({ roomName, password }) => {
    rooms[roomName] = { password };
    socket.join(roomName);
  });

  socket.on("joinRoom", ({ roomName, password }) => {
    if (!rooms[roomName] || rooms[roomName].password !== password) return;
    socket.join(roomName);
  });

  socket.on("videoAction", (data) => {
    socket.to(data.roomName).emit("videoAction", data);
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {

  console.log("Running at http://localhost:3000");
});

