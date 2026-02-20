const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const loki = require("lokijs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e7 });

// ================= DATABASE =================
const db = new loki("royal_palace.db", { autosave: true, autosaveInterval: 4000 });
let users = db.getCollection("users") || db.addCollection("users");

// ================= MARKET =================
const MARKET_ITEMS = [
    { id: 'frame_gold', name: 'Aura Dorée', price: 100, style: 'box-shadow: 0 0 10px #d4af37, inset 0 0 5px #d4af37; border: 2px solid #d4af37;' },
    { id: 'frame_rgb', name: 'Chroma RGB', price: 250, style: 'animation: rgb-anim 2s linear infinite; border: 2px solid;' }
];

// ================= UTIL =================
function getLevel(xp) {
    return Math.floor(Math.sqrt(xp || 0) / 2) + 1;
}

// ================= SOCKET =================
io.on("connection", (socket) => {

    // ===== LOGIN =====
    socket.on("login", (d) => {
        let u = users.findOne({ u: d.u });

        if (!u) {
            u = users.insert({
                u: d.u,
                p: d.p,
                gems: 100,
                xp: 0,
                lastDaily: 0,
                activeFrame: '',
                avatar: '',
                framesOwned: [],
                friends: [],
                friendRequests: [],
                groups: []
            });
        }

        socket.user = u.u;
        socket.emit("auth-success", u);
    });

    // ===== ADD FRIEND =====
    socket.on("add-friend", (targetName) => {
        const me = users.findOne({ u: socket.user });
        const target = users.findOne({ u: targetName });
        if (!me || !target) return;

        if (!target.friendRequests.includes(me.u)) {
            target.friendRequests.push(me.u);
            users.update(target);
        }
    });

    // ===== ACCEPT FRIEND =====
    socket.on("accept-friend", (fromName) => {
        const me = users.findOne({ u: socket.user });
        const from = users.findOne({ u: fromName });
        if (!me || !from) return;

        if (!me.friends.includes(from.u)) me.friends.push(from.u);
        if (!from.friends.includes(me.u)) from.friends.push(me.u);

        me.friendRequests = me.friendRequests.filter(n => n !== from.u);

        users.update(me);
        users.update(from);

        socket.emit("update-user", me);
    });

    // ===== CREATE GROUP =====
    socket.on("create-group", (members) => {
        const groupId = "grp_" + Date.now();

        members.push(socket.user);

        members.forEach(name => {
            const u = users.findOne({ u: name });
            if (u && !u.groups.includes(groupId)) {
                u.groups.push(groupId);
                users.update(u);
            }
        });

        socket.join(groupId);
    });

    // ===== JOIN GROUP =====
    socket.on("join-group", (groupId) => {
        socket.join(groupId);
    });

    // ===== GROUP MESSAGE =====
    socket.on("group-msg", ({ groupId, txt }) => {
        const u = users.findOne({ u: socket.user });
        if (!u) return;

        u.xp += 5;
        users.update(u);

        io.to(groupId).emit("group-msg", {
            from: u.u,
            txt,
            lvl: getLevel(u.xp)
        });

        socket.emit("update-user", u);
    });

    // ===== BUY ITEM =====
    socket.on("buy", (id) => {
        const u = users.findOne({ u: socket.user });
        const item = MARKET_ITEMS.find(i => i.id === id);
        if (!u || !item) return;

        if (u.gems >= item.price && !u.framesOwned.includes(item.id)) {
            u.gems -= item.price;
            u.framesOwned.push(item.id);
            users.update(u);
            socket.emit("update-user", u);
        }
    });

    // ===== SWITCH FRAME =====
    socket.on("switch-frame", (id) => {
        const u = users.findOne({ u: socket.user });
        const item = MARKET_ITEMS.find(i => i.id === id);
        if (!u || !item) return;

        if (u.framesOwned.includes(id)) {
            u.activeFrame = item.style;
            users.update(u);
            socket.emit("update-user", u);
        }
    });

    // ===== CHANGE AVATAR =====
    socket.on("change-avatar", (url) => {
        const u = users.findOne({ u: socket.user });
        if (!u) return;

        u.avatar = url;
        users.update(u);
        socket.emit("update-user", u);
    });

    // ===== DAILY REWARD =====
    socket.on("claim-daily", () => {
        const u = users.findOne({ u: socket.user });
        if (!u) return;

        const now = Date.now();
        const cooldown = 86400000;

        if (now - u.lastDaily >= cooldown) {
            u.gems += 50;
            u.lastDaily = now;
            users.update(u);
            socket.emit("daily-claimed", true);
            socket.emit("update-user", u);
        } else {
            socket.emit("daily-claimed", false);
        }
    });

    // ===== WATCH AD (FAKE PROMO SYSTEM) =====
    socket.on("watch-ad", () => {
        const u = users.findOne({ u: socket.user });
        if (!u) return;

        // serveur vérifie un minimum de 15 sec côté client normalement
        u.gems += 15;
        users.update(u);
        socket.emit("update-user", u);
    });
});

app.get("/", (req, res) => {
    res.send("Royal Palace fonctionne 👑");
});
// ================= START =================
server.listen(3000, () => {
    console.log("Royal Palace lancé sur port 3000");
});
