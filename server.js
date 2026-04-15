const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, transports: ['websocket'] });

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let bullets = [];
const MAP_SIZE = 2000;

// ГЕНЕРАЦИЯ ПРЕПЯТСТВИЙ
const obstacles = [];
// Границы (стены)
obstacles.push({ x: 0, y: 0, w: MAP_SIZE, h: 15, type: 'wall' });
obstacles.push({ x: 0, y: MAP_SIZE - 15, w: MAP_SIZE, h: 15, type: 'wall' });
obstacles.push({ x: 0, y: 0, w: 15, h: MAP_SIZE, type: 'wall' });
obstacles.push({ x: MAP_SIZE - 15, y: 0, w: 15, h: MAP_SIZE, type: 'wall' });

// Случайные препятствия и коробки (около 60 штук)
for (let i = 0; i < 60; i++) {
    const isBox = Math.random() > 0.6;
    const w = isBox ? 40 : 40 + Math.random() * 150;
    const h = isBox ? 40 : 40 + Math.random() * 150;
    obstacles.push({
        x: Math.random() * (MAP_SIZE - 200) + 100,
        y: Math.random() * (MAP_SIZE - 200) + 100,
        w: w,
        h: h,
        type: isBox ? 'box' : 'wall'
    });
}

io.on('connection', (socket) => {
    players[socket.id] = {
        x: 100,
        y: 100,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        hp: 3,
        dead: false,
        name: "Player #" + socket.id.substr(0, 5),
        lastShot: 0
    };

    socket.emit('init', { obstacles, mapSize: MAP_SIZE });
    io.emit('updateOnline', Object.keys(players).length);

    // Установка имени
    socket.on('setNickname', (name) => {
        if (name && name.trim().length > 0) {
            players[socket.id].name = name.trim().substring(0, 12);
        }
    });

    socket.on('move', (data) => {
        const p = players[socket.id];
        if (!p || p.dead) return;
        const speed = 5;
        const len = Math.sqrt(data.x * data.x + data.y * data.y);
        if (len > 0) {
            let dx = (data.x / len) * speed;
            let dy = (data.y / len) * speed;
            if (!obstacles.some(o => p.x + dx < o.x + o.w && p.x + dx + 40 > o.x && p.y < o.y + o.h && p.y + 40 > o.y)) p.x += dx;
            if (!obstacles.some(o => p.x < o.x + o.w && p.x + 40 > o.x && p.y + dy < o.y + o.h && p.y + dy + 40 > o.y)) p.y += dy;
        }
    });

    socket.on('shoot', (target) => {
        const p = players[socket.id];
        const now = Date.now();
        if (!p || p.dead || now - p.lastShot < 400) return;
        p.lastShot = now;
        const angle = Math.atan2(target.y - (p.y + 20), target.x - (p.x + 20));
        bullets.push({ id: socket.id, x: p.x + 20, y: p.y + 20, vx: Math.cos(angle) * 12, vy: Math.sin(angle) * 12, life: 80 });
        io.emit('playShotSound', { x: p.x, y: p.y });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updateOnline', Object.keys(players).length);
    });
});

setInterval(() => {
    bullets.forEach(b => { b.x += b.vx; b.y += b.vy; b.life--; });
    bullets = bullets.filter(b => b.life > 0);
    io.emit('update', { players, bullets });
}, 15);

server.listen(process.env.PORT || 3000);
