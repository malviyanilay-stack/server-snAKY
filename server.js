// Multiplayer Snake.io Node.js/socket.io backend (multi-food, lag optimized)
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, { cors: { origin: '*' } });

const GRID_SIZE = 20;
const FOOD_COUNT = 4; // Always keep 4 separate food items

let rooms = {};

function randomEmptyCell(occupied=[]) {
  let pos;
  let failsafe = 0;
  do {
    pos = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
    failsafe++;
  } while (
    occupied.some(o => o.x === pos.x && o.y === pos.y)
    && failsafe < 100
  );
  return pos;
}

function initFoods(snakes) {
  let occupied = [];
  snakes.forEach(s => occupied = occupied.concat(s));
  let foods = [];
  while (foods.length < FOOD_COUNT) {
    let pos = randomEmptyCell(foods.concat(occupied));
    foods.push(pos);
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
    // Setup player state
    rooms[room].players[socket.id] = {
      id: socket.id,
      name: name,
      snake: [{ x: 2, y: 2 }],
      score: 0,
      dir: 'right',
      moveTime: 0
    };
    // If new or empty, generate foods
    let snakes = Object.values(rooms[room].players).map(p => p.snake).flat();
    if (rooms[room].foods.length < FOOD_COUNT) {
      rooms[room].foods = initFoods(snakes);
    }
    socket.join(room);
    io.to(room).emit('gameState', getState(room));
  });

  // Rate-limit moves (optional, for lag/collisions)
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
    player.snake = data.snake;
    player.score = data.score;
    io.to(room).emit('gameState', getState(room));
  });

  socket.on('move', data => {
    // Not used in this model—movement is on-tap, move logic is on client.
  });

  socket.on('eatFood', coords => {
    if (!room || !rooms[room]) return;
    let foods = rooms[room].foods;
    // Remove food at given coords
    foods = foods.filter(f => !(f.x === coords.x && f.y === coords.y));
    // Spawn new food in an empty cell
    let snakes = Object.values(rooms[room].players).map(p => p.snake).flat();
    while (foods.length < FOOD_COUNT) {
      foods.push(randomEmptyCell(foods.concat(snakes)));
    }
    rooms[room].foods = foods;
    io.to(room).emit('gameState', getState(room));
  });

  socket.on('restart', () => {
    if (!room || !rooms[room] || !rooms[room].players[socket.id]) return;
    rooms[room].players[socket.id].score = 0;
    rooms[room].players[socket.id].snake = [{ x: 2, y: 2 }];
    rooms[room].players[socket.id].dir = 'right';
    io.to(room).emit('gameState', getState(room));
  });

  socket.on('disconnect', () => {
    if (!room || !rooms[room] || !rooms[room].players[socket.id]) return;
    delete rooms[room].players[socket.id];
    // Clean up empty room
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

// Accept PORT env var (for Render)
const port = process.env.PORT || 3000;
http.listen(port, () => console.log('Server running on port ' + port));
