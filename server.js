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

const MARKET_ITEMS = [
    { id: 'f_gold', name: 'Aura Dorée', price: 100, type: 'frame', style: 'box-shadow: 0 0 10px #d4af37; border: 2px solid #d4af37;' },
    { id: 'f_rgb', name: 'Chroma RGB', price: 250, type: 'frame', style: 'animation: rgb-anim 2s linear infinite; border: 2px solid;' },
    { id: 'b_castle', name: 'Donjon Noir', price: 150, type: 'banner', url: 'https://images.unsplash.com/photo-1505832018823-50331d70d237?w=800' }
];

function getRank(lvl) {
    if (lvl >= 50) return { n: "👑 EMPEREUR", c: "#ff0000" };
    if (lvl >= 30) return { n: "🟠 Comte", c: "#ffaa00" };
    if (lvl >= 10) return { n: "🔵 Chevalier", c: "#00aaff" };
    return { n: "🟢 Roturier", c: "#00ff00" };
}

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Royal Palace V4 - Social</title>
    <style>
        :root { --gold: linear-gradient(135deg, #e6c27a 0%, #ffe5a3 50%, #c59b3d 100%); --gold-s: #d4af37; --dark: #0a0a0a; --card: #151515; }
        @keyframes rgb-anim { 0% { border-color: red; } 33% { border-color: green; } 66% { border-color: blue; } 100% { border-color: red; } }
        @keyframes adProgress { from { width: 0%; } to { width: 100%; } }
        
        body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: white; margin: 0; display: flex; height: 100vh; overflow: hidden; }
        
        /* SIDEBAR */
        #sidebar { width: 260px; background: var(--card); border-right: 1px solid #222; display: flex; flex-direction: column; }
        .nav-link { padding: 12px 20px; cursor: pointer; opacity: 0.6; font-size: 0.9rem; transition: 0.2s; }
        .nav-link.active { opacity: 1; color: var(--gold-s); border-left: 3px solid var(--gold-s); background: rgba(255,255,255,0.02); }
        .section-title { font-size: 0.7rem; color: #555; padding: 20px 20px 5px; text-transform: uppercase; font-weight: bold; }

        /* VIEWS */
        .view { display: none; flex: 1; flex-direction: column; background: #0d0d0d; }
        .view.active { display: flex; }

        /* CHAT & CALL */
        #msgs { flex: 1; overflow-y: auto; padding: 20px; }
        .msg { margin-bottom: 10px; padding: 8px 12px; border-radius: 8px; background: #1a1a1a; width: fit-content; max-width: 80%; }
        #call-area { height: 250px; background: #000; display: none; position: relative; border-bottom: 2px solid var(--gold-s); }
        video { width: 100%; height: 100%; object-fit: contain; }

        /* AD MODAL */
        #ad-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 10000; display: none; align-items: center; justify-content: center; }
        .ad-content { background: var(--card); padding: 40px; border-radius: 20px; border: 1px solid var(--gold-s); text-align: center; width: 400px; }
        .ad-bar { width: 100%; height: 8px; background: #333; border-radius: 4px; margin: 20px 0; overflow: hidden; }
        .ad-fill { height: 100%; background: var(--gold); width: 0%; }
        .ad-fill.active { animation: adProgress 5s linear forwards; }

        /* UI ELEMENTS */
        .btn-royal { background: var(--gold); border: none; padding: 10px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; }
        .btn-royal:disabled { background: #333; color: #777; cursor: not-allowed; }
        input { background: #1a1a1a; border: 1px solid #333; color: white; padding: 10px; border-radius: 6px; }
        .badge { font-size: 0.6rem; padding: 2px 5px; border-radius: 3px; font-weight: bold; margin-right: 5px; border: 1px solid; }
        
        #user-profile-bar { padding: 15px; border-top: 1px solid #222; background-size: cover; background-position: center; }
    </style>
</head>
<body>

<div id="ad-modal">
    <div class="ad-content">
        <h2 style="color:var(--gold-s)">ANNOUCO ROYALE</h2>
        <p>Le Palais s'agrandit... patience, Noble.</p>
        <div class="ad-bar"><div id="ad-fill" class="ad-fill"></div></div>
        <button id="ad-close" class="btn-royal" style="display:none" onclick="finishAd()">Réclamer 10 💎</button>
    </div>
</div>

<div id="sidebar">
    <div style="padding:20px; color:var(--gold-s); font-weight:900; letter-spacing:2px">ROYAL V4</div>
    
    <div class="section-title">Principal</div>
    <div class="nav-link active" onclick="switchTab('chat-public', this)">🌍 Cour Publique</div>
    <div class="nav-link" onclick="switchTab('market', this)">🛒 Marché</div>
    <div class="nav-link" onclick="switchTab('profile', this)">⚙️ Mon Profil</div>

    <div class="section-title">Amis & Groupes</div>
    <div id="friend-list"></div>
    <div style="padding:10px 20px;"><button class="btn-royal" style="width:100%; font-size:0.7rem;" onclick="addFriend()">+ Ajouter Ami</button></div>

    <div style="flex:1"></div>

    <div id="user-profile-bar">
        <div style="display:flex; align-items:center; gap:10px;">
            <div style="position:relative; width:40px; height:40px;">
                <img id="my-av" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">
                <div id="my-fr" style="position:absolute; inset:-3px; border-radius:50%; pointer-events:none;"></div>
            </div>
            <div>
                <div id="my-name" style="font-weight:bold; font-size:0.8rem">...</div>
                <div id="my-gem" style="font-size:0.7rem; color:var(--gold-s)">💎 0</div>
            </div>
        </div>
    </div>
</div>

<div id="main" style="flex:1; display:flex;">
    <div id="view-chat" class="view active">
        <div id="call-area">
            <video id="remote-video" autoplay playsinline></video>
            <div style="position:absolute; bottom:10px; right:10px; display:flex; gap:5px">
                <button class="btn-royal" onclick="startScreenShare()">🖥️ Share 60FPS</button>
                <button class="btn-royal" style="background:red" onclick="stopCall()">Quitter</button>
            </div>
        </div>
        <div style="padding:15px; border-bottom:1px solid #222; display:flex; justify-content:space-between">
            <h3 id="chat-title" style="margin:0">Cour Publique</h3>
            <button id="call-btn" class="btn-royal" style="display:none" onclick="initiateCall()">📞 Appel Groupe</button>
        </div>
        <div id="msgs"></div>
        <div style="padding:20px; display:flex; gap:10px; background:#111">
            <input id="msg-in" style="flex:1" placeholder="Votre message..." onkeypress="if(event.key==='Enter') send()">
            <button class="btn-royal" onclick="send()">➤</button>
        </div>
    </div>

    <div id="view-market" class="view">
        <h2 style="padding:20px; color:var(--gold-s)">Boutique Royale</h2>
        <div id="market-items" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:15px; padding:20px"></div>
        <div style="padding:20px; border-top:1px solid #222">
            <button class="btn-royal" onclick="showAd()">Voir une annonce (+10 💎)</button>
        </div>
    </div>

    <div id="view-profile" class="view">
        <h2 style="padding:20px; color:var(--gold-s)">Personnalisation</h2>
        <div style="padding:20px; display:flex; flex-direction:column; gap:15px; max-width:400px">
            <label>Lien Avatar (URL image)</label>
            <input id="set-av" placeholder="https://...">
            <label>Lien Bannière (URL image)</label>
            <input id="set-ba" placeholder="https://...">
            <button class="btn-royal" onclick="saveProfile()">Enregistrer les modifications</button>
        </div>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    let currentUser = null;
    let activeRoom = "public";

    // --- AUTH & INITIALISATION ---
    const saved = localStorage.getItem('royal_v4');
    if(saved) socket.emit('login', JSON.parse(saved));
    else {
        const u = prompt("Pseudo :"), p = prompt("Mdp :");
        if(u && p) { localStorage.setItem('royal_v4', JSON.stringify({u,p})); socket.emit('login', {u,p}); }
    }

    socket.on('auth-success', u => { currentUser = u; updateUI(); });
    socket.on('update-user', u => { currentUser = u; updateUI(); });

    function updateUI() {
        document.getElementById('my-name').innerText = currentUser.u;
        document.getElementById('my-gem').innerText = "💎 " + currentUser.gems;
        document.getElementById('my-av').src = currentUser.avatar || 'https://ui-avatars.com/api/?name='+currentUser.u;
        document.getElementById('my-fr').style = currentUser.activeFrame || '';
        document.getElementById('user-profile-bar').style.backgroundImage = currentUser.banner ? \`linear-gradient(rgba(0,0,0,0.8), rgba(0,0,0,0.8)), url(\${currentUser.banner})\` : '';
        
        renderMarket();
        renderFriends();
    }

    // --- NAVIGATION ---
    function switchTab(viewId, el) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        if(viewId.startsWith('chat')) {
            document.getElementById('view-chat').classList.add('active');
            activeRoom = viewId === 'chat-public' ? 'public' : viewId.split('-')[1];
            document.getElementById('chat-title').innerText = viewId === 'chat-public' ? "Cour Publique" : "Privé: " + activeRoom;
            document.getElementById('call-btn').style.display = activeRoom === 'public' ? 'none' : 'block';
            document.getElementById('msgs').innerHTML = ''; // Nettoyer pour la nouvelle room
        } else {
            document.getElementById('view-' + viewId).classList.add('active');
        }
        if(el) el.classList.add('active');
    }

    // --- SOCIAL ---
    function addFriend() {
        const f = prompt("Nom de l'ami :");
        if(f) socket.emit('add-friend', f);
    }

    function renderFriends() {
        const container = document.getElementById('friend-list');
        container.innerHTML = '';
        currentUser.friends.forEach(f => {
            const d = document.createElement('div');
            d.className = 'nav-link';
            d.innerHTML = '👤 ' + f;
            d.onclick = () => switchTab('chat-' + f, d);
            container.appendChild(d);
        });
    }

    // --- CHAT ---
    function send() {
        const i = document.getElementById('msg-in');
        if(!i.value) return;
        socket.emit('msg', { room: activeRoom, txt: i.value });
        i.value = '';
    }

    socket.on('new-msg', m => {
        if(m.room !== activeRoom) return;
        const d = document.createElement('div');
        d.className = 'msg';
        d.innerHTML = \`<span class="badge" style="color:\${m.rank.c}; border-color:\${m.rank.c}">\${m.rank.n}</span> <b>\${m.from}</b>: \${m.txt}\`;
        document.getElementById('msgs').appendChild(d);
        document.getElementById('msgs').scrollTop = document.getElementById('msgs').scrollHeight;
    });

    // --- MARKET ---
    function renderMarket() {
        const container = document.getElementById('market-items');
        container.innerHTML = '';
        ${JSON.stringify(MARKET_ITEMS)}.forEach(it => {
            const owned = currentUser.inventory.includes(it.id);
            const div = document.createElement('div');
            div.style = "background:#222; padding:15px; border-radius:10px; text-align:center";
            div.innerHTML = \`
                <div style="height:40px; margin-bottom:10px; \${it.type==='frame'?it.style:''}">\${it.type==='banner'?'🖼️':''}</div>
                <div style="font-weight:bold; font-size:0.8rem">\${it.name}</div>
                <button class="btn-royal" style="width:100%; margin-top:10px" \${owned ? 'disabled' : ''} onclick="socket.emit('buy', '\${it.id}')">
                    \${owned ? 'POSSÉDÉ' : it.price + ' 💎'}
                </button>\`;
            container.appendChild(div);
        });
    }

    // --- PROFILE ---
    function saveProfile() {
        const av = document.getElementById('set-av').value;
        const ba = document.getElementById('set-ba').value;
        socket.emit('update-profile', { avatar: av, banner: ba });
        alert("Profil mis à jour !");
    }

    // --- ANNONCE ANIMÉE ---
    function showAd() {
        const modal = document.getElementById('ad-modal');
        const fill = document.getElementById('ad-fill');
        const closeBtn = document.getElementById('ad-close');
        modal.style.display = 'flex';
        fill.classList.add('active');
        closeBtn.style.display = 'none';
        setTimeout(() => { closeBtn.style.display = 'block'; }, 5000);
    }

    function finishAd() {
        socket.emit('watch-ad');
        document.getElementById('ad-modal').style.display = 'none';
        document.getElementById('ad-fill').classList.remove('active');
    }

    // --- CALL & SCREENSHARE 60FPS ---
    async function initiateCall() {
        document.getElementById('call-area').style.display = 'block';
    }

    async function startScreenShare() {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: 60, max: 60 } },
                audio: true
            });
            document.getElementById('remote-video').srcObject = stream;
        } catch(e) { console.error(e); }
    }

    function stopCall() {
        document.getElementById('call-area').style.display = 'none';
        const stream = document.getElementById('remote-video').srcObject;
        if(stream) stream.getTracks().forEach(t => t.stop());
    }
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
        if(!u) u = users.insert({ u: d.u, p: d.p, gems: 200, xp: 0, friends: [], inventory: [], avatar: '', banner: '', activeFrame: '' });
        else if(u.p !== d.p) return;
        socket.user = u.u;
        socket.emit('auth-success', u);
    });

    socket.on('msg', m => {
        const u = users.findOne({u: socket.user});
        if(!u) return;

        // XP System
        const now = Date.now();
        if(now - (xpCooldowns.get(u.u) || 0) > 10000) {
            u.xp += 10; users.update(u);
            xpCooldowns.set(u.u, now);
            socket.emit('update-user', u);
        }

        const lvl = Math.floor(Math.sqrt(u.xp)/2)+1;
        io.emit('new-msg', { room: m.room, from: u.u, txt: m.txt, rank: getRank(lvl) });
    });

    socket.on('add-friend', name => {
        const u = users.findOne({u: socket.user});
        const target = users.findOne({u: name});
        if(target && !u.friends.includes(name)) {
            u.friends.push(name);
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

    socket.on('update-profile', d => {
        const u = users.findOne({u: socket.user});
        if(u) {
            u.avatar = d.avatar || u.avatar;
            u.banner = d.banner || u.banner;
            users.update(u);
            socket.emit('update-user', u);
        }
    });

    socket.on('watch-ad', () => {
        const u = users.findOne({u: socket.user});
        if(u) { u.gems += 10; users.update(u); socket.emit('update-user', u); }
    });
});

server.listen(3000);
