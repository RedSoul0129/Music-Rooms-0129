const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const loki = require("lokijs");

const app = express();
const server = http.createServer(app);
// Limite augmentée pour accepter les images de bannières HD
const io = new Server(server, { maxHttpBufferSize: 5e7 }); 

// --- BASE DE DONNÉES ---
const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");
let messages = db.getCollection("messages") || db.addCollection("messages");
let groups = db.getCollection("groups") || db.addCollection("groups");
let ytRooms = db.getCollection("ytRooms") || db.addCollection("ytRooms");

const activeUsers = {}; 
const userSockets = {}; 
const slurs = /motraciste1|motraciste2|insulte1|insulte2/gi; 

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Royal Elite - Custom & Sync</title>
    <style>
        :root { --gold: linear-gradient(135deg, #e6c27a 0%, #ffe5a3 50%, #c59b3d 100%); --gold-s: #d4af37; --dark: #080808; --card: #151515; --text: #f1f1f1; --danger: #ff4444; }
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }

        .btn-royal { background: var(--gold); color: black; padding: 12px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .btn-royal:active { transform: scale(0.95); }
        .btn-icon { background: transparent; border: 1px solid var(--gold-s); color: var(--gold-s); padding: 8px 12px; border-radius: 8px; cursor: pointer; }
        input { background: #111; border: 1px solid #333; color: white; padding: 12px; border-radius: 8px; width: 100%; margin-bottom: 10px; font-size: 16px; outline: none; }
        input:focus { border-color: var(--gold-s); }

        /* SIDEBAR */
        #sidebar { width: 300px; background: var(--card); border-right: 1px solid #222; display: flex; flex-direction: column; transition: transform 0.3s ease; z-index: 100; }
        .sidebar-header { padding: 20px; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; }
        .sidebar-scroll { flex: 1; overflow-y: auto; padding: 15px; }
        .section-title { font-size: 0.7rem; color: #777; text-transform: uppercase; letter-spacing: 1px; margin: 15px 0 10px 5px; }
        
        /* BANNIÈRES DANS LA LISTE */
        .list-item { position: relative; padding: 10px; border-radius: 8px; cursor: pointer; margin-bottom: 5px; overflow: hidden; border: 1px solid transparent; }
        .list-item:hover { border-color: var(--gold-s); }
        .list-item-content { position: relative; z-index: 2; display: flex; align-items: center; gap: 10px; text-shadow: 1px 1px 3px black; font-weight: 500; }
        
        .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #444; flex-shrink: 0; }
        .online { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
        .avatar { width: 35px; height: 35px; border-radius: 50%; object-fit: cover; border: 1px solid var(--gold-s); flex-shrink: 0; }

        /* USER BAR (AVEC BANNIÈRE) */
        #user-bar { position: relative; padding: 15px; border-top: 1px solid #222; display: flex; align-items: center; gap: 10px; background-size: cover; background-position: center; }
        #user-bar::before { content: ''; position: absolute; inset: 0; background: rgba(0,0,0,0.75); z-index: 0; }
        #user-bar > * { position: relative; z-index: 1; }

        /* CHAT (CORRIGÉ HORIZONTAL) */
        #main-content { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        #top-bar { padding: 15px 20px; background: rgba(21, 21, 21, 0.95); border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; }
        #mobile-menu-btn { display: none; background: none; border: none; color: var(--gold-s); font-size: 1.5rem; cursor: pointer; }

        #chat-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        #messages-container { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        
        .msg-row { display: flex; align-items: flex-end; gap: 10px; width: 100%; }
        .msg-row.me { flex-direction: row-reverse; }
        .msg-content-wrapper { display: flex; flex-direction: column; align-items: flex-start; max-width: 75%; }
        .msg-row.me .msg-content-wrapper { align-items: flex-end; }
        
        .msg-bubble { 
            padding: 10px 15px; border-radius: 12px; background: #1a1a1a; 
            font-size: 0.95rem; white-space: pre-wrap; word-wrap: break-word; text-align: left;
            display: inline-block; 
        }
        .msg-row.me .msg-bubble { background: var(--gold); color: black; border-bottom-right-radius: 2px; }
        .msg-author { font-size: 0.7rem; color: #888; margin-bottom: 4px; padding: 0 5px; }

        /* YT & CALLS */
        #yt-area, #call-area { display: none; flex: 1; flex-direction: column; background: #000; padding: 10px; }
        .video-wrapper { width: 100%; aspect-ratio: 16/9; background: #111; border: 1px solid var(--gold-s); border-radius: 8px; overflow: hidden; pointer-events: auto; }
        #yt-player { width: 100%; height: 100%; }

        /* MODALS */
        .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 2000; display: none; align-items: center; justify-content: center; backdrop-filter: blur(5px); padding: 20px; }
        .modal.open { display: flex; }
        .modal-box { background: var(--card); padding: 25px; border: 1px solid var(--gold-s); border-radius: 15px; width: 100%; max-width: 350px; text-align: center; max-height: 90vh; overflow-y: auto; }
        .notif-badge { background: var(--danger); color: white; border-radius: 50%; padding: 2px 6px; font-size: 0.6rem; font-weight: bold; }

        @media (max-width: 768px) {
            #sidebar { position: fixed; height: 100%; transform: translateX(-100%); width: 85%; max-width: 320px; }
            #sidebar.open { transform: translateX(0); box-shadow: 10px 0 30px rgba(0,0,0,0.9); }
            #mobile-menu-btn { display: block; }
            .msg-content-wrapper { max-width: 85%; }
        }
    </style>
</head>
<body>

<div id="auth-modal" class="modal open">
    <div class="modal-box">
        <h2 id="auth-title" style="color:var(--gold-s)">PALAIS ROYAL</h2>
        <input id="auth-u" placeholder="Pseudo" autocomplete="off">
        <input id="auth-p" type="password" placeholder="Mot de passe">
        <button class="btn-royal" style="width:100%" onclick="handleAuth()">ENTRER</button>
        <p style="font-size:0.8rem; margin-top:15px">
            Pas de compte ? <a href="#" onclick="toggleAuth()" style="color:var(--gold-s)" id="auth-toggle">S'inscrire</a>
        </p>
    </div>
</div>

<div id="settings-modal" class="modal">
    <div class="modal-box">
        <h3 style="color:var(--gold-s); margin-top:0;">PARAMÈTRES</h3>
        <input id="set-u" placeholder="Nouveau Pseudo">
        <input id="set-p" type="password" placeholder="Nouveau Mot de passe">
        
        <h4 style="color:var(--gold-s); margin-top:15px; border-bottom:1px solid #333; padding-bottom:5px; text-align:left;">🎨 Customisation</h4>
        
        <p style="text-align:left; font-size:0.8rem; color:#aaa; margin:5px 0">Icône (Avatar) :</p>
        <input type="file" id="set-av" accept="image/*" style="font-size:0.8rem; padding:8px; background:#222">
        
        <p style="text-align:left; font-size:0.8rem; color:#aaa; margin:5px 0">Bannière (Fond du nom) :</p>
        <input type="file" id="set-banner" accept="image/*" style="font-size:0.8rem; padding:8px; background:#222">
        
        <button class="btn-royal" style="width:100%; margin-top:15px; margin-bottom:10px" onclick="saveSettings()">SAUVEGARDER</button>
        <button class="btn-icon" style="width:100%; border-color:#555; color:#aaa" onclick="closeModal('settings-modal')">ANNULER</button>
    </div>
</div>

<div id="sidebar">
    <div class="sidebar-header">
        <h3 style="color:var(--gold-s); margin:0">🔱 ROYAL</h3>
        <button id="close-mobile-btn" class="btn-icon" style="display:none; border:none; font-size:1.2rem" onclick="toggleSidebar()">✕</button>
    </div>
    
    <div class="sidebar-scroll">
        <div class="section-title">Demandes <span id="req-count" class="notif-badge" style="display:none">0</span></div>
        <div style="display:flex; gap:5px; margin-bottom:10px">
            <input id="add-f-in" placeholder="Chercher un noble..." style="margin:0; padding:8px; font-size:0.8rem">
            <button class="btn-royal" style="padding:8px" onclick="sendFriendReq('add-f-in')">+</button>
        </div>
        <div id="requests-list"></div>

        <div class="section-title" id="suggestions-title" style="display:none">💡 Suggestions d'amis</div>
        <div id="suggestions-list"></div>

        <div class="section-title">Amis</div>
        <div id="friends-list"></div>

        <div class="section-title">Groupes <button class="btn-icon" style="padding:2px 6px; font-size:0.7rem; float:right" onclick="createGroup()">+</button></div>
        <div id="groups-list"></div>

        <div class="section-title">Salles Vidéo <button class="btn-icon" style="padding:2px 6px; font-size:0.7rem; float:right" onclick="createYTRoom()">+</button></div>
        <div id="yt-rooms-list"></div>
    </div>

    <div id="user-bar">
        <img id="my-avatar" class="avatar" src="" onclick="openModal('settings-modal')">
        <div style="flex:1; overflow:hidden">
            <div id="my-name" style="font-weight:bold; font-size:0.9rem; text-shadow:1px 1px 2px black;">...</div>
            <div style="font-size:0.7rem; color:#22c55e; text-shadow:1px 1px 2px black;">En ligne</div>
        </div>
        <button class="btn-icon" style="border:none; text-shadow:1px 1px 2px black;" onclick="openModal('settings-modal')">⚙️</button>
    </div>
</div>

<div id="main-content">
    <div id="top-bar">
        <div style="display:flex; align-items:center; gap:15px">
            <button id="mobile-menu-btn" onclick="toggleSidebar()">☰</button>
            <h3 id="target-title" style="margin:0">Sélectionnez un chat</h3>
        </div>
        <div id="action-btns" style="display:none; gap:10px">
            <button class="btn-icon" onclick="alert('Appel en cours de dev...')">📞</button>
            <button class="btn-icon" onclick="alert('ScreenShare en cours de dev...')">🖥️ 60FPS</button>
        </div>
    </div>

    <div id="chat-area">
        <div id="messages-container"></div>
        <div id="input-area" style="padding:15px; background:rgba(0,0,0,0.5); display:flex; gap:10px; display:none">
            <input id="chat-inp" placeholder="Écrire un message..." style="margin:0" onkeypress="if(event.key==='Enter') sendMsg()">
            <button class="btn-royal" style="width:60px" onclick="sendMsg()">➤</button>
        </div>
    </div>

    <div id="yt-area">
        <div class="video-wrapper"><div id="yt-player"></div></div>
        <div style="padding:15px; display:flex; gap:10px">
            <input id="yt-url" placeholder="Collez le lien YouTube ici..." style="margin:0">
            <button class="btn-royal" onclick="addToYT()">Lancer Syncro</button>
        </div>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
    const socket = io();
    let myData = {}, activeTarget = null, targetType = 'user'; 
    let isLogin = true;

    function toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('open');
        if(window.innerWidth <= 768) document.getElementById('close-mobile-btn').style.display = 'block';
    }

    function openModal(id) { document.getElementById(id).classList.add('open'); }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }

    function toggleAuth() {
        isLogin = !isLogin;
        document.getElementById('auth-title').innerText = isLogin ? "PALAIS ROYAL" : "CRÉER UN TITRE";
        document.getElementById('auth-toggle').innerText = isLogin ? "S'inscrire" : "Se connecter";
    }

    function handleAuth() {
        const u = document.getElementById('auth-u').value.trim();
        const p = document.getElementById('auth-p').value.trim();
        if(u.length < 3) return alert("Pseudo trop court.");
        socket.emit(isLogin ? 'login' : 'register', { u, p });
    }

    socket.on('auth-success', u => {
        myData = u;
        document.getElementById('my-name').innerText = u.name;
        document.getElementById('my-avatar').src = u.avatar || 'https://ui-avatars.com/api/?name='+u.name;
        
        // Applique la bannière sur TON profil en bas à gauche
        if(u.banner) {
            document.getElementById('user-bar').style.backgroundImage = \`linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.8)), url(\${u.banner})\`;
        } else {
            document.getElementById('user-bar').style.backgroundImage = 'none';
        }

        closeModal('auth-modal');
        socket.emit('get-init-data'); 
    });
    socket.on('auth-error', alert);

    // --- BASE 64 POUR IMAGES (AVATAR & BANNIÈRE) ---
    async function getBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    }

    async function saveSettings() {
        const u = document.getElementById('set-u').value;
        const p = document.getElementById('set-p').value;
        const avFile = document.getElementById('set-av').files[0];
        const banFile = document.getElementById('set-banner').files[0];
        
        let avatar = null, banner = null;
        if(avFile) avatar = await getBase64(avFile);
        if(banFile) banner = await getBase64(banFile);
        
        socket.emit('update-profile', { name: u, pass: p, avatar, banner });
        closeModal('settings-modal');
    }

    // --- REQUÊTES ET SUGGESTIONS ---
    function sendFriendReq(inputId) {
        const t = document.getElementById(inputId).value.trim();
        if(t && t !== myData.name) socket.emit('send-request', t);
        if(document.getElementById(inputId)) document.getElementById(inputId).value = '';
    }

    function quickAdd(name) {
        socket.emit('send-request', name);
    }

    socket.on('init-data', d => {
        // Demandes
        const reqList = document.getElementById('requests-list'); reqList.innerHTML = '';
        const badge = document.getElementById('req-count');
        badge.style.display = d.requests.length > 0 ? 'inline-block' : 'none';
        badge.innerText = d.requests.length;
        d.requests.forEach(req => {
            const div = document.createElement('div'); div.className = 'list-item'; div.style.fontSize = '0.8rem';
            div.innerHTML = \`<div class="list-item-content"><span>\${req}</span> <button class="btn-royal" style="padding:4px 8px; margin-left:auto" onclick="socket.emit('accept-request', '\${req}')">✔</button></div>\`;
            reqList.appendChild(div);
        });

        // Suggestions (Amis Mutuels)
        const sugList = document.getElementById('suggestions-list'); sugList.innerHTML = '';
        const sugTitle = document.getElementById('suggestions-title');
        sugTitle.style.display = d.suggestions.length > 0 ? 'block' : 'none';
        d.suggestions.forEach(sug => {
            const div = document.createElement('div'); div.className = 'list-item'; div.style.fontSize = '0.8rem';
            div.innerHTML = \`<div class="list-item-content"><span style="color:#aaa">\${sug}</span> <button class="btn-icon" style="padding:2px 6px; font-size:0.7rem; margin-left:auto" onclick="quickAdd('\${sug}')">+ Ajouter</button></div>\`;
            sugList.appendChild(div);
        });

        // Amis (AVEC BANNIÈRES)
        const fList = document.getElementById('friends-list'); fList.innerHTML = '';
        d.friends.forEach(f => {
            const div = document.createElement('div'); div.className = 'list-item';
            
            // Ajout visuel de la bannière derrière le nom de l'ami
            if(f.banner) {
                div.style.backgroundImage = \`linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.8)), url(\${f.banner})\`;
                div.style.backgroundSize = 'cover';
                div.style.backgroundPosition = 'center';
            }
            
            div.innerHTML = \`<div class="list-item-content"><img src="\${f.avatar || 'https://ui-avatars.com/api/?name='+f.name}" class="avatar" style="width:25px;height:25px"> <div class="status-dot \${f.online?'online':''}"></div> <span>\${f.name}</span></div>\`;
            div.onclick = () => switchView('user', f.name);
            fList.appendChild(div);
        });

        const gList = document.getElementById('groups-list'); gList.innerHTML = '';
        d.groups.forEach(g => {
            const div = document.createElement('div'); div.className = 'list-item'; div.innerHTML = '<div class="list-item-content">👥 ' + g.name + '</div>';
            div.onclick = () => switchView('group', g.name);
            gList.appendChild(div);
        });

        const yList = document.getElementById('yt-rooms-list'); yList.innerHTML = '';
        d.ytRooms.forEach(y => {
            const div = document.createElement('div'); div.className = 'list-item'; div.innerHTML = '<div class="list-item-content">🎬 ' + y + '</div>';
            div.onclick = () => switchView('yt', y);
            yList.appendChild(div);
        });
    });

    // --- NAV ---
    function switchView(type, target) {
        activeTarget = target; targetType = type;
        document.getElementById('target-title').innerText = target;
        document.getElementById('action-btns').style.display = type === 'yt' ? 'none' : 'flex';
        
        ['chat-area', 'yt-area'].forEach(id => document.getElementById(id).style.display = 'none');
        
        if(type === 'yt') {
            document.getElementById('yt-area').style.display = 'flex';
            socket.emit('join-yt-room', target);
        } else {
            document.getElementById('chat-area').style.display = 'flex';
            document.getElementById('input-area').style.display = 'flex';
            socket.emit('load-chat', { type, target });
        }
        if(window.innerWidth <= 768) toggleSidebar();
    }

    // --- CHAT HORIZONTAL ---
    function sendMsg() {
        const i = document.getElementById('chat-inp');
        if(!i.value) return;
        socket.emit('send-msg', { type: targetType, target: activeTarget, text: i.value });
        i.value = '';
    }

    socket.on('chat-history', msgs => {
        const c = document.getElementById('messages-container'); c.innerHTML = '';
        msgs.forEach(m => appendMsg(m));
    });

    socket.on('new-msg', m => {
        if((targetType === 'user' && (m.from === activeTarget || m.from === myData.name)) || 
           (targetType === 'group' && m.target === activeTarget)) {
            appendMsg(m);
        }
    });

    function appendMsg(m) {
        const isMe = m.from === myData.name;
        const c = document.getElementById('messages-container');
        const r = document.createElement('div'); 
        r.className = 'msg-row ' + (isMe ? 'me' : '');
        
        r.innerHTML = \`<img src="\${m.avatar || 'https://ui-avatars.com/api/?name='+m.from}" class="avatar">
                       <div class="msg-content-wrapper">
                           <div class="msg-author">\${m.from}</div>
                           <div class="msg-bubble">\${m.text}</div>
                       </div>\`;
        c.appendChild(r); 
        c.scrollTop = c.scrollHeight;
    }

    // --- CREATIONS ---
    function createGroup() { const n = prompt("Nom du groupe ?"); if(n) socket.emit('create-group', n); }
    function createYTRoom() { const n = prompt("Nom de la salle vidéo ?"); if(n) socket.emit('create-yt-room', n); }

    // --- YOUTUBE SYNCRO ROBUSTE (PLAY/PAUSE/SEEK) ---
    let player, ytSyncing = false;
    function onYouTubeIframeAPIReady() { 
        player = new YT.Player('yt-player', { 
            events: { 'onStateChange': onPlayerStateChange }
        }); 
    }
    
    function addToYT() {
        const url = document.getElementById('yt-url').value;
        const id = url.split('v=')[1]?.split('&')[0];
        if(id) { 
            socket.emit('yt-action', { room: activeTarget, action: 'load', id }); 
            document.getElementById('yt-url').value = ''; 
        }
    }

    // Détecte quand TOI tu cliques sur le lecteur (pause, play, avance rapide)
    function onPlayerStateChange(e) {
        if(ytSyncing) return; // Évite que les signaux du serveur ne fassent une boucle infinie
        if(e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.PAUSED) {
            socket.emit('yt-action', { 
                room: activeTarget, 
                action: 'sync', 
                state: e.data, 
                time: player.getCurrentTime() 
            });
        }
    }

    // Reçoit le signal des autres
    socket.on('yt-sync', d => {
        ytSyncing = true; // On bloque notre propre envoi le temps d'appliquer le changement
        
        if(d.action === 'load') {
            player.loadVideoById(d.id);
        }
        
        if(d.action === 'sync') {
            const myTime = player.getCurrentTime();
            // Si le temps de l'autre est très différent (quelqu'un a avancé la vidéo)
            if(Math.abs(myTime - d.time) > 1.5) player.seekTo(d.time, true);
            
            // Syncro de l'état (1=Play, 2=Pause)
            if(d.state === 1) player.playVideo(); 
            else if(d.state === 2) player.pauseVideo();
        }
        
        // On libère le verrou après l'exécution
        setTimeout(() => ytSyncing = false, 800);
    });

</script>
</body>
</html>
`);
});

// --- SERVEUR NODE.JS ---
io.on("connection", (socket) => {
    socket.on('register', (d) => {
        if(users.findOne({u: d.u})) return socket.emit('auth-error', 'Nom pris');
        // Ajout du champ banner
        const u = users.insert({ u: d.u, p: d.p, avatar: '', banner: '', friends: [], requests: [] });
        loginOk(socket, u);
    });

    socket.on('login', (d) => {
        const u = users.findOne({ u: d.u, p: d.p });
        if(u) loginOk(socket, u); else socket.emit('auth-error', 'Identifiants invalides');
    });

    function loginOk(s, u) {
        activeUsers[s.id] = u.u; userSockets[u.u] = s.id;
        s.emit('auth-success', { name: u.u, avatar: u.avatar, banner: u.banner });
    }

    socket.on('get-init-data', () => refreshUser(socket));

    socket.on('send-request', t => {
        const them = users.findOne({u: t});
        const me = activeUsers[socket.id];
        if(them && !them.requests.includes(me) && !them.friends.includes(me)) {
            them.requests.push(me); users.update(them);
            if(userSockets[t]) refreshUser(io.sockets.sockets.get(userSockets[t]));
        }
    });

    socket.on('accept-request', f => {
        const me = users.findOne({u: activeUsers[socket.id]});
        const them = users.findOne({u: f});
        me.requests = me.requests.filter(r => r !== f);
        if(!me.friends.includes(f)) { me.friends.push(f); them.friends.push(me.u); }
        users.update(me); users.update(them);
        refreshUser(socket); if(userSockets[f]) refreshUser(io.sockets.sockets.get(userSockets[f]));
    });

    // Filtre et envoi de message
    socket.on('send-msg', d => {
        const me = users.findOne({u: activeUsers[socket.id]});
        let cleanText = d.text.replace(slurs, "***"); 
        
        const msg = { from: me.u, avatar: me.avatar, text: cleanText, target: d.target, time: Date.now() };
        messages.insert(msg);
        
        if(d.type === 'group') {
            io.to('group_'+d.target).emit('new-msg', msg);
        } else {
            socket.emit('new-msg', msg);
            if(userSockets[d.target]) io.to(userSockets[d.target]).emit('new-msg', msg);
        }
    });

    socket.on('load-chat', d => {
        const me = activeUsers[socket.id];
        if(d.type === 'group') {
            socket.join('group_'+d.target);
            const h = messages.find({ target: d.target }).sort((a,b)=>a.time-b.time);
            socket.emit('chat-history', h);
        } else {
            const h = messages.find({ $or: [{from:me, target:d.target}, {from:d.target, target:me}] }).sort((a,b)=>a.time-b.time);
            socket.emit('chat-history', h);
        }
    });

    socket.on('create-group', n => { if(!groups.findOne({name: n})) { groups.insert({name: n, members: [activeUsers[socket.id]]}); refreshAll(); } });
    socket.on('create-yt-room', n => { if(!ytRooms.findOne({name: n})) { ytRooms.insert({name: n, queue: []}); refreshAll(); } });
    
    socket.on('join-yt-room', r => socket.join('yt_'+r));
    socket.on('yt-action', d => io.to('yt_'+d.room).emit('yt-sync', d)); // Relais du signal Play/Pause

    // PROFIL AVEC BANNIÈRE
    socket.on('update-profile', d => {
        const u = users.findOne({u: activeUsers[socket.id]});
        if(d.name) { delete userSockets[u.u]; u.u = d.name; userSockets[u.u] = socket.id; activeUsers[socket.id] = u.u; }
        if(d.pass) u.p = d.pass; 
        if(d.avatar) u.avatar = d.avatar;
        if(d.banner) u.banner = d.banner; // Sauvegarde la bannière
        users.update(u); 
        socket.emit('auth-success', { name: u.u, avatar: u.avatar, banner: u.banner }); 
        refreshAll();
    });

    function refreshUser(s) {
        if(!s) return;
        const u = users.findOne({u: activeUsers[s.id]});
        if(u) {
            // Amis avec infos bannières
            const fData = u.friends.map(f => { 
                const fu = users.findOne({u:f}); 
                return { name: f, online: !!userSockets[f], avatar: fu?fu.avatar:'', banner: fu?fu.banner:'' }; 
            });
            
            // Calcul des suggestions d'amis mutuels
            let suggestions = new Set();
            u.friends.forEach(f => {
                const fu = users.findOne({u: f});
                if(fu) {
                    fu.friends.forEach(mutual => {
                        if(mutual !== u.u && !u.friends.includes(mutual) && !u.requests.includes(mutual)) {
                            suggestions.add(mutual);
                        }
                    });
                }
            });

            const gData = groups.find().filter(g => g.members.includes(u.u));
            const yData = ytRooms.find().map(y => y.name);
            
            s.emit('init-data', { 
                friends: fData, 
                requests: u.requests, 
                suggestions: Array.from(suggestions), // Envoi des suggestions au client
                groups: gData, 
                ytRooms: yData 
            });
        }
    }

    function refreshAll() { io.sockets.sockets.forEach(s => refreshUser(s)); }
    socket.on('disconnect', () => { delete userSockets[activeUsers[socket.id]]; delete activeUsers[socket.id]; refreshAll(); });
});

server.listen(3000);
