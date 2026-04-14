const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const MAP_SIZE = 2000;
const PLAYER_SPEED = 5;
const SHOOT_COOLDOWN = 250; 

let obstacles = [
    { x: -50, y: -50, w: MAP_SIZE + 100, h: 50 }, 
    { x: -50, y: MAP_SIZE, w: MAP_SIZE + 100, h: 50 }, 
    { x: -50, y: 0, w: 50, h: MAP_SIZE }, 
    { x: MAP_SIZE, y: 0, w: 50, h: MAP_SIZE },
    { x: 400, y: 200, w: 40, h: 300 }, { x: 1500, y: 600, w: 40, h: 400 },
    { x: 400, y: 1400, w: 40, h: 400 }, { x: 1200, y: 100, w: 40, h: 300 },
    { x: 600, y: 400, w: 400, h: 40 }, { x: 200, y: 1000, w: 300, h: 40 },
    { x: 1200, y: 1500, w: 500, h: 40 }, { x: 800, y: 1300, w: 300, h: 40 },
    { x: 200, y: 200, w: 100, h: 40 }, { x: 200, y: 240, w: 40, h: 100 },
    { x: 1700, y: 200, w: 100, h: 40 }, { x: 1760, y: 240, w: 40, h: 100 },
    { x: 200, y: 1700, w: 100, h: 40 }, { x: 200, y: 1600, w: 40, h: 100 },
    { x: 900, y: 800, w: 40, h: 400 }, { x: 1060, y: 800, w: 40, h: 400 },
    { x: 940, y: 980, w: 120, h: 40 }
];

let players = {};
let bullets = [];
let onlineCount = 0;

function getRandomRespawn() {
    let safe = false; let rx, ry;
    while (!safe) {
        rx = Math.random() * (MAP_SIZE - 150) + 50;
        ry = Math.random() * (MAP_SIZE - 150) + 50;
        safe = !obstacles.some(o => rx < o.x + o.w && rx + 40 > o.x && ry < o.y + o.h && ry + 40 > o.y);
    }
    return { x: rx, y: ry };
}

io.on('connection', (socket) => {
    onlineCount++;
    io.emit('updateOnline', onlineCount);

    const startPos = getRandomRespawn();
    players[socket.id] = {
        x: startPos.x, y: startPos.y,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        name: "Player_" + Math.floor(Math.random() * 900),
        hp: 3, dead: false, lastShootTime: 0
    };

    socket.emit('init', { obstacles, mapSize: MAP_SIZE });

    socket.on('move', (dir) => {
        const p = players[socket.id];
        if (!p || p.dead) return;
        let vx = dir.x, vy = dir.y;
        if (vx !== 0 || vy !== 0) {
            const len = Math.sqrt(vx * vx + vy * vy);
            const stepX = (vx / len) * PLAYER_SPEED;
            const stepY = (vy / len) * PLAYER_SPEED;
            if (!obstacles.some(o => p.x + stepX < o.x + o.w && p.x + stepX + 40 > o.x && p.y < o.y + o.h && p.y + 40 > o.y)) p.x += stepX;
            if (!obstacles.some(o => p.x < o.x + o.w && p.x + 40 > o.x && p.y + stepY < o.y + o.h && p.y + stepY + 40 > o.y)) p.y += stepY;
        }
    });

    socket.on('shoot', (target) => {
        const p = players[socket.id];
        const now = Date.now();
        if (p && !p.dead && now - p.lastShootTime >= SHOOT_COOLDOWN) {
            const angle = Math.atan2(target.y - (p.y + 20), target.x - (p.x + 20));
            bullets.push({ x: p.x + 20, y: p.y + 20, velX: Math.cos(angle) * 15, velY: Math.sin(angle) * 15, owner: socket.id });
            p.lastShootTime = now;
        }
    });

    socket.on('disconnect', () => { 
        onlineCount--; 
        io.emit('updateOnline', onlineCount);
        delete players[socket.id]; 
    });
});

setInterval(() => {
    bullets = bullets.filter((b) => {
        b.x += b.velX; b.y += b.velY;
        let hit = false;
        if (obstacles.some(o => b.x > o.x && b.x < o.x + o.w && b.y > o.y && b.y < o.y + o.h)) hit = true;
        
        for (let id in players) {
            let p = players[id];
            if (id !== b.owner && !p.dead && b.x > p.x && b.x < p.x + 40 && b.y > p.y && b.y < p.y + 40) {
                p.hp -= 1; 
                hit = true;
                io.emit('hitEffect', { attackerId: b.owner, victimId: id, x: p.x, y: p.y });

                if (p.hp <= 0) {
                    p.dead = true;
                    setTimeout(() => {
                        const resp = getRandomRespawn();
                        p.x = resp.x; p.y = resp.y; p.hp = 3; p.dead = false;
                    }, 3000);
                }
            }
        }
        return !hit && b.x > 0 && b.x < MAP_SIZE && b.y > 0 && b.y < MAP_SIZE;
    });
    io.emit('update', { players, bullets });
}, 16);

// ПОРТ ДЛЯ RENDER
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));