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
    { id: 'f_gold', name: 'Aura Dorée', price: 100, type: 'frame', style: 'box-shadow: 0 0 10px #d4af37; border: 2px solid #d4af37;' },
    { id: 'f_rgb', name: 'Chroma RGB', price: 250, type: 'frame', style: 'animation: rgb-anim 2s linear infinite; border: 2px solid;' }
];

function getRank(lvl) {
    if (lvl >= 50) return { n: "👑 EMPEREUR", c: "#ff0000" };
    if (lvl >= 10) return { n: "🔵 Chevalier", c: "#00aaff" };
    return { n: "🟢 Roturier", c: "#00ff00" };
}

// Utilitaire pour créer un ID de salle privée unique pour 2 personnes
const getPrivateRoom = (u1, u2) => [u1, u2].sort().join("-");

app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Royal Palace V6 - Diplomatie</title>
    <style>
        :root { --gold: linear-gradient(135deg, #e6c27a 0%, #ffe5a3 50%, #c59b3d 100%); --gold-s: #d4af37; }
        body, html { margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; background: #050505; color: white; height: 100vh; overflow: hidden; }
        
        #auth-screen { position: fixed; inset: 0; z-index: 9999; background: #050505; display: flex; align-items: center; justify-content: center; transition: 0.8s ease-in-out; }
        .auth-card { background: #111; padding: 40px; border-radius: 20px; border: 1px solid var(--gold-s); width: 320px; text-align: center; }
        
        #app-interface { display: flex; height: 100vh; width: 100vw; }
        #sidebar { width: 280px; background: #0d0d0d; border-right: 1px solid #222; display: flex; flex-direction: column; }
        
        .nav-link { padding: 12px 20px; cursor: pointer; opacity: 0.6; display: flex; align-items: center; justify-content: space-between; border-left: 3px solid transparent; }
        .nav-link.active { opacity: 1; background: rgba(212, 175, 55, 0.1); border-left-color: var(--gold-s); }
        .notif-dot { width: 8px; height: 8px; background: var(--gold-s); border-radius: 50%; box-shadow: 0 0 5px var(--gold-s); }

        #msgs { flex: 1; overflow-y: auto; padding: 20px; }
        .msg { margin-bottom: 12px; background: #151515; padding: 10px; border-radius: 8px; border-left: 3px solid transparent; width: fit-content; max-width: 85%; }
        
        .btn-royal { background: var(--gold); border: none; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .btn-royal:hover { transform: scale(1.02); }
        input { background: #1a1a1a; border: 1px solid #333; color: white; padding: 10px; border-radius: 6px; width: 100%; box-sizing: border-box; margin-bottom: 10px; }

        .view { display: none; flex: 1; flex-direction: column; }
        .view.active { display: flex; }

        /* NOTIF PANEL */
        #notif-panel { position: absolute; bottom: 80px; left: 10px; right: 10px; background: #1a1a1a; border: 1px solid var(--gold-s); border-radius: 10px; padding: 10px; display: none; z-index: 100; }
    </style>
</head>
<body>

<div id="auth-screen">
    <div class="auth-card">
        <h2 style="color:var(--gold-s)">PALAIS ROYAL</h2>
        <input id="auth-u" placeholder="Pseudo">
        <input id="auth-p" type="password" placeholder="Clé Secrète">
        <div style="display:flex; gap:10px;">
            <button class="btn-royal" style="flex:1" onclick="auth('login')">Connexion</button>
            <button class="btn-royal" style="flex:1; background:#333; color:white" onclick="auth('signup')">S'inscrire</button>
        </div>
    </div>
</div>

<div id="app-interface">
    <div id="sidebar">
        <div style="padding: 25px; color: var(--gold-s); font-weight: bold; font-size: 1.2rem;">ROYAL V6</div>
        
        <div class="nav-link active" onclick="switchTab('public', this)">🌍 Cour Publique</div>
        
        <div style="font-size: 0.7rem; color: #444; padding: 15px 20px 5px; text-transform: uppercase;">Amis</div>
        <div id="friend-list"></div>
        <div style="padding: 10px 20px;"><button class="btn-royal" style="width:100%; font-size:0.7rem;" onclick="reqFriend()">+ AJOUTER</button></div>

        <div style="flex:1"></div>

        <div id="notif-panel">
            <div style="font-size:0.7rem; margin-bottom:5px; color:var(--gold-s)">DEMANDES D'AMIS :</div>
            <div id="notif-list"></div>
        </div>

        <div id="user-footer" style="padding: 15px; border-top: 1px solid #222; cursor:pointer;" onclick="toggleNotifs()">
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="position:relative; width:40px; height:40px;">
                    <img id="my-av" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">
                    <div id="my-fr" style="position:absolute; inset:-3px; border-radius:50%; pointer-events:none;"></div>
                </div>
                <div style="flex:1">
                    <div id="my-name" style="font-weight:bold; font-size:0.8rem">...</div>
                    <div id="my-gem" style="font-size:0.7rem; color:var(--gold-s)">💎 0</div>
                </div>
                <div id="notif-badge" class="notif-dot" style="display:none"></div>
            </div>
        </div>
    </div>

    <main style="flex:1; display:flex; flex-direction:column;">
        <div id="chat-header" style="padding: 15px 25px; border-bottom: 1px solid #222; display:flex; justify-content:space-between; align-items:center;">
            <h3 id="room-name" style="margin:0">Cour Publique</h3>
            <button id="call-btn" class="btn-royal" style="display:none" onclick="startCall()">📞 Appel</button>
        </div>

        <div id="call-ui" style="height:250px; background:#000; display:none; border-bottom:2px solid var(--gold-s);">
             <video id="v-remote" autoplay style="width:100%; height:100%; object-fit:contain;"></video>
        </div>

        <div id="msgs"></div>

        <div style="padding:20px; background:#111; display:flex; gap:10px;">
            <input id="msg-in" style="margin:0" placeholder="Votre message..." onkeypress="if(event.key==='Enter') send()">
            <button class="btn-royal" onclick="send()">➤</button>
        </div>
    </main>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    let me = null;
    let activeRoom = "public";

    // --- AUTH ---
    function auth(mode) {
        const u = document.getElementById('auth-u').value;
        const p = document.getElementById('auth-p').value;
        socket.emit(mode, {u, p});
    }

    socket.on('auth-success', u => {
        me = u;
        localStorage.setItem('royal_v6', JSON.stringify({u: u.u, p: u.p}));
        document.getElementById('auth-screen').style.transform = 'translateY(-100%)';
        updateUI();
    });

    socket.on('auth-error', t => alert(t));

    // Auto-login
    const saved = localStorage.getItem('royal_v6');
    if(saved) socket.emit('login', JSON.parse(saved));

    function updateUI() {
        document.getElementById('my-name').innerText = me.u;
        document.getElementById('my-gem').innerText = "💎 " + me.gems;
        document.getElementById('my-av').src = me.avatar || 'https://ui-avatars.com/api/?name='+me.u;
        document.getElementById('my-fr').style = me.activeFrame || '';
        
        // Liste d'amis
        const fl = document.getElementById('friend-list'); fl.innerHTML = '';
        me.friends.forEach(f => {
            const d = document.createElement('div');
            d.className = 'nav-link';
            d.innerHTML = '👤 ' + f;
            d.onclick = () => openPrivate(f, d);
            fl.appendChild(d);
        });

        // Notifications
        const nl = document.getElementById('notif-list'); nl.innerHTML = '';
        if(me.requests.length > 0) {
            document.getElementById('notif-badge').style.display = 'block';
            me.requests.forEach(r => {
                const d = document.createElement('div');
                d.style = "display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.8rem; align-items:center;";
                d.innerHTML = \`<span>\${r}</span>
                               <div>
                                 <button class="btn-royal" style="padding:2px 5px" onclick="socket.emit('friend-answer', {from:'\${r}', accept:true})">✔</button>
                                 <button class="btn-royal" style="padding:2px 5px; background:red" onclick="socket.emit('friend-answer', {from:'\${r}', accept:false})">✘</button>
                               </div>\`;
                nl.appendChild(d);
            });
        } else {
            document.getElementById('notif-badge').style.display = 'none';
            nl.innerHTML = '<div style="font-size:0.7rem; opacity:0.5">Aucune demande</div>';
        }
    }

    function toggleNotifs() {
        const p = document.getElementById('notif-panel');
        p.style.display = p.style.display === 'block' ? 'none' : 'block';
    }

    // --- CHAT PRIVÉ ---
    function openPrivate(friend, el) {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        el.classList.add('active');
        activeRoom = [me.u, friend].sort().join("-");
        document.getElementById('room-name').innerText = "Privé : " + friend;
        document.getElementById('call-btn').style.display = 'block';
        document.getElementById('msgs').innerHTML = ''; // Clear chat
    }

    function switchTab(type, el) {
        if(type === 'public') {
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            el.classList.add('active');
            activeRoom = "public";
            document.getElementById('room-name').innerText = "Cour Publique";
            document.getElementById('call-btn').style.display = 'none';
            document.getElementById('msgs').innerHTML = '';
        }
    }

    function send() {
        const i = document.getElementById('msg-in');
        if(!i.value) return;
        socket.emit('msg', {room: activeRoom, txt: i.value});
        i.value = '';
    }

    socket.on('new-msg', m => {
        if(m.room !== activeRoom) return;
        const d = document.createElement('div');
        d.className = 'msg';
        d.style.borderLeftColor = m.rank.c;
        d.innerHTML = \`<b style="color:\${m.rank.c}; font-size:0.7rem">\${m.rank.n}</b><br>
                        <b>\${m.from}</b>: \${m.txt}\`;
        document.getElementById('msgs').appendChild(d);
        document.getElementById('msgs').scrollTop = document.getElementById('msgs').scrollHeight;
    });

    // --- ACTIONS ---
    function reqFriend() {
        const p = prompt("Pseudo de l'ami :");
        if(p) socket.emit('friend-request', p);
    }

    async function startCall() {
        document.getElementById('call-ui').style.display = 'block';
        const s = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: 60}});
        document.getElementById('v-remote').srcObject = s;
    }

    socket.on('update-user', u => { me = u; updateUI(); });
</script>
</body>
</html>
    `);
});

// --- SERVEUR ---
io.on("connection", (socket) => {
    socket.on('signup', d => {
        if(users.findOne({u: d.u})) return socket.emit('auth-error', "Nom pris.");
        const u = users.insert({ u: d.u, p: d.p, gems: 100, xp: 0, friends: [], requests: [], inventory: [], avatar: '', activeFrame: '' });
        socket.user = u.u;
        socket.join(u.u); // Rejoint sa propre room pour les notifs privées
        socket.emit('auth-success', u);
    });

    socket.on('login', d => {
        const u = users.findOne({u: d.u});
        if(u && u.p === d.p) {
            socket.user = u.u;
            socket.join(u.u);
            socket.emit('auth-success', u);
        } else socket.emit('auth-error', "Erreur.");
    });

    socket.on('msg', m => {
        const u = users.findOne({u: socket.user});
        if(!u) return;
        u.xp += 5; users.update(u);
        const lvl = Math.floor(Math.sqrt(u.xp)/2)+1;
        io.emit('new-msg', { room: m.room, from: u.u, txt: m.txt, rank: getRank(lvl) });
    });

    // Demande d'ami
    socket.on('friend-request', name => {
        const target = users.findOne({u: name});
        if(target && name !== socket.user && !target.requests.includes(socket.user) && !target.friends.includes(socket.user)) {
            target.requests.push(socket.user);
            users.update(target);
            io.to(name).emit('update-user', target); // Notif live si connecté
            socket.emit('alert', "Demande envoyée !");
        }
    });

    // Réponse à une demande
    socket.on('friend-answer', d => {
        const me = users.findOne({u: socket.user});
        const sender = users.findOne({u: d.from});
        
        me.requests = me.requests.filter(r => r !== d.from);
        if(d.accept && sender) {
            me.friends.push(d.from);
            sender.friends.push(socket.user);
            users.update(sender);
            io.to(d.from).emit('update-user', sender);
        }
        users.update(me);
        socket.emit('update-user', me);
    });
});

server.listen(3000);
