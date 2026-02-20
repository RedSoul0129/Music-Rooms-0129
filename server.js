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

const MARKET_ITEMS = [
    { id: 'frame_gold', name: 'Aura Dorée', price: 100, type: 'frame', style: 'box-shadow: 0 0 10px #d4af37, inset 0 0 5px #d4af37; border: 2px solid #d4af37;' },
    { id: 'frame_rgb', name: 'Chroma RGB', price: 250, type: 'frame', style: 'animation: rgb-anim 2s linear infinite; border: 2px solid;' }
];

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Royal Palace - Progression</title>
    <style>
        :root { --gold: linear-gradient(135deg, #e6c27a 0%, #ffe5a3 50%, #c59b3d 100%); --gold-s: #d4af37; --dark: #0a0a0a; --card: #151515; --text: #f1f1f1; }
        
        @keyframes rgb-anim { 0% { border-color: red; } 33% { border-color: green; } 66% { border-color: blue; } 100% { border-color: red; } }
        body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
        
        /* AUTH */
        #auth-overlay { position: fixed; inset: 0; background: var(--dark); z-index: 9999; display: flex; align-items: center; justify-content: center; }
        .auth-box { background: var(--card); padding: 30px; border-radius: 15px; border: 1px solid var(--gold-s); text-align: center; width: 300px; }

        /* UI */
        .btn-royal { background: var(--gold); color: black; padding: 10px 15px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; }
        input { background: #222; border: 1px solid #444; color: white; padding: 10px; border-radius: 8px; width: 100%; margin-bottom: 10px; box-sizing: border-box; }

        #sidebar { width: 280px; background: var(--card); border-right: 1px solid #222; display: flex; flex-direction: column; }
        .nav-link { padding: 15px 20px; cursor: pointer; transition: 0.3s; }
        .nav-link.active { color: var(--gold-s); background: rgba(255,255,255,0.03); border-left: 3px solid var(--gold-s); }

        .view { display: none; flex: 1; flex-direction: column; height: 100%; }
        .view.active { display: flex; }

        /* LEVEL SYSTEM */
        .xp-bar-container { width: 100%; height: 6px; background: #333; border-radius: 3px; margin-top: 5px; overflow: hidden; }
        #xp-progress { height: 100%; background: var(--gold); width: 0%; transition: width 0.5s ease; }
        .lvl-badge { background: var(--gold); color: black; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; margin-right: 8px; }

        #msgs { flex: 1; overflow-y: auto; padding: 20px; }
        .msg-line { margin-bottom: 8px; animation: fadeIn 0.2s; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        
        .avatar-container { position: relative; width: 45px; height: 45px; flex-shrink: 0; }
        .frame-display { position: absolute; inset: -4px; border-radius: 50%; pointer-events: none; }
    </style>
</head>
<body>

<div id="auth-overlay">
    <div class="auth-box">
        <h2 style="color:var(--gold-s)">CONNEXION ROYALE</h2>
        <input id="login-u" placeholder="Pseudo">
        <input id="login-p" type="password" placeholder="Code secret">
        <button class="btn-royal" style="width:100%" onclick="login()">SE CONNECTER</button>
    </div>
</div>

<div id="sidebar">
    <div style="padding:20px; display:flex; justify-content:space-between;">
        <span style="font-weight:bold; color:var(--gold-s)">🔱 PALAIS</span>
        <div style="color:var(--gold-s)">💎 <span id="gem-val">0</span></div>
    </div>
    
    <div class="nav-link active" onclick="switchTab('chat', this)">💬 Chat Public</div>
    <div class="nav-link" onclick="switchTab('market', this)">🛒 Boutique</div>
    <div class="nav-link" onclick="switchTab('quests', this)">🎯 Quêtes</div>
    
    <div style="flex:1"></div>

    <div id="user-bar" style="padding:15px; border-top:1px solid #222;">
        <div style="display:flex; align-items:center; gap:12px">
            <div class="avatar-container">
                <img id="my-avatar" src="" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">
                <div id="my-frame" class="frame-display"></div>
            </div>
            <div style="flex:1">
                <div id="my-name" style="font-weight:bold; font-size:0.9rem">...</div>
                <div style="font-size:0.7rem; color:var(--gold-s)">Niveau <span id="my-lvl">1</span></div>
            </div>
        </div>
        <div class="xp-bar-container"><div id="xp-progress"></div></div>
    </div>
</div>

<div id="main-content" style="flex:1; display:flex;">
    <div id="tab-chat" class="view active">
        <div id="msgs"></div>
        <div style="padding:15px; display:flex; gap:10px">
            <input id="msg-in" placeholder="Envoyer un message..." onkeypress="if(event.key==='Enter') send()">
            <button class="btn-royal" onclick="send()">➤</button>
        </div>
    </div>

    <div id="tab-market" class="view">
        <h2 style="padding:20px; color:var(--gold-s)">Marchand de cosmétiques</h2>
        <div id="market-list" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; padding:20px"></div>
    </div>

    <div id="tab-quests" class="view">
        <h2 style="padding:20px; color:var(--gold-s)">Gagner des gemmes</h2>
        <div style="padding:20px">
            <button class="btn-royal" style="width:100%; margin-bottom:10px" onclick="socket.emit('claim-daily')">Récompense Quotidienne (+50 💎)</button>
            <button class="btn-royal" style="width:100%" onclick="alert('Simulation Pub'); socket.emit('watch-ad')">Regarder Pub (+10 💎)</button>
        </div>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();

    function login() {
        const u = document.getElementById('login-u').value;
        const p = document.getElementById('login-p').value;
        if(u && p) {
            localStorage.setItem('royal_s', JSON.stringify({u, p}));
            socket.emit('login', {u, p});
        }
    }

    // Auto-login
    const saved = localStorage.getItem('royal_s');
    if(saved) socket.emit('login', JSON.parse(saved));

    socket.on('auth-success', u => {
        document.getElementById('auth-overlay').style.display = 'none';
        updateUI(u);
    });

    function updateUI(u) {
        document.getElementById('gem-val').innerText = u.gems;
        document.getElementById('my-name').innerText = u.u;
        document.getElementById('my-avatar').src = 'https://ui-avatars.com/api/?name='+u.u;
        document.getElementById('my-frame').style = u.activeFrame || '';
        
        // Calcul Niveau (Exemple: XP / 100)
        const lvl = Math.floor(Math.sqrt(u.xp || 0) / 2) + 1;
        document.getElementById('my-lvl').innerText = lvl;
        
        // Barre d'XP (Progression vers le prochain niveau)
        const nextXP = Math.pow(lvl * 2, 2);
        const currentXP = Math.pow((lvl-1) * 2, 2);
        const percent = ((u.xp - currentXP) / (nextXP - currentXP)) * 100;
        document.getElementById('xp-progress').style.width = percent + '%';
    }

    function switchTab(t, el) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.getElementById('tab-'+t).classList.add('active');
        el.classList.add('active');
    }

    function send() {
        const i = document.getElementById('msg-in');
        if(i.value) { socket.emit('msg', i.value); i.value = ''; }
    }

    socket.on('new-msg', m => {
        const d = document.createElement('div');
        d.className = 'msg-line';
        d.innerHTML = \`<span class="lvl-badge">Lvl \${m.lvl}</span> <b>\${m.from}:</b> \${m.txt}\`;
        const ms = document.getElementById('msgs');
        ms.appendChild(d);
        ms.scrollTop = ms.scrollHeight;
    });

    socket.on('update-user', u => updateUI(u));

    // Shop Init
    const mList = document.getElementById('market-list');
    ${JSON.stringify(MARKET_ITEMS)}.forEach(it => {
        const d = document.createElement('div');
        d.style = "background:#222; padding:15px; border-radius:10px; text-align:center";
        d.innerHTML = \`<div style="height:30px; margin-bottom:10px; \${it.style}"></div>
                        <small>\${it.name}</small><br>
                        <button class="btn-royal" style="font-size:0.7rem; margin-top:5px" onclick="socket.emit('buy','\${it.id}')">\${it.price} 💎</button>\`;
        mList.appendChild(d);
    });
</script>
</body>
</html>
`);
});

// --- SERVEUR ---
const xpCooldowns = new Map();

io.on("connection", (socket) => {
    socket.on('login', d => {
        let u = users.findOne({u: d.u});
        if(!u) u = users.insert({u: d.u, p: d.p, gems: 50, xp: 0, lastDaily: 0, activeFrame: ''});
        socket.user = u.u;
        socket.emit('auth-success', u);
    });

    socket.on('msg', txt => {
        const u = users.findOne({u: socket.user});
        if(!u) return;

        // Gain XP avec anti-spam (1 fois toutes les 10 sec)
        const now = Date.now();
        const lastXP = xpCooldowns.get(socket.user) || 0;
        if(now - lastXP > 10000) { 
            u.xp += 10;
            users.update(u);
            xpCooldowns.set(socket.user, now);
            socket.emit('update-user', u);
        }

        const lvl = Math.floor(Math.sqrt(u.xp || 0) / 2) + 1;
        io.emit('new-msg', {from: u.u, txt, lvl: lvl});
    });

    socket.on('buy', id => {
        const u = users.findOne({u: socket.user});
        const it = MARKET_ITEMS.find(i => i.id === id);
        if(u && it && u.gems >= it.price) {
            u.gems -= it.price;
            u.activeFrame = it.style;
            users.update(u);
            socket.emit('update-user', u);
        }
    });

    socket.on('claim-daily', () => {
        const u = users.findOne({u: socket.user});
        if(Date.now() - u.lastDaily > 86400000) {
            u.gems += 50; u.lastDaily = Date.now();
            users.update(u); socket.emit('update-user', u);
        }
    });

    socket.on('watch-ad', () => {
        const u = users.findOne({u: socket.user});
        u.gems += 10; users.update(u); socket.emit('update-user', u);
    });
});

server.listen(3000);
