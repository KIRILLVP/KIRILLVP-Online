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
const obstacles = [
    { x: 400, y: 300, w: 200, h: 50 },
    { x: 800, y: 600, w: 50, h: 300 },
    { x: 200, y: 800, w: 300, h: 40 }
];

io.on('connection', (socket) => {
    players[socket.id] = {
        x: Math.random() * (MAP_SIZE - 40),
        y: Math.random() * (MAP_SIZE - 40),
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        hp: 3,
        dead: false,
        name: "Player " + socket.id.substr(0, 4),
        lastShot: 0 // Для задержки между выстрелами
    };

    socket.emit('init', { obstacles, mapSize: MAP_SIZE });
    io.emit('updateOnline', Object.keys(players).length);

    socket.on('move', (data) => {
        const p = players[socket.id];
        if (!p || p.dead) return;
        const speed = 5;
        const len = Math.sqrt(data.x * data.x + data.y * data.y);
        if (len > 0) {
            p.x += (data.x / len) * speed;
            p.y += (data.y / len) * speed;
        }
    });

    socket.on('shoot', (target) => {
        const p = players[socket.id];
        const now = Date.now();
        // Задержка выстрела (например, 400 мс)
        if (!p || p.dead || now - p.lastShot < 400) return;

        p.lastShot = now;
        const angle = Math.atan2(target.y - (p.y + 20), target.x - (p.x + 20));
        
        bullets.push({
            id: socket.id,
            x: p.x + 20,
            y: p.y + 20,
            vx: Math.cos(angle) * 10,
            vy: Math.sin(angle) * 10,
            life: 100
        });

        // ОТПРАВЛЯЕМ СИГНАЛ ЗВУКА ВСЕМ (чтобы слышать и себя, и других)
        io.emit('playShotSound', { x: p.x, y: p.y });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updateOnline', Object.keys(players).length);
    });
});

setInterval(() => {
    bullets.forEach((b, index) => {
        b.x += b.vx;
        b.y += b.vy;
        b.life--;
        // Тут могла бы быть логика столкновений...
    });
    bullets = bullets.filter(b => b.life > 0);
    io.emit('update', { players, bullets });
}, 15);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
