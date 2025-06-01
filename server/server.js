// server/server.js

// 1. Load dependencies
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// 2. Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// 3. Attach Socket.io to that server
const io = new Server(server);

// 4. Serve static files from /public
app.use(express.static(path.join(__dirname, '../public')));

// ────────────────────────────────────────────────────────────────────────────────
// 5. In-memory state trackers:

// 5a. Track all connected players and their metadata
//     Format: { socketId1: { x, y, coins, onSwitchA, onSwitchB, readyState }, … }
const players = {};

// 5b. Track all active coins in the world
//     Format: { coinId1: { x, y }, coinId2: { x, y }, … }
const coins = {};

// 5c. Door state and switches (reserved for Day 4+)
let doorOpen = false;
const switchesPressed = { A: null, B: null };

// ────────────────────────────────────────────────────────────────────────────────
// 6. Helper: spawn a new coin at a random location and broadcast it
function spawnCoin() {
  // 6a. Generate a unique coinId (timestamp + random)
  const coinId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  // 6b. Choose a random x,y within 50–750 and 50–550 (so coins don't land on edges)
  const x = Math.floor(Math.random() * 700) + 50;
  const y = Math.floor(Math.random() * 500) + 50;

  // 6c. Add to our in-memory coins list
  coins[coinId] = { x, y };

  // 6d. Broadcast to all clients: “Here’s a new coin with this ID at (x,y)”
  io.emit('spawnCoin', { coinId, x, y });
}

// 6e. Set an interval to spawn a coin every 3 seconds (3000 ms)
const spawnIntervalId = setInterval(spawnCoin, 3000);

// ────────────────────────────────────────────────────────────────────────────────
// 7. Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // 7a. Initialize this player's state
  players[socket.id] = {
    x: 0,
    y: 0,
    coins: 0,
    onSwitchA: false,
    onSwitchB: false,
    readyState: false
  };

  // 7b. When a new client connects, send them:
  //     - All existing players & their data
  //     - All currently spawned coins
  //     - Current door state
  socket.emit('currentState', {
    players,
    coins,
    doorOpen
  });

  // 7c. Tell everyone else: “A new player joined”
  socket.broadcast.emit('newPlayer', {
    playerId: socket.id,
    data: players[socket.id]
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // 7d. When this client signals “I’m loaded and here’s my spawn pos”
  socket.on('playerReady', (data) => {
    // data = { x, y }
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].readyState = true;

    // Broadcast: “PlayerId X has joined the scene at (x,y)”
    io.emit('playerJoinedScene', {
      playerId: socket.id,
      x: data.x,
      y: data.y
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // 7e. Movement updates—throttled on the client side
  socket.on('playerMoved', (data) => {
    // data = { x, y }
    if (!players[socket.id]) return;
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;

    // Broadcast to everyone except the mover:
    socket.broadcast.emit('updatePosition', {
      playerId: socket.id,
      x: data.x,
      y: data.y
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // 7f. When a client collects a coin:
  //     data = { coinId }
  socket.on('coinCollected', (data) => {
    const { coinId } = data;
    // If this coin still exists on server:
    if (coins[coinId] !== undefined && players[socket.id]) {
      // 1. Remove it from the server’s coin list so nobody else can grab it
      delete coins[coinId];

      // 2. Give the collecting player +1 to their coins count
      players[socket.id].coins += 1;

      // 3. Broadcast “removeCoin” so everyone destroys that coin sprite
      io.emit('removeCoin', { coinId });

      // 4. Broadcast “earnCoin” so everyone can update that player’s score display
      io.emit('earnCoin', {
        playerId: socket.id,
        coinId,
        newCount: players[socket.id].coins
      });
    }
    // If coinId didn’t exist (someone else grabbed it first), do NOTHING.
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // 7g. (Optional) Switch pressed logic—reserved for Day 4+
  socket.on('switchPressed', ({ switchId }) => {
    if (!players[socket.id]) return;
    if (switchId === 'A') players[socket.id].onSwitchA = true;
    if (switchId === 'B') players[socket.id].onSwitchB = true;
    switchesPressed[switchId] = socket.id;
    if (switchesPressed.A && switchesPressed.B && !doorOpen) {
      doorOpen = true;
      io.emit('openDoor');
    }
  });

  // 7h. (Optional) Switch released logic—reserved for Day 4+
  socket.on('switchReleased', ({ switchId }) => {
    if (!players[socket.id]) return;
    if (switchId === 'A') {
      players[socket.id].onSwitchA = false;
      if (switchesPressed.A === socket.id) switchesPressed.A = null;
    }
    if (switchId === 'B') {
      players[socket.id].onSwitchB = false;
      if (switchesPressed.B === socket.id) switchesPressed.B = null;
    }
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // 7i. Handle client disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    // 1. Remove from players list
    delete players[socket.id];

    // 2. Broadcast to everyone to remove that player’s sprite & label
    io.emit('playerDisconnected', { playerId: socket.id });

    // 3. Free up any switch they were holding
    if (switchesPressed.A === socket.id) switchesPressed.A = null;
    if (switchesPressed.B === socket.id) switchesPressed.B = null;
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 8. Start the server on port 3000
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
