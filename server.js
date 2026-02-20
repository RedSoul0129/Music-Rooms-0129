const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const loki = require("lokijs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e7 });

// --- BASE DE DONNÉES ---
const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");
let groups = db.getCollection("groups") || db.addCollection("groups");
let messages = db.getCollection("messages") || db.addCollection("messages");

const MARKET_ITEMS = [
    { id: 'f_gold', name: 'Aura Dorée', price: 100, type: 'frame', style: 'box-shadow: 0 0 10px #d4af37; border: 2px solid #d4af37;' },
    { id: 'f_rgb', name: 'Chroma RGB', price: 250, type: 'frame', style: 'animation: rgb-anim 2s linear infinite; border: 2px solid;' },
    { id: 'b_vip', name: 'Salon VIP', price: 300, type: 'banner', url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800' }
];

function getRank(lvl) {
    if (lvl >= 50) return { n: "👑 EMPEREUR", c: "#ff0000" };
    if (lvl >= 30) return { n: "🟠 Comte", c: "#ffaa00" };
    return { n: "🟢 Roturier", c: "#00ff00" };
}

app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Royal Palace V7 - L'Empire</title>
    <style>
        :root { --gold: linear-gradient(135deg, #e6c27a 0%, #ffe5a3 50%, #c59b3d 100%); --gold-s: #d4af37; --bg: #050505; --card: #111; }
        body, html { margin:0; padding:0; font-family:'Segoe UI', sans-serif; background:var(--bg); color:white; height:100vh; overflow:hidden; }
        
        #auth-screen { position:fixed; inset:0; z-index:9999; background:var(--bg); display:flex; align-items:center; justify-content:center; }
        .auth-box { background:var(--card); padding:40px; border-radius:20px; border:1px solid var(--gold-s); width:300px; text-align:center; }
        
        #app { display:flex; height:100vh; width:100vw; }
        #sidebar { width:280px; background:#0a0a0a; border-right:1px solid #222; display:flex; flex-direction:column; }
        
        .nav-item { padding:12px 20px; cursor:pointer; opacity:0.6; display:flex; align-items:center; gap:10px; transition:0.2s; }
        .nav-item.active { opacity:1; background:rgba(212,175,55,0.1); border-left:3px solid var(--gold-s); }
        .section-label { font-size:0.65rem; color:#444; padding:20px 20px 5px; text-transform:uppercase; font-weight:bold; }

        #main { flex:1; display:flex; flex-direction:column; background:#080808; }
        #msgs { flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:10px; }
        .msg { background:rgba(255,255,255,0.03); padding:10px 15px; border-radius:10px; max-width:80%; border-left:3px solid transparent; }

        #call-bar { height:0; overflow:hidden; background:#000; transition:0.3s; position:relative; }
        #call-bar.active { height:300px; }
        .call-controls { position:absolute; bottom:20px; left:50%; transform:translateX(-50%); display:flex; gap:10px; }

        .btn-royal { background:var(--gold); border:none; padding:10px 15px; border-radius:8px; font-weight:bold; cursor:pointer; }
        .btn-icon { background:#222; color:white; border:none; width:40px; height:40px; border-radius:50%; cursor:pointer; }
        .btn-icon.on { background:var(--gold-s); color:black; }

        input { background:#151515; border:1px solid #333; color:white; padding:12px; border-radius:8px; width:100%; box-sizing:border-box; }
        .view { display:none; flex:1; flex-direction:column; }
        .view.active { display:flex; }
        
        @keyframes rgb-anim { 0% { border-color: red; } 33% { border-color: green; } 66% { border-color: blue; } 100% { border-color: red; } }
    </style>
</head>
<body>

<div id="auth-screen">
    <div class="auth-box">
        <h2 style="color:var(--gold-s); letter-spacing:2px">ROYAL PALACE</h2>
        <input id="au" placeholder="Pseudo" style="margin-bottom:10px">
        <input id="ap" type="password" placeholder="Code" style="margin-bottom:20px">
        <button class="btn-royal" style="width:100%" onclick="login()">SE CONNECTER</button>
    </div>
</div>

<div id="app">
    <div id="sidebar">
        <div style="padding:25px; font-weight:bold; color:var(--gold-s)">⚜️ L'EMPIRE</div>
        
        <div class="nav-item active" onclick="switchRoom('public', this)">🌍 Cour Publique</div>
        
        <div class="section-label">Mes Groupes <button onclick="createGroup()" style="background:none; border:none; color:var(--gold-s); cursor:pointer">+</button></div>
        <div id="group-list"></div>

        <div class="section-label">Mes Amis</div>
        <div id="friend-list"></div>

        <div style="flex:1"></div>
        <div class="nav-item" onclick="showMarket()">🛒 Boutique Royale</div>
        
        <div id="user-footer" style="padding:20px; border-top:1px solid #222; background-size:cover;">
            <div style="display:flex; align-items:center; gap:12px">
                <div style="position:relative; width:45px; height:45px;">
                    <img id="my-av" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">
                    <div id="my-fr" style="position:absolute; inset:-4px; border-radius:50%; pointer-events:none;"></div>
                </div>
                <div>
                    <div id="my-name" style="font-weight:bold; font-size:0.9rem">...</div>
                    <div id="my-gems" style="color:var(--gold-s); font-size:0.7rem">💎 0</div>
                </div>
            </div>
        </div>
    </div>

    <div id="main">
        <div id="view-chat" class="view active">
            <div id="call-bar">
                <video id="v-remote" autoplay style="width:100%; height:100%; object-fit:contain;"></video>
                <div class="call-controls">
                    <button id="btn-mic" class="btn-icon on" onclick="toggleMic()">🎤</button>
                    <button id="btn-cam" class="btn-icon" onclick="toggleCam()">📷</button>
                    <button class="btn-icon" onclick="startShare()">🖥️</button>
                    <button class="btn-icon" style="background:red" onclick="endCall()">❌</button>
                </div>
            </div>
            
            <div style="padding:15px 25px; border-bottom:1px solid #222; display:flex; justify-content:space-between; align-items:center;">
                <h3 id="room-title" style="margin:0">Cour Publique</h3>
                <button id="btn-call" class="btn-royal" style="display:none" onclick="startCall()">📞 Appel</button>
            </div>

            <div id="msgs"></div>

            <div style="padding:20px; display:flex; gap:10px; background:#0a0a0a">
                <input id="msg-in" placeholder="Votre message..." onkeypress="if(event.key==='Enter') sendMsg()">
                <button class="btn-royal" onclick="sendMsg()">➤</button>
            </div>
        </div>

        <div id="view-market" class="view" style="padding:40px">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px">
                <h2 style="color:var(--gold-s); margin:0">Marché de l'Empire</h2>
                <button class="btn-royal" onclick="switchRoom('public')">Retour</button>
            </div>
            <div id="market-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px,1fr)); gap:20px"></div>
        </div>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    let me = null;
    let activeRoom = "public";
    let localStream = null;

    // --- AUTH ---
    function login() {
        const u = document.getElementById('au').value, p = document.getElementById('ap').value;
        if(u && p) {
            localStorage.setItem('royal_v7', JSON.stringify({u,p}));
            socket.emit('login', {u,p});
        }
    }

    const saved = localStorage.getItem('royal_v7');
    if(saved) socket.emit('login', JSON.parse(saved));

    socket.on('auth-success', u => {
        me = u;
        document.getElementById('auth-screen').style.display = 'none';
        updateUI();
        switchRoom('public');
    });

    // --- NAVIGATION & UI ---
    function updateUI() {
        document.getElementById('my-name').innerText = me.u;
        document.getElementById('my-gems').innerText = "💎 " + me.gems;
        document.getElementById('my-av').src = me.avatar || 'https://ui-avatars.com/api/?name='+me.u;
        document.getElementById('my-fr').style = me.activeFrame || '';
        document.getElementById('user-footer').style.backgroundImage = me.banner ? \`linear-gradient(rgba(0,0,0,0.8),rgba(0,0,0,0.8)), url(\${me.banner})\` : '';

        // Listes
        renderList('friend-list', me.friends, f => openPrivate(f));
        renderList('group-list', me.groups, g => openGroup(g));
    }

    function renderList(id, items, cb) {
        const el = document.getElementById(id); el.innerHTML = '';
        items.forEach(it => {
            const d = document.createElement('div');
            d.className = 'nav-item';
            d.innerText = it.name || it;
            d.onclick = () => cb(it);
            el.appendChild(d);
        });
    }

    function switchRoom(id, el) {
        activeRoom = id;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-chat').classList.add('active');
        document.getElementById('room-title').innerText = id === 'public' ? "Cour Publique" : id;
        document.getElementById('btn-call').style.display = id === 'public' ? 'none' : 'block';
        if(el) {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            el.classList.add('active');
        }
        socket.emit('get-history', id);
    }

    function openPrivate(name) { switchRoom([me.u, name].sort().join("-")); }
    function openGroup(name) { switchRoom(name); }

    function showMarket() {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-market').classList.add('active');
        renderMarket();
    }

    // --- CHAT ---
    function sendMsg() {
        const i = document.getElementById('msg-in');
        if(!i.value) return;
        socket.emit('msg', {room: activeRoom, txt: i.value});
        i.value = '';
    }

    socket.on('chat-history', msgs => {
        const box = document.getElementById('msgs'); box.innerHTML = '';
        msgs.forEach(m => displayMsg(m));
    });

    socket.on('new-msg', m => { if(m.room === activeRoom) displayMsg(m); });

    function displayMsg(m) {
        const d = document.createElement('div');
        d.className = 'msg';
        d.style.borderLeftColor = m.rank.c;
        d.innerHTML = \`<b style="color:\${m.rank.c}; font-size:0.7rem">\${m.rank.n}</b><br>
                        <b>\${m.from}</b>: \${m.txt}\`;
        const box = document.getElementById('msgs');
        box.appendChild(d);
        box.scrollTop = box.scrollHeight;
    }

    // --- APPEL & MEDIA ---
    async function startCall() {
        document.getElementById('call-bar').classList.add('active');
        localStream = await navigator.mediaDevices.getUserMedia({audio: true, video: false});
    }

    function toggleMic() {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        document.getElementById('btn-mic').classList.toggle('on', audioTrack.enabled);
    }

    function toggleCam() {
        alert("Caméra non gérée dans cette démo sans serveur WebRTC complet");
    }

    async function startShare() {
        const stream = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: 60}});
        document.getElementById('v-remote').srcObject = stream;
    }

    function endCall() {
        document.getElementById('call-bar').classList.remove('active');
        if(localStream) localStream.getTracks().forEach(t => t.stop());
    }

    // --- MARKET ---
    function renderMarket() {
        const g = document.getElementById('market-grid'); g.innerHTML = '';
        ${JSON.stringify(MARKET_ITEMS)}.forEach(it => {
            const owned = me.inventory.includes(it.id);
            const d = document.createElement('div');
            d.style = "background:#1a1a1a; padding:20px; border-radius:15px; text-align:center; border:1px solid #333";
            d.innerHTML = \`<div style="height:50px; margin-bottom:15px; \${it.type==='frame'?it.style:''}">\${it.type==='banner'?'🖼️':''}</div>
                            <div style="font-weight:bold">\${it.name}</div>
                            <button class="btn-royal" style="width:100%; margin-top:15px" \${owned ? 'disabled' : ''} onclick="socket.emit('buy', '\${it.id}')">
                                \${owned ? 'ACQUIS' : it.price + ' 💎'}
                            </button>\`;
            g.appendChild(d);
        });
    }

    function createGroup() {
        const n = prompt("Nom du groupe :");
        if(n) socket.emit('create-group', n);
    }

    socket.on('update-user', u => { me = u; updateUI(); });
</script>
</body>
</html>
    `);
});

// --- SERVEUR ---
io.on("connection", (socket) => {
    socket.on('login', d => {
        let u = users.findOne({u: d.u});
        if(!u) u = users.insert({ u: d.u, p: d.p, gems: 500, xp: 0, friends: [], groups: [], inventory: [], avatar: '', banner: '', activeFrame: '' });
        else if(u.p !== d.p) return;
        socket.user = u.u;
        socket.emit('auth-success', u);
    });

    socket.on('get-history', room => {
        const history = messages.chain().find({room: room}).simplesort('ts').data();
        socket.emit('chat-history', history);
    });

    socket.on('msg', m => {
        const u = users.findOne({u: socket.user});
        if(!u) return;
        const rank = getRank(Math.floor(Math.sqrt(u.xp)/2)+1);
        const newMsg = { room: m.room, from: u.u, txt: m.txt, rank, ts: Date.now() };
        messages.insert(newMsg);
        u.xp += 5; users.update(u);
        io.emit('new-msg', newMsg);
        socket.emit('update-user', u);
    });

    socket.on('create-group', name => {
        const u = users.findOne({u: socket.user});
        if(u && !u.groups.includes(name)) {
            u.groups.push(name);
            users.update(u);
            socket.emit('update-user', u);
        }
    });

    socket.on('buy', id => {
        const u = users.findOne({u: socket.user});
        const it = MARKET_ITEMS.find(i => i.id === id);
        if(u && it && u.gems >= it.price && !u.inventory.includes(id)) {
            u.gems -= it.price;
            u.inventory.push(id);
            if(it.type === 'frame') u.activeFrame = it.style;
            if(it.type === 'banner') u.banner = it.url;
            users.update(u);
            socket.emit('update-user', u);
        }
    });
});

server.listen(3000);
