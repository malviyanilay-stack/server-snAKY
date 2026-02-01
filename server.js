// Multiplayer Snake.io Node.js/socket.io backend (multi-food, respawn-center, lag optimized)
// Now spawns 7 foods per room; respawn in grid center with score 0

const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, { cors: { origin: '*' } });

const GRID_SIZE = 20;
const FOOD_COUNT = 7; // 7 foods at once

// Compute grid center
const centerCell = { x: Math.floor(GRID_SIZE/2), y: Math.floor(GRID_SIZE/2) };

let rooms = {};

function randomEmptyCell(occupied = []) {
  let pos;
  let tries = 0;
  do {
    pos = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
    tries++;
  } while (occupied.some(o => o.x === pos.x && o.y === pos.y) && tries < 200);
  return pos;
}

function initFoods(snakes) {
  let occupied = [];
  snakes.forEach(s => occupied = occupied.concat(s));
  let foods = [];
  let safety = 0;
  while (foods.length < FOOD_COUNT && safety < 500) {
    const pos = randomEmptyCell(foods.concat(occupied));
    if (!foods.some(f => f.x === pos.x && f.y === pos.y)) {
      foods.push(pos);
    }
    safety++;
  }
  return foods;
}

io.on('connection', socket => {
  let room, name;

  socket.on('joinRoom', data => {
    room = data.room;
    name = data.name;
    if (!rooms[room]) {
      rooms[room] = {
        players: {},
        foods: []
      };
    }
    // Initialize player, start in center with score 0
    rooms[room].players[socket.id] = {
      id: socket.id,
      name: name,
      snake: [Object.assign({}, centerCell)],
      score: 0,
      dir: 'right',
      moveTime: 0
    };
    // Ensure foods exist
    const snakesFlat = Object.values(rooms[room].players).map(p => p.snake).flat();
    if (rooms[room].foods.length < FOOD_COUNT) {
      rooms[room].foods = initFoods(snakesFlat);
    }
    socket.join(room);
    io.to(room).emit('gameState', getState(room));
  });

  function canMove(player) {
    const now = Date.now();
    if (now - player.moveTime < 60) return false;
    player.moveTime = now;
    return true;
  }

  socket.on('update', data => {
    if (!room || !rooms[room] || !rooms[room].players[socket.id]) return;
    const player = rooms[room].players[socket.id];
    if (!canMove(player)) return;
    // Trust client to send valid snake array and score; enforce basic limits here if needed
    player.snake = Array.isArray(data.snake) ? data.snake : player.snake;
    player.score = typeof data.score === 'number' ? data.score : player.score;
    io.to(room).emit('gameState', getState(room));
  });

  socket.on('eatFood', coords => {
    if (!room || !rooms[room]) return;
    let foods = rooms[room].foods || [];
    // Remove the eaten food
    foods = foods.filter(f => !(f.x === coords.x && f.y === coords.y));
    // Refill up to FOOD_COUNT
    const snakesFlat = Object.values(rooms[room].players).map(p => p.snake).flat();
    let safety = 0;
    while (foods.length < FOOD_COUNT && safety < 500) {
      const newPos = randomEmptyCell(foods.concat(snakesFlat));
      if (!foods.some(f => f.x === newPos.x && f.y === newPos.y)) {
        foods.push(newPos);
      }
      safety++;
    }
    rooms[room].foods = foods;
    io.to(room).emit('gameState', getState(room));
  });

  socket.on('restart', () => {
    if (!room || !rooms[room] || !rooms[room].players[socket.id]) return;
    // Respawn exactly at center with score 0 and reset direction
    rooms[room].players[socket.id].score = 0;
    rooms[room].players[socket.id].snake = [Object.assign({}, centerCell)];
    rooms[room].players[socket.id].dir = 'right';
    io.to(room).emit('gameState', getState(room));
  });

  socket.on('disconnect', () => {
    if (!room || !rooms[room]) return;
    delete rooms[room].players[socket.id];
    if (Object.keys(rooms[room].players).length === 0) {
      delete rooms[room];
    } else {
      io.to(room).emit('gameState', getState(room));
    }
  });
});

function getState(room) {
  if (!rooms[room]) return {};
  return {
    players: rooms[room].players,
    foods: rooms[room].foods
  };
}

const port = process.env.PORT || 3000;
http.listen(port, () => console.log('Server running on port ' + port));
