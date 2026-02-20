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
let messages = db.getCollection("messages") || db.addCollection("messages");

// --- CONFIG DU SHOP ---
const MARKET_ITEMS = [
    { id: 'frame_gold', name: 'Aura Dorée', price: 100, type: 'frame', style: 'box-shadow: 0 0 10px #d4af37, inset 0 0 5px #d4af37; border: 2px solid #d4af37;' },
    { id: 'frame_rgb', name: 'Chroma RGB', price: 250, type: 'frame', style: 'animation: rgb-anim 2s linear infinite; border: 2px solid;' },
    { id: 'banner_royal', name: 'Bannière Royale', price: 50, type: 'banner', url: 'https://images.unsplash.com/photo-1519751138087-5bf79df62d5b?w=500' }
];

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Royal Palace - Connexion Stable</title>
    <style>
        :root { --gold: linear-gradient(135deg, #e6c27a 0%, #ffe5a3 50%, #c59b3d 100%); --gold-s: #d4af37; --dark: #0a0a0a; --card: #151515; --text: #f1f1f1; }
        
        @keyframes rgb-anim { 0% { border-color: red; } 33% { border-color: green; } 66% { border-color: blue; } 100% { border-color: red; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

        body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
        
        /* MODAL CONNEXION */
        #auth-overlay { position: fixed; inset: 0; background: var(--dark); z-index: 9999; display: flex; align-items: center; justify-content: center; }
        .auth-box { background: var(--card); padding: 30px; border-radius: 15px; border: 1px solid var(--gold-s); text-align: center; width: 300px; }

        /* UI */
        .btn-royal { background: var(--gold); color: black; padding: 10px 15px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .btn-royal:hover { transform: scale(1.02); }
        input { background: #222; border: 1px solid #444; color: white; padding: 10px; border-radius: 8px; width: 100%; margin-bottom: 10px; box-sizing: border-box; }

        #sidebar { width: 280px; background: var(--card); border-right: 1px solid #222; display: flex; flex-direction: column; }
        .nav-link { padding: 15px 20px; cursor: pointer; transition: 0.3s; font-weight: 500; opacity: 0.7; }
        .nav-link.active { opacity: 1; color: var(--gold-s); background: rgba(255,255,255,0.03); border-left: 3px solid var(--gold-s); }

        .view { display: none; flex: 1; animation: fadeIn 0.3s ease-out; flex-direction: column; }
        .view.active { display: flex; }

        .gem-counter { background: rgba(0,0,0,0.4); border: 1px solid var(--gold-s); padding: 4px 12px; border-radius: 20px; color: var(--gold-s); font-size: 0.9rem; }
        
        /* CALL OVERLAY */
        #call-ui { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 5000; display: none; flex-direction: column; align-items: center; justify-content: center; }
        #screen-view { width: 80%; border: 2px solid var(--gold-s); border-radius: 10px; background: #000; }

        .market-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 20px; }
        .item-card { background: #1a1a1a; padding: 15px; border-radius: 10px; text-align: center; border: 1px solid #333; }
        
        .avatar-container { position: relative; width: 45px; height: 45px; }
        .frame-display { position: absolute; inset: -4px; border-radius: 50%; pointer-events: none; }
    </style>
</head>
<body>

<div id="auth-overlay">
    <div class="auth-box">
        <h2 style="color:var(--gold-s); margin-top:0">PALAIS ROYAL</h2>
        <input id="login-u" placeholder="Nom de noble">
        <input id="login-p" type="password" placeholder="Mot de passe">
        <button class="btn-royal" style="width:100%" onclick="login()">ENTRER</button>
    </div>
</div>

<div id="call-ui">
    <video id="screen-view" autoplay playsinline></video>
    <div style="margin-top:20px; display:flex; gap:10px">
        <button id="mute-btn" class="btn-royal" onclick="toggleMute()">🎤 Micro ON</button>
        <button class="btn-royal" onclick="shareScreen()">🖥️ Partage 60 FPS</button>
        <button class="btn-royal" style="background:red; color:white" onclick="stopCall()">Quitter</button>
    </div>
</div>

<div id="ad-modal" style="position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:10000; display:none; align-items:center; justify-content:center;">
    <div class="auth-box" style="width:350px">
        <h3 style="color:var(--gold-s)">ANNONCE DU PALAIS</h3>
        <p>Le saviez-vous ? Plus vous parlez, plus vous gagnez en influence au Palais !</p>
        <button class="btn-royal" onclick="finishAd()">Fermer et gagner 10 💎</button>
    </div>
</div>

<div id="sidebar">
    <div style="padding:20px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:bold; color:var(--gold-s)">🔱 ELITE</span>
        <div class="gem-counter">💎 <span id="gem-val">0</span></div>
    </div>
    
    <div class="nav-link active" onclick="switchTab('chat', this)">💬 Salon Noble</div>
    <div class="nav-link" onclick="switchTab('market', this)">🛒 Marché Noir</div>
    <div class="nav-link" onclick="switchTab('quests', this)">🎯 Défis</div>
    
    <div style="flex:1"></div>

    <div id="user-bar" style="padding:15px; border-top:1px solid #222; display:flex; align-items:center; gap:12px; background-size:cover;">
        <div class="avatar-container">
            <img id="my-avatar" src="" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">
            <div id="my-frame" class="frame-display"></div>
        </div>
        <div style="flex:1">
            <div id="my-name" style="font-weight:bold; font-size:0.9rem">...</div>
            <div style="font-size:0.7rem; color:#aaa; cursor:pointer" onclick="logout()">Se déconnecter</div>
        </div>
    </div>
</div>

<div id="main-content" style="flex:1; display:flex; flex-direction:column;">
    <div id="tab-chat" class="view active">
        <div style="padding:15px; border-bottom:1px solid #222; display:flex; justify-content:space-between; align-items:center">
            <h3 style="margin:0">Palais Général</h3>
            <button class="btn-royal" onclick="startCallUI()">📞 Appel</button>
        </div>
        <div id="msgs" style="flex:1; overflow-y:auto; padding:20px;"></div>
        <div style="padding:15px; display:flex; gap:10px">
            <input id="msg-in" placeholder="Votre message..." style="margin:0" onkeypress="if(event.key==='Enter') send()">
            <button class="btn-royal" onclick="send()">➤</button>
        </div>
    </div>

    <div id="tab-market" class="view">
        <h2 style="padding:20px; color:var(--gold-s); margin:0">Boutique de Cosmétiques</h2>
        <div class="market-grid" id="market-list"></div>
    </div>

    <div id="tab-quests" class="view">
        <h2 style="padding:20px; color:var(--gold-s); margin:0">Quêtes Quotidiennes</h2>
        <div style="padding:20px">
            <div class="item-card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px">
                <div style="text-align:left"><b>Bonus Quotidien</b><br><small>+50 Gemmes par jour</small></div>
                <button class="btn-royal" onclick="socket.emit('claim-daily')">Réclamer</button>
            </div>
            <div class="item-card" style="display:flex; justify-content:space-between; align-items:center">
                <div style="text-align:left"><b>Regarder l'annonce</b><br><small>Soutien au Palais</small></div>
                <button class="btn-royal" onclick="document.getElementById('ad-modal').style.display='flex'">Voir (+10 💎)</button>
            </div>
        </div>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    let localStream;

    // --- GESTION CONNEXION ---
    window.onload = () => {
        const saved = localStorage.getItem('royal_session');
        if(saved) {
            const {u, p} = JSON.parse(saved);
            socket.emit('login', {u, p});
        }
    };

    function login() {
        const u = document.getElementById('login-u').value;
        const p = document.getElementById('login-p').value;
        if(!u || !p) return alert("Remplis tout !");
        localStorage.setItem('royal_session', JSON.stringify({u, p}));
        socket.emit('login', {u, p});
    }

    function logout() {
        localStorage.removeItem('royal_session');
        location.reload();
    }

    socket.on('auth-success', data => {
        document.getElementById('auth-overlay').style.display = 'none';
        updateProfileUI(data);
    });

    socket.on('auth-error', err => {
        alert(err);
        localStorage.removeItem('royal_session');
        document.getElementById('auth-overlay').style.display = 'flex';
    });

    // --- NAVIGATION ---
    function switchTab(tab, el) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.getElementById('tab-' + tab).classList.add('active');
        el.classList.add('active');
    }

    // --- MARKET ---
    const items = ${JSON.stringify(MARKET_ITEMS)};
    const mList = document.getElementById('market-list');
    items.forEach(it => {
        const d = document.createElement('div');
        d.className = 'item-card';
        d.innerHTML = \`
            <div style="height:40px; margin-bottom:10px; \${it.type==='frame'?it.style:''}">\${it.type==='banner'?'🖼️':''}</div>
            <div style="font-weight:bold; font-size:0.8rem">\${it.name}</div>
            <button class="btn-royal" style="width:100%; margin-top:10px; font-size:0.7rem" onclick="socket.emit('buy', '\${it.id}')">\${it.price} 💎</button>
        \`;
        mList.appendChild(d);
    });

    function finishAd() {
        document.getElementById('ad-modal').style.display = 'none';
        socket.emit('watch-ad');
    }

    // --- CALLS ---
    async function startCallUI() {
        document.getElementById('call-ui').style.display = 'flex';
        localStream = await navigator.mediaDevices.getUserMedia({audio: true});
    }

    async function shareScreen() {
        const stream = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: 60}});
        document.getElementById('screen-view').srcObject = stream;
    }

    function toggleMute() {
        const track = localStream.getAudioTracks()[0];
        track.enabled = !track.enabled;
        document.getElementById('mute-btn').innerText = track.enabled ? "🎤 Micro ON" : "🔇 Micro OFF";
    }

    function stopCall() {
        if(localStream) localStream.getTracks().forEach(t => t.stop());
        document.getElementById('call-ui').style.display = 'none';
    }

    // --- UI UPDATES ---
    socket.on('update-user', data => updateProfileUI(data));

    function updateProfileUI(u) {
        document.getElementById('gem-val').innerText = u.gems;
        document.getElementById('my-name').innerText = u.u;
        document.getElementById('my-avatar').src = u.avatar || 'https://ui-avatars.com/api/?name='+u.u;
        document.getElementById('my-frame').style = u.activeFrame || '';
        if(u.banner) {
            document.getElementById('user-bar').style.backgroundImage = \`linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url(\${u.banner})\`;
        }
    }

    function send() {
        const inp = document.getElementById('msg-in');
        if(!inp.value) return;
        socket.emit('msg', inp.value);
        inp.value = '';
    }

    socket.on('new-msg', m => {
        const d = document.createElement('div');
        d.style.marginBottom = "10px";
        d.innerHTML = \`<b style="color:var(--gold-s)">\${m.from}:</b> \${m.txt}\`;
        document.getElementById('msgs').appendChild(d);
        document.getElementById('msgs').scrollTop = document.getElementById('msgs').scrollHeight;
    });
</script>
</body>
</html>
`);
});

// --- LOGIQUE SERVEUR ---
io.on("connection", (socket) => {
    socket.on('login', d => {
        let u = users.findOne({u: d.u});
        if(!u) {
            u = users.insert({u: d.u, p: d.p, gems: 50, lastDaily: 0, activeFrame: '', banner: '', avatar: ''});
        } else if(u.p !== d.p) {
            return socket.emit('auth-error', "Mauvais mot de passe !");
        }
        socket.user = u.u;
        socket.emit('auth-success', u);
    });

    socket.on('buy', itemId => {
        const u = users.findOne({u: socket.user});
        const item = MARKET_ITEMS.find(i => i.id === itemId);
        if(u && item && u.gems >= item.price) {
            u.gems -= item.price;
            if(item.type === 'frame') u.activeFrame = item.style;
            if(item.type === 'banner') u.banner = item.url;
            users.update(u);
            socket.emit('update-user', u);
        }
    });

    socket.on('claim-daily', () => {
        const u = users.findOne({u: socket.user});
        const now = Date.now();
        if(now - u.lastDaily > 86400000) {
            u.gems += 50;
            u.lastDaily = now;
            users.update(u);
            socket.emit('update-user', u);
        }
    });

    socket.on('watch-ad', () => {
        const u = users.findOne({u: socket.user});
        u.gems += 10;
        users.update(u);
        socket.emit('update-user', u);
    });

    socket.on('msg', txt => {
        io.emit('new-msg', {from: socket.user, txt});
    });
});

server.listen(3000, () => console.log("Prêt sur http://localhost:3000"));
