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
const obstacles = [];

// Проверка коллизий для генерации
function isAreaClear(x, y, w, h, padding = 45) {
    return !obstacles.some(o => 
        x < o.x + o.w + padding && x + w + padding > o.x &&
        y < o.y + o.h + padding && y + h + padding > o.y
    );
}

// Стены
obstacles.push({ x: 0, y: 0, w: MAP_SIZE, h: 20, type: 'wall' });
obstacles.push({ x: 0, y: MAP_SIZE - 20, w: MAP_SIZE, h: 20, type: 'wall' });
obstacles.push({ x: 0, y: 0, w: 20, h: MAP_SIZE, type: 'wall' });
obstacles.push({ x: MAP_SIZE - 20, y: 0, w: 20, h: MAP_SIZE, type: 'wall' });

let attempts = 0;
while (obstacles.length < 75 && attempts < 1500) {
    const isBox = Math.random() > 0.6;
    const w = isBox ? 45 : 50 + Math.random() * 150;
    const h = isBox ? 45 : 50 + Math.random() * 150;
    const x = Math.random() * (MAP_SIZE - 250) + 50;
    const y = Math.random() * (MAP_SIZE - 250) + 50;
    if (isAreaClear(x, y, w, h, 50)) {
        obstacles.push({ x, y, w, h, type: isBox ? 'box' : 'wall' });
    }
    attempts++;
}

function getSafeSpawn() {
    let sx, sy, safe = false;
    while (!safe) {
        sx = 150 + Math.random() * (MAP_SIZE - 300);
        sy = 150 + Math.random() * (MAP_SIZE - 300);
        safe = !obstacles.some(o => sx < o.x + o.w + 15 && sx + 40 > o.x - 15 && sy < o.y + o.h + 15 && sy + 40 > o.y - 15);
    }
    return { x: sx, y: sy };
}

io.on('connection', (socket) => {
    const spawn = getSafeSpawn();
    let color;
    let isUnique = false;
    while (!isUnique) {
        color = `hsl(${Math.random() * 360}, 85%, 60%)`;
        isUnique = !Object.values(players).some(p => p.color === color);
    }

    players[socket.id] = {
        x: spawn.x, y: spawn.y,
        color: color,
        hp: 3, dead: false,
        name: "Player #" + socket.id.substr(0, 5),
        lastShot: 0
    };

    socket.emit('init', { obstacles, mapSize: MAP_SIZE });
    io.emit('updateOnline', Object.keys(players).length);

    socket.on('setNickname', (name) => {
        if (name && name.trim().length > 0) players[socket.id].name = name.trim().substring(0, 12);
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
        if (!p || p.dead || Date.now() - p.lastShot < 400) return;
        p.lastShot = Date.now();
        const angle = Math.atan2(target.y - (p.y + 20), target.x - (p.x + 20));
        bullets.push({ id: socket.id, x: p.x + 20, y: p.y + 20, vx: Math.cos(angle) * 12, vy: Math.sin(angle) * 12, life: 100 });
        socket.emit('playShotSound'); 
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updateOnline', Object.keys(players).length);
    });
});

setInterval(() => {
    bullets.forEach((b) => {
        b.x += b.vx; b.y += b.vy; b.life--;
        for (let o of obstacles) {
            if (b.x > o.x && b.x < o.x + o.w && b.y > o.y && b.y < o.y + o.h) { b.life = 0; break; }
        }
        if (b.life > 0) {
            for (let id in players) {
                let p = players[id];
                if (p.dead || id === b.id) continue;
                if (b.x > p.x && b.x < p.x + 40 && b.y > p.y && b.y < p.y + 40) {
                    p.hp -= 1; b.life = 0;
                    
                    // Звук жертве
                    io.to(id).emit('hitEffect'); 
                    
                    // Звук стрелку (ТОЧНЫЙ ПРЯМОУГОЛЬНИК ВИДИМОСТИ)
                    const shooter = players[b.id];
                    if (shooter) {
                        const diffX = Math.abs(p.x - shooter.x);
                        const diffY = Math.abs(p.y - shooter.y);
                        // 1000 по горизонтали, 600 по вертикали от центра
                        if (diffX < 1000 && diffY < 600) {
                            io.to(b.id).emit('hitEffect');
                        }
                    }

                    if (p.hp <= 0) {
                        p.dead = true;
                        setTimeout(() => {
                            if (players[id]) {
                                const ns = getSafeSpawn();
                                players[id].hp = 3; players[id].dead = false;
                                players[id].x = ns.x; players[id].y = ns.y;
                            }
                        }, 3000);
                    }
                    break;
                }
            }
        }
    });
    bullets = bullets.filter(b => b.life > 0);
    io.emit('update', { players, bullets });
}, 16);

server.listen(process.env.PORT || 3000);
