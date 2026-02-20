const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const loki = require("lokijs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e7 });

const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");
let messages = db.getCollection("messages") || db.addCollection("messages");

const MARKET_ITEMS = [
    { id: 'f_gold', name: 'Aura Dorée', price: 100, type: 'frame', style: 'box-shadow: 0 0 10px #d4af37; border: 2px solid #d4af37;' },
    { id: 'f_rgb', name: 'Chroma RGB', price: 250, type: 'frame', style: 'animation: rgb-anim 2s linear infinite; border: 2px solid;' }
];

function getRank(lvl) {
    if (lvl >= 50) return { n: "👑 EMPEREUR", c: "#ff0000" };
    if (lvl >= 10) return { n: "🔵 Chevalier", c: "#00aaff" };
    return { n: "🟢 Roturier", c: "#00ff00" };
}

app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Royal Palace V8 - Souveraineté</title>
    <style>
        :root { --gold: linear-gradient(135deg, #e6c27a 0%, #ffe5a3 50%, #c59b3d 100%); --gold-s: #d4af37; --bg: #050505; }
        body, html { margin:0; padding:0; font-family:'Segoe UI', sans-serif; background:var(--bg); color:white; height:100vh; overflow:hidden; }
        
        #auth-screen { position:fixed; inset:0; z-index:9999; background:var(--bg); display:flex; align-items:center; justify-content:center; }
        .auth-box { background:#111; padding:40px; border-radius:20px; border:1px solid var(--gold-s); width:300px; text-align:center; }
        
        #app { display:flex; height:100vh; width:100vw; }
        #sidebar { width:280px; background:#0d0d0d; border-right:1px solid #222; display:flex; flex-direction:column; }
        
        .nav-item { padding:12px 20px; cursor:pointer; opacity:0.6; display:flex; align-items:center; justify-content:space-between; transition:0.2s; }
        .nav-item.active { opacity:1; background:rgba(212,175,55,0.1); border-left:3px solid var(--gold-s); }
        .notif-badge { width:8px; height:8px; background:var(--gold-s); border-radius:50%; box-shadow: 0 0 8px var(--gold-s); }

        #main { flex:1; display:flex; flex-direction:column; background:#080808; }
        #msgs { flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:8px; }
        .msg { background:rgba(255,255,255,0.03); padding:10px 15px; border-radius:10px; max-width:80%; border-left:3px solid transparent; }

        .btn-royal { background:var(--gold); border:none; padding:10px 15px; border-radius:8px; font-weight:bold; cursor:pointer; }
        input { background:#151515; border:1px solid #333; color:white; padding:12px; border-radius:8px; width:100%; box-sizing:border-box; }
        
        #notif-panel { position:absolute; bottom:80px; left:10px; right:10px; background:#1a1a1a; border:1px solid var(--gold-s); border-radius:10px; padding:12px; display:none; z-index:100; box-shadow:0 10px 30px rgba(0,0,0,0.5); }
        
        #call-bar { height:0; overflow:hidden; background:#000; transition:0.3s; position:relative; }
        #call-bar.active { height:250px; }
    </style>
</head>
<body>

<div id="auth-screen">
    <div class="auth-box">
        <h2 style="color:var(--gold-s)">PALAIS ROYAL</h2>
        <input id="au" placeholder="Pseudo" style="margin-bottom:10px">
        <input id="ap" type="password" placeholder="Code" style="margin-bottom:20px">
        <button class="btn-royal" style="width:100%" onclick="auth()">ENTRER</button>
    </div>
</div>

<div id="app">
    <div id="sidebar">
        <div style="padding:25px; font-weight:bold; color:var(--gold-s); letter-spacing:1px;">⚜️ DYNASTIE V8</div>
        
        <div class="nav-item active" onclick="switchRoom('public', this)">🌍 Cour Publique</div>
        
        <div style="font-size:0.65rem; color:#444; padding:20px 20px 5px; text-transform:uppercase;">Groupes <button onclick="createGrp()" style="background:none; border:none; color:var(--gold-s); cursor:pointer">+</button></div>
        <div id="group-list"></div>

        <div style="font-size:0.65rem; color:#444; padding:20px 20px 5px; text-transform:uppercase;">Amis</div>
        <div id="friend-list"></div>
        <div style="padding:10px 20px;"><button class="btn-royal" style="width:100%; font-size:0.7rem" onclick="addFriend()">+ AJOUTER AMI</button></div>

        <div style="flex:1"></div>
        <div class="nav-item" onclick="showMarket()">🛒 Boutique</div>

        <div id="notif-panel">
            <div style="font-size:0.7rem; color:var(--gold-s); margin-bottom:10px; font-weight:bold;">DEMANDES EN ATTENTE</div>
            <div id="notif-list"></div>
        </div>

        <div id="user-footer" style="padding:15px; border-top:1px solid #222; cursor:pointer;" onclick="toggleNotifs()">
            <div style="display:flex; align-items:center; gap:12px">
                <div style="position:relative; width:42px; height:42px;">
                    <img id="my-av" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">
                    <div id="my-fr" style="position:absolute; inset:-4px; border-radius:50%; pointer-events:none;"></div>
                </div>
                <div style="flex:1">
                    <div id="my-name" style="font-weight:bold; font-size:0.85rem">...</div>
                    <div id="my-gems" style="color:var(--gold-s); font-size:0.7rem">💎 0</div>
                </div>
                <div id="notif-dot" class="notif-badge" style="display:none"></div>
            </div>
        </div>
    </div>

    <div id="main">
        <div id="view-chat" class="view" style="display:flex; flex:1; flex-direction:column;">
            <div id="call-bar">
                <video id="v-remote" autoplay style="width:100%; height:100%; object-fit:contain;"></video>
                <div style="position:absolute; bottom:15px; left:50%; transform:translateX(-50%); display:flex; gap:10px;">
                    <button id="mic-btn" class="btn-royal" onclick="toggleMic()">🎤 ON</button>
                    <button class="btn-royal" style="background:red" onclick="endCall()">Terminer</button>
                </div>
            </div>

            <div style="padding:15px 25px; border-bottom:1px solid #222; display:flex; justify-content:space-between; align-items:center;">
                <h3 id="room-title" style="margin:0">Cour Publique</h3>
                <button id="call-btn" class="btn-royal" style="display:none" onclick="startCall()">📞 Appel</button>
            </div>
            <div id="msgs"></div>
            <div style="padding:20px; display:flex; gap:10px; background:#0a0a0a">
                <input id="msg-in" placeholder="Votre message..." onkeypress="if(event.key==='Enter') send()">
                <button class="btn-royal" onclick="send()">➤</button>
            </div>
        </div>

        <div id="view-market" class="view" style="display:none; padding:40px;">
            <h2 style="color:var(--gold-s)">Boutique de Prestige</h2>
            <div id="market-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:20px;"></div>
            <button class="btn-royal" style="margin-top:30px" onclick="switchRoom('public')">Retour au Chat</button>
        </div>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    let me = null;
    let activeRoom = "public";
    let stream = null;

    // --- AUTH ---
    function auth() {
        const u = document.getElementById('au').value, p = document.getElementById('ap').value;
        if(u && p) {
            localStorage.setItem('royal_v8', JSON.stringify({u,p}));
            socket.emit('login', {u,p});
        }
    }
    const saved = localStorage.getItem('royal_v8');
    if(saved) socket.emit('login', JSON.parse(saved));

    socket.on('auth-success', u => {
        me = u; document.getElementById('auth-screen').style.display = 'none';
        updateUI();
    });

    // --- SOCIAL & UI ---
    function updateUI() {
        document.getElementById('my-name').innerText = me.u;
        document.getElementById('my-gems').innerText = "💎 " + me.gems;
        document.getElementById('my-av').src = me.avatar || 'https://ui-avatars.com/api/?name='+me.u;
        document.getElementById('my-fr').style = me.activeFrame || '';

        // Amis
        const fl = document.getElementById('friend-list'); fl.innerHTML = '';
        me.friends.forEach(f => {
            const d = document.createElement('div');
            d.className = 'nav-item'; d.innerText = '👤 ' + f;
            d.onclick = () => { activeRoom = [me.u, f].sort().join("-"); switchRoom(activeRoom); document.getElementById('room-title').innerText = f; };
            fl.appendChild(d);
        });

        // Groupes
        const gl = document.getElementById('group-list'); gl.innerHTML = '';
        me.groups.forEach(g => {
            const d = document.createElement('div');
            d.className = 'nav-item'; d.innerText = '🛡️ ' + g;
            d.onclick = () => { activeRoom = g; switchRoom(g); document.getElementById('room-title').innerText = g; };
            gl.appendChild(d);
        });

        // Notifs
        const nl = document.getElementById('notif-list'); nl.innerHTML = '';
        if(me.requests.length > 0) {
            document.getElementById('notif-dot').style.display = 'block';
            me.requests.forEach(r => {
                const d = document.createElement('div');
                d.style = "display:flex; justify-content:space-between; margin-bottom:8px; align-items:center;";
                d.innerHTML = \`<span>\${r}</span> <div>
                    <button class="btn-royal" style="padding:2px 8px" onclick="socket.emit('friend-answer', {from:'\${r}', accept:true})">✔</button>
                    <button class="btn-royal" style="padding:2px 8px; background:red" onclick="socket.emit('friend-answer', {from:'\${r}', accept:false})">✘</button>
                </div>\`;
                nl.appendChild(d);
            });
        } else {
            document.getElementById('notif-dot').style.display = 'none';
            nl.innerHTML = '<div style="font-size:0.7rem; opacity:0.5">Aucune demande</div>';
        }
    }

    function addFriend() { const p = prompt("Pseudo de l'ami :"); if(p) socket.emit('friend-request', p); }
    function createGrp() { const n = prompt("Nom du groupe :"); if(n) socket.emit('create-group', n); }
    function toggleNotifs() { const p = document.getElementById('notif-panel'); p.style.display = p.style.display === 'block' ? 'none' : 'block'; }

    // --- CHAT ---
    function switchRoom(room, el) {
        activeRoom = room;
        document.getElementById('view-market').style.display = 'none';
        document.getElementById('view-chat').style.display = 'flex';
        document.getElementById('call-btn').style.display = room === 'public' ? 'none' : 'block';
        if(room === 'public') document.getElementById('room-title').innerText = "Cour Publique";
        socket.emit('get-history', room);
    }

    function send() {
        const i = document.getElementById('msg-in');
        if(i.value) { socket.emit('msg', {room: activeRoom, txt: i.value}); i.value = ''; }
    }

    socket.on('chat-history', msgs => {
        const box = document.getElementById('msgs'); box.innerHTML = '';
        msgs.forEach(m => displayMsg(m));
    });

    socket.on('new-msg', m => { if(m.room === activeRoom) displayMsg(m); });

    function displayMsg(m) {
        const d = document.createElement('div');
        d.className = 'msg'; d.style.borderLeft = '3px solid ' + m.rank.c;
        d.innerHTML = \`<b style="color:\${m.rank.c}; font-size:0.7rem">\${m.rank.n}</b><br><b>\${m.from}</b>: \${m.txt}\`;
        document.getElementById('msgs').appendChild(d);
        document.getElementById('msgs').scrollTop = document.getElementById('msgs').scrollHeight;
    }

    // --- MARKET ---
    function showMarket() {
        document.getElementById('view-chat').style.display = 'none';
        document.getElementById('view-market').style.display = 'block';
        const g = document.getElementById('market-grid'); g.innerHTML = '';
        ${JSON.stringify(MARKET_ITEMS)}.forEach(it => {
            const owned = me.inventory.includes(it.id);
            const d = document.createElement('div');
            d.style = "background:#1a1a1a; padding:20px; border-radius:12px; text-align:center; border:1px solid #333";
            d.innerHTML = \`<div style="height:40px; margin-bottom:10px; \${it.style}"></div>
                            <div>\${it.name}</div>
                            <button class="btn-royal" style="width:100%; margin-top:10px" \${owned?'disabled':''} onclick="socket.emit('buy','\${it.id}')">
                                \${owned?'POSSÉDÉ':it.price+' 💎'}
                            </button>\`;
            g.appendChild(d);
        });
    }

    // --- CALLS ---
    async function startCall() {
        document.getElementById('call-bar').classList.add('active');
        stream = await navigator.mediaDevices.getUserMedia({audio:true, video:false});
    }
    function toggleMic() {
        const t = stream.getAudioTracks()[0]; t.enabled = !t.enabled;
        document.getElementById('mic-btn').innerText = t.enabled ? "🎤 ON" : "🎤 MUTE";
    }
    function endCall() {
        document.getElementById('call-bar').classList.remove('active');
        if(stream) stream.getTracks().forEach(t => t.stop());
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
        if(!u) u = users.insert({ u: d.u, p: d.p, gems: 500, xp: 0, friends: [], requests: [], groups: [], inventory: [], avatar: '', activeFrame: '' });
        else if(u.p !== d.p) return;
        socket.user = u.u;
        socket.join(u.u); // Pour les notifications privées
        socket.emit('auth-success', u);
    });

    socket.on('get-history', room => {
        const h = messages.chain().find({room: room}).simplesort('ts').data();
        socket.emit('chat-history', h);
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

    // Diplomatie : Demande d'ami
    socket.on('friend-request', name => {
        const target = users.findOne({u: name});
        if(target && name !== socket.user && !target.requests.includes(socket.user) && !target.friends.includes(socket.user)) {
            target.requests.push(socket.user);
            users.update(target);
            io.to(name).emit('update-user', target);
        }
    });

    // Diplomatie : Réponse
    socket.on('friend-answer', d => {
        const me = users.findOne({u: socket.user});
        const sender = users.findOne({u: d.from});
        me.requests = me.requests.filter(r => r !== d.from);
        if(d.accept && sender) {
            if(!me.friends.includes(d.from)) me.friends.push(d.from);
            if(!sender.friends.includes(socket.user)) sender.friends.push(socket.user);
            users.update(sender);
            io.to(d.from).emit('update-user', sender);
        }
        users.update(me);
        socket.emit('update-user', me);
    });

    socket.on('create-group', n => {
        const u = users.findOne({u: socket.user});
        if(u && !u.groups.includes(n)) { u.groups.push(n); users.update(u); socket.emit('update-user', u); }
    });

    socket.on('buy', id => {
        const u = users.findOne({u: socket.user});
        const it = MARKET_ITEMS.find(i => i.id === id);
        if(u && it && u.gems >= it.price && !u.inventory.includes(id)) {
            u.gems -= it.price; u.inventory.push(id);
            if(it.type === 'frame') u.activeFrame = it.style;
            users.update(u); socket.emit('update-user', u);
        }
    });
});

server.listen(3000);
