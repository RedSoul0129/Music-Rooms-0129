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
    <title>Royal Palace - Entrée</title>
    <style>
        :root { --gold: linear-gradient(135deg, #e6c27a 0%, #ffe5a3 50%, #c59b3d 100%); --gold-s: #d4af37; --dark: #0a0a0a; }
        body, html { margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; background: #050505; color: white; height: 100vh; overflow: hidden; }
        
        /* AUTH UI */
        #auth-screen { 
            position: fixed; inset: 0; z-index: 9999; 
            background: radial-gradient(circle at center, #1a1a1a 0%, #050505 100%);
            display: flex; align-items: center; justify-content: center;
            transition: transform 0.8s cubic-bezier(0.87, 0, 0.13, 1);
        }
        .auth-card {
            background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(10px);
            padding: 40px; border-radius: 20px; border: 1px solid rgba(212, 175, 55, 0.3);
            width: 350px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }
        .auth-tabs { display: flex; margin-bottom: 25px; border-bottom: 1px solid #333; }
        .tab { flex: 1; padding: 10px; cursor: pointer; opacity: 0.5; transition: 0.3s; font-weight: bold; }
        .tab.active { opacity: 1; color: var(--gold-s); border-bottom: 2px solid var(--gold-s); }

        /* MAIN APP UI */
        #app-interface { display: flex; height: 100vh; width: 100vw; }
        #sidebar { width: 280px; background: #111; border-right: 1px solid #222; display: flex; flex-direction: column; }
        .nav-link { padding: 15px 25px; cursor: pointer; opacity: 0.6; transition: 0.2s; display: flex; align-items: center; gap: 10px; }
        .nav-link.active { opacity: 1; background: rgba(212, 175, 55, 0.1); color: var(--gold-s); border-left: 4px solid var(--gold-s); }

        /* COMMON ELEMENTS */
        .btn-royal { 
            background: var(--gold); border: none; padding: 12px; border-radius: 8px; 
            font-weight: bold; cursor: pointer; width: 100%; transition: 0.3s;
        }
        .btn-royal:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(212, 175, 55, 0.3); }
        input { 
            background: rgba(0,0,0,0.3); border: 1px solid #333; color: white; 
            padding: 12px; border-radius: 8px; width: 100%; margin-bottom: 15px; box-sizing: border-box;
        }
        .view { display: none; flex: 1; flex-direction: column; background: #0d0d0d; }
        .view.active { display: flex; }
        
        /* SCROLLBAR */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }

        /* ANIMS */
        @keyframes rgb-anim { 0% { border-color: red; } 33% { border-color: green; } 66% { border-color: blue; } 100% { border-color: red; } }
    </style>
</head>
<body>

<div id="auth-screen">
    <div class="auth-card">
        <h1 style="color:var(--gold-s); margin-bottom: 10px; letter-spacing: 3px;">ROYAL PALACE</h1>
        <p style="font-size: 0.8rem; opacity: 0.6; margin-bottom: 30px;">L'élite vous attend.</p>
        
        <div class="auth-tabs">
            <div id="tab-login" class="tab active" onclick="setAuthMode('login')">Connexion</div>
            <div id="tab-signup" class="tab" onclick="setAuthMode('signup')">Inscription</div>
        </div>

        <input id="auth-user" placeholder="Nom de Noble">
        <input id="auth-pass" type="password" placeholder="Clé Secrète">
        <button class="btn-royal" id="auth-btn" onclick="handleAuth()">ENTRER AU PALAIS</button>
        <p id="auth-error" style="color: #ff4444; font-size: 0.8rem; margin-top: 15px; display: none;"></p>
    </div>
</div>

<div id="app-interface">
    <div id="sidebar">
        <div style="padding: 30px 25px;">
            <div style="font-weight: 900; color: var(--gold-s); font-size: 1.2rem;">⚜️ DYNASTIE</div>
        </div>

        <div class="nav-link active" onclick="switchTab('chat-public', this)"><span>🌍</span> Cour Publique</div>
        <div class="nav-link" onclick="switchTab('market', this)"><span>🛒</span> Marché</div>
        <div class="nav-link" onclick="switchTab('profile', this)"><span>⚙️</span> Profil</div>

        <div style="font-size: 0.7rem; color: #444; padding: 20px 25px 5px; text-transform: uppercase;">Amis</div>
        <div id="friend-list" style="flex: 1; overflow-y: auto;"></div>
        <div style="padding: 15px;">
            <button class="btn-royal" style="font-size: 0.7rem;" onclick="addFriend()">+ AJOUTER UN AMI</button>
        </div>

        <div id="user-footer" style="padding: 20px; border-top: 1px solid #222; background-size: cover; position: relative;">
            <div style="display: flex; align-items: center; gap: 12px; position: relative; z-index: 2;">
                <div style="position: relative; width: 45px; height: 45px;">
                    <img id="my-av" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                    <div id="my-fr" style="position: absolute; inset: -4px; border-radius: 50%; pointer-events: none;"></div>
                </div>
                <div>
                    <div id="my-name" style="font-weight: bold; font-size: 0.9rem;">...</div>
                    <div id="my-gem" style="color: var(--gold-s); font-size: 0.75rem; font-weight: bold;">💎 0</div>
                </div>
            </div>
        </div>
    </div>

    <main style="flex: 1; display: flex; flex-direction: column;">
        <div id="view-chat-public" class="view active">
            <div style="padding: 20px; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center;">
                <h3 id="chat-title" style="margin:0">Cour Publique</h3>
                <button id="call-btn" class="btn-royal" style="width: auto; padding: 8px 20px; display: none;" onclick="startCall()">📞 Appel Groupe</button>
            </div>
            
            <div id="call-view" style="height: 300px; background: #000; display: none; border-bottom: 2px solid var(--gold-s); position: relative;">
                <video id="remote-vid" autoplay playsinline style="width: 100%; height: 100%;"></video>
                <div style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px;">
                    <button class="btn-royal" style="width: auto;" onclick="screenshare()">🖥️ 60FPS</button>
                    <button class="btn-royal" style="width: auto; background: #ff4444;" onclick="endCall()">Terminer</button>
                </div>
            </div>

            <div id="msgs" style="flex: 1; overflow-y: auto; padding: 25px;"></div>
            
            <div style="padding: 20px; background: #111; display: flex; gap: 15px;">
                <input id="msg-in" style="margin: 0;" placeholder="Votre message..." onkeypress="if(event.key==='Enter') sendMsg()">
                <button class="btn-royal" style="width: 60px;" onclick="sendMsg()">➤</button>
            </div>
        </div>

        <div id="view-market" class="view" style="padding: 30px;">
            <h2 style="color: var(--gold-s);">Marchand du Palais</h2>
            <div id="market-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px;"></div>
        </div>

        <div id="view-profile" class="view" style="padding: 30px;">
            <h2 style="color: var(--gold-s);">Vôtre Noblesse</h2>
            <div style="max-width: 400px; display: flex; flex-direction: column; gap: 20px;">
                <div><label>URL Avatar</label><input id="inp-av"></div>
                <div><label>URL Bannière</label><input id="inp-ba"></div>
                <button class="btn-royal" onclick="saveProfile()">Mettre à jour</button>
                <button class="btn-royal" style="background: #333; color: white;" onclick="logout()">Se déconnecter</button>
            </div>
        </div>
    </main>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    let authMode = 'login';
    let user = null;
    let room = 'public';

    // --- LOGIQUE AUTH ---
    function setAuthMode(m) {
        authMode = m;
        document.getElementById('tab-login').className = m === 'login' ? 'tab active' : 'tab';
        document.getElementById('tab-signup').className = m === 'signup' ? 'tab active' : 'tab';
        document.getElementById('auth-btn').innerText = m === 'login' ? 'ENTRER AU PALAIS' : 'CRÉER MON COMPTE';
    }

    function handleAuth() {
        const u = document.getElementById('auth-user').value;
        const p = document.getElementById('auth-pass').value;
        if(!u || !p) return showError("Champs requis !");
        socket.emit(authMode, {u, p});
    }

    function showError(txt) {
        const err = document.getElementById('auth-error');
        err.innerText = txt; err.style.display = 'block';
    }

    socket.on('auth-success', data => {
        user = data;
        localStorage.setItem('royal_v5', JSON.stringify({u: data.u, p: data.p}));
        document.getElementById('auth-screen').style.transform = 'translateY(-100%)';
        updateUI();
    });

    socket.on('auth-error', txt => showError(txt));

    // Auto-login
    const saved = localStorage.getItem('royal_v5');
    if(saved) socket.emit('login', JSON.parse(saved));

    function logout() {
        localStorage.removeItem('royal_v5');
        location.reload();
    }

    // --- UI & CHAT ---
    function updateUI() {
        document.getElementById('my-name').innerText = user.u;
        document.getElementById('my-gem').innerText = "💎 " + user.gems;
        document.getElementById('my-av').src = user.avatar || 'https://ui-avatars.com/api/?name='+user.u;
        document.getElementById('my-fr').style = user.activeFrame || '';
        document.getElementById('user-footer').style.backgroundImage = user.banner ? \`linear-gradient(rgba(0,0,0,0.8), rgba(0,0,0,0.8)), url(\${user.banner})\` : '';
        
        renderFriends();
        renderMarket();
    }

    function switchTab(t, el) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        
        if(t.startsWith('chat-')) {
            room = t.split('-')[1];
            document.getElementById('view-chat-public').classList.add('active');
            document.getElementById('chat-title').innerText = room === 'public' ? "Cour Publique" : "Salon: " + room;
            document.getElementById('call-btn').style.display = room === 'public' ? 'none' : 'block';
            document.getElementById('msgs').innerHTML = '';
        } else {
            document.getElementById('view-' + t).classList.add('active');
        }
        if(el) el.classList.add('active');
    }

    function sendMsg() {
        const i = document.getElementById('msg-in');
        if(!i.value) return;
        socket.emit('msg', {room, txt: i.value});
        i.value = '';
    }

    socket.on('new-msg', m => {
        if(m.room !== room) return;
        const d = document.createElement('div');
        d.style = "margin-bottom: 15px; animation: fadeIn 0.3s forwards;";
        d.innerHTML = \`<span style="font-size: 0.6rem; background:\${m.rank.c}; color:black; padding:2px 5px; border-radius:3px; margin-right:8px; font-weight:bold;">\${m.rank.n}</span> 
                        <b style="color:var(--gold-s)">\${m.from}</b>: \${m.txt}\`;
        const ms = document.getElementById('msgs');
        ms.appendChild(d);
        ms.scrollTop = ms.scrollHeight;
    });

    // --- MARKET ---
    function renderMarket() {
        const g = document.getElementById('market-grid'); g.innerHTML = '';
        ${JSON.stringify(MARKET_ITEMS)}.forEach(it => {
            const owned = user.inventory.includes(it.id);
            const d = document.createElement('div');
            d.style = "background:#1a1a1a; padding:20px; border-radius:12px; text-align:center; border: 1px solid #333";
            d.innerHTML = \`<div style="height:40px; margin-bottom:10px; \${it.type==='frame'?it.style:''}">\${it.type==='banner'?'🖼️':''}</div>
                            <div style="font-weight:bold; font-size:0.9rem">\${it.name}</div>
                            <button class="btn-royal" style="margin-top:10px" \${owned ? 'disabled' : ''} onclick="socket.emit('buy', '\${it.id}')">
                                \${owned ? 'DÉJÀ ACQUIS' : it.price + ' 💎'}
                            </button>\`;
            g.appendChild(d);
        });
    }

    // --- AMIS ---
    function addFriend() {
        const f = prompt("Pseudo de l'ami :");
        if(f) socket.emit('add-friend', f);
    }

    function renderFriends() {
        const c = document.getElementById('friend-list'); c.innerHTML = '';
        user.friends.forEach(f => {
            const d = document.createElement('div');
            d.className = 'nav-link';
            d.innerHTML = '👤 ' + f;
            d.onclick = () => switchTab('chat-' + f, d);
            c.appendChild(d);
        });
    }

    // --- PROFILE ---
    function saveProfile() {
        socket.emit('update-profile', {
            avatar: document.getElementById('inp-av').value,
            banner: document.getElementById('inp-ba').value
        });
        alert("Modifications enregistrées !");
    }

    // --- APPEL & SHARE 60FPS ---
    async function startCall() { document.getElementById('call-view').style.display = 'block'; }
    async function screenshare() {
        const s = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: 60}});
        document.getElementById('remote-vid').srcObject = s;
    }
    function endCall() {
        document.getElementById('call-view').style.display = 'none';
        const s = document.getElementById('remote-vid').srcObject;
        if(s) s.getTracks().forEach(t => t.stop());
    }

    socket.on('update-user', u => { user = u; updateUI(); });
</script>
</body>
</html>
    `);
});

// --- SERVEUR ---
io.on("connection", (socket) => {
    // INSCRIPTION
    socket.on('signup', d => {
        if(users.findOne({u: d.u})) return socket.emit('auth-error', "Ce nom est déjà pris par un autre Noble.");
        const u = users.insert({ u: d.u, p: d.p, gems: 500, xp: 0, friends: [], inventory: [], avatar: '', banner: '', activeFrame: '' });
        socket.user = u.u;
        socket.emit('auth-success', u);
    });

    // CONNEXION
    socket.on('login', d => {
        const u = users.findOne({u: d.u});
        if(!u) return socket.emit('auth-error', "Ce Noble n'existe pas.");
        if(u.p !== d.p) return socket.emit('auth-error', "La clé secrète est incorrecte.");
        socket.user = u.u;
        socket.emit('auth-success', u);
    });

    socket.on('msg', m => {
        const u = users.findOne({u: socket.user});
        if(!u) return;
        u.xp += 5; users.update(u);
        const lvl = Math.floor(Math.sqrt(u.xp)/2)+1;
        io.emit('new-msg', { room: m.room, from: u.u, txt: m.txt, rank: getRank(lvl) });
    });

    socket.on('add-friend', name => {
        const u = users.findOne({u: socket.user});
        if(users.findOne({u: name}) && !u.friends.includes(name)) {
            u.friends.push(name); users.update(u);
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
});

server.listen(3000, () => console.log("Le Palais est ouvert sur http://localhost:3000"));
