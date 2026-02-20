const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const loki = require("lokijs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e7 }); 

const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");

const MARKET_ITEMS = [
    { id: 'frame_gold', name: 'Aura Dorée', price: 100, type: 'frame', style: 'box-shadow: 0 0 10px #d4af37, inset 0 0 5px #d4af37; border: 2px solid #d4af37;' },
    { id: 'frame_rgb', name: 'Chroma RGB', price: 250, type: 'frame', style: 'animation: rgb-anim 2s linear infinite; border: 2px solid;' }
];

// Fonction pour obtenir le titre et la couleur selon le niveau
function getRankInfo(lvl) {
    if (lvl >= 50) return { name: "👑 EMPEREUR", color: "#ff0000" };
    if (lvl >= 40) return { name: "🔴 Duc", color: "#ff4444" };
    if (lvl >= 30) return { name: "🟠 Comte", color: "#ffaa00" };
    if (lvl >= 20) return { name: "🟣 Baron", color: "#aa00ff" };
    if (lvl >= 10) return { name: "🔵 Chevalier", color: "#00aaff" };
    return { name: "🟢 Roturier", color: "#00ff00" };
}

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Royal Palace - Dynastie</title>
    <style>
        :root { --gold: linear-gradient(135deg, #e6c27a 0%, #ffe5a3 50%, #c59b3d 100%); --gold-s: #d4af37; --dark: #080808; --card: #121212; --text: #f1f1f1; }
        @keyframes rgb-anim { 0% { border-color: red; } 33% { border-color: green; } 66% { border-color: blue; } 100% { border-color: red; } }
        body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
        
        /* SIDEBAR */
        #sidebar { width: 280px; background: var(--card); border-right: 1px solid #222; display: flex; flex-direction: column; }
        .nav-link { padding: 15px 20px; cursor: pointer; transition: 0.2s; opacity: 0.6; }
        .nav-link.active { opacity: 1; color: var(--gold-s); background: rgba(255,255,255,0.03); border-left: 4px solid var(--gold-s); }

        /* PROGRESS */
        .xp-bar-container { width: 100%; height: 6px; background: #222; border-radius: 10px; margin-top: 8px; }
        #xp-progress { height: 100%; background: var(--gold); width: 0%; border-radius: 10px; transition: 0.5s; }
        
        /* CHAT */
        #msgs { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        .msg-line { background: rgba(255,255,255,0.02); padding: 10px; border-radius: 8px; border-left: 3px solid transparent; }
        .rank-tag { font-size: 0.65rem; font-weight: 900; text-transform: uppercase; padding: 2px 5px; border-radius: 3px; margin-right: 8px; vertical-align: middle; border: 1px solid; }

        .btn-royal { background: var(--gold); color: black; padding: 10px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; }
        input { background: #1a1a1a; border: 1px solid #333; color: white; padding: 12px; border-radius: 8px; width: 100%; box-sizing: border-box; }

        .view { display: none; flex: 1; flex-direction: column; }
        .view.active { display: flex; }
    </style>
</head>
<body>

<div id="sidebar">
    <div style="padding:25px; text-align:center;">
        <h2 style="color:var(--gold-s); margin:0; letter-spacing:2px;">ROYAL</h2>
        <div style="font-size:0.8rem; margin-top:5px; color:#aaa;">💎 <span id="gem-val">0</span> Gemmes</div>
    </div>
    
    <div class="nav-link active" onclick="switchTab('chat', this)">💬 Salon de la Cour</div>
    <div class="nav-link" onclick="switchTab('market', this)">🛒 Marché Royal</div>
    <div class="nav-link" onclick="switchTab('quests', this)">🎯 Quêtes</div>

    <div style="flex:1"></div>

    <div id="user-bar" style="padding:20px; border-top:1px solid #222; background: rgba(0,0,0,0.2);">
        <div style="display:flex; align-items:center; gap:12px">
            <div style="position:relative; width:45px; height:45px;">
                <img id="my-avatar" src="" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">
                <div id="my-frame" style="position:absolute; inset:-4px; border-radius:50%; pointer-events:none;"></div>
            </div>
            <div>
                <div id="my-name" style="font-weight:bold; font-size:0.9rem;">...</div>
                <div id="my-rank" style="font-size:0.7rem; font-weight:bold;">Titre</div>
            </div>
        </div>
        <div class="xp-bar-container"><div id="xp-progress"></div></div>
    </div>
</div>

<div id="main-content" style="flex:1; display:flex;">
    <div id="tab-chat" class="view active">
        <div id="msgs"></div>
        <div style="padding:20px; background:rgba(0,0,0,0.3); display:flex; gap:10px;">
            <input id="msg-in" placeholder="Exprimez-vous, Noble..." onkeypress="if(event.key==='Enter') send()">
            <button class="btn-royal" onclick="send()">➤</button>
        </div>
    </div>

    <div id="tab-market" class="view">
        <h2 style="padding:25px; color:var(--gold-s);">Boutique de Prestige</h2>
        <div id="market-list" style="display:grid; grid-template-columns:1fr 1fr; gap:15px; padding:20px;"></div>
    </div>

    <div id="tab-quests" class="view">
        <h2 style="padding:25px; color:var(--gold-s);">Collecte de Ressources</h2>
        <div style="padding:20px">
            <button class="btn-royal" style="width:100%; margin-bottom:15px;" onclick="socket.emit('claim-daily')">Réclamer Revenus (50 💎)</button>
            <button class="btn-royal" style="width:100%;" onclick="socket.emit('watch-ad')">Soutenir le Palais (10 💎)</button>
        </div>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();

    // Persistance session
    const saved = localStorage.getItem('royal_v3');
    if(saved) socket.emit('login', JSON.parse(saved));
    else {
        const u = prompt("Choisissez un nom de Noble :");
        const p = prompt("Créez un mot de passe :");
        if(u && p) {
            localStorage.setItem('royal_v3', JSON.stringify({u,p}));
            socket.emit('login', {u,p});
        }
    }

    socket.on('auth-success', u => updateUI(u));
    socket.on('update-user', u => updateUI(u));

    function updateUI(u) {
        document.getElementById('gem-val').innerText = u.gems;
        document.getElementById('my-name').innerText = u.u;
        document.getElementById('my-avatar').src = 'https://ui-avatars.com/api/?background=random&color=fff&name='+u.u;
        document.getElementById('my-frame').style = u.activeFrame || '';
        
        // Calcul Niveau et Titre
        const lvl = Math.floor(Math.sqrt(u.xp || 0) / 2) + 1;
        const rank = getRankJS(lvl);
        
        const rankEl = document.getElementById('my-rank');
        rankEl.innerText = rank.name + " (Lvl " + lvl + ")";
        rankEl.style.color = rank.color;

        // Barre d'XP
        const nextXP = Math.pow(lvl * 2, 2);
        const currentXP = Math.pow((lvl-1) * 2, 2);
        const percent = ((u.xp - currentXP) / (nextXP - currentXP)) * 100;
        document.getElementById('xp-progress').style.width = percent + '%';
    }

    function getRankJS(lvl) {
        if (lvl >= 50) return { name: "👑 EMPEREUR", color: "#ff0000" };
        if (lvl >= 40) return { name: "🔴 Duc", color: "#ff4444" };
        if (lvl >= 30) return { name: "🟠 Comte", color: "#ffaa00" };
        if (lvl >= 20) return { name: "🟣 Baron", color: "#aa00ff" };
        if (lvl >= 10) return { name: "🔵 Chevalier", color: "#00aaff" };
        return { name: "🟢 Roturier", color: "#00ff00" };
    }

    function switchTab(t, el) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.getElementById('tab-'+t).classList.add('active');
        el.classList.add('active');
    }

    function send() {
        const i = document.getElementById('msg-in');
        if(i.value.trim()) { socket.emit('msg', i.value); i.value = ''; }
    }

    socket.on('new-msg', m => {
        const d = document.createElement('div');
        d.className = 'msg-line';
        d.style.borderLeftColor = m.rank.color;
        d.innerHTML = \`<span class="rank-tag" style="color:\${m.rank.color}; border-color:\${m.rank.color}">\${m.rank.name}</span> 
                        <b style="color:var(--gold-s)">\${m.from}</b>: \${m.txt}\`;
        const ms = document.getElementById('msgs');
        ms.appendChild(d);
        ms.scrollTop = ms.scrollHeight;
    });

    // Market
    const mList = document.getElementById('market-list');
    ${JSON.stringify(MARKET_ITEMS)}.forEach(it => {
        const d = document.createElement('div');
        d.style = "background:#1a1a1a; padding:20px; border-radius:12px; text-align:center; border:1px solid #333;";
        d.innerHTML = \`<div style="height:40px; margin-bottom:15px; border-radius:50%; \${it.style}"></div>
                        <div style="font-weight:bold; font-size:0.9rem;">\${it.name}</div>
                        <button class="btn-royal" style="width:100%; margin-top:10px;" onclick="socket.emit('buy','\${it.id}')">\${it.price} 💎</button>\`;
        mList.appendChild(d);
    });
</script>
</body>
</html>
`);
});

// --- LOGIQUE SERVEUR ---
const xpCooldowns = new Map();

io.on("connection", (socket) => {
    socket.on('login', d => {
        let u = users.findOne({u: d.u});
        if(!u) u = users.insert({u: d.u, p: d.p, gems: 100, xp: 0, lastDaily: 0, activeFrame: ''});
        else if(u.p !== d.p) return;
        socket.user = u.u;
        socket.emit('auth-success', u);
    });

    socket.on('msg', txt => {
        const u = users.findOne({u: socket.user});
        if(!u) return;

        // Gain XP Anti-spam (10 sec)
        const now = Date.now();
        const lastXP = xpCooldowns.get(socket.user) || 0;
        if(now - lastXP > 10000) { 
            u.xp += 10;
            users.update(u);
            xpCooldowns.set(socket.user, now);
            socket.emit('update-user', u);
        }

        const lvl = Math.floor(Math.sqrt(u.xp || 0) / 2) + 1;
        const rank = getRankInfo(lvl);
        io.emit('new-msg', {from: u.u, txt, rank: rank});
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
        if(!u) return;
        const now = Date.now();
        if(now - u.lastDaily > 86400000) {
            u.gems += 50; u.lastDaily = now;
            users.update(u); socket.emit('update-user', u);
        } else {
            socket.emit('alert', "Revenez demain !");
        }
    });

    socket.on('watch-ad', () => {
        const u = users.findOne({u: socket.user});
        if(u) { u.gems += 10; users.update(u); socket.emit('update-user', u); }
    });
});

server.listen(3000, () => console.log("Dynastie lancée sur http://localhost:3000"));
