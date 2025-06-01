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
// 5. In‐memory state trackers:

// 5a. Track all connected players and their metadata
//     Format: { socketId1: { x, y, coins, onSwitchA, onSwitchB, readyState }, socketId2: {…}, … }
const players = {};

// 5b. Track all active coins in the world
//     Format: { coinId1: { x, y }, coinId2: { x, y }, … }
const coins = {};

// 5c. Door state and switches (we’ll need these if you implement the “door” later; safe to leave)
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

  // 6c. Add to our in‐memory coins list
  coins[coinId] = { x, y };

  // 6d. Broadcast to all clients: “Here’s a new coin with this ID at (x,y)”
  io.emit('spawnCoin', { coinId, x, y });
}

// 6e. Set an interval to spawn a coin every 3 seconds (3000 ms)
//     Adjust this interval if you want more or fewer coins.
setInterval(spawnCoin, 3000);

// ────────────────────────────────────────────────────────────────────────────────
// Helper function to clean up stale players (those who connected but never became ready or are inactive)
function cleanupStalePlayers() {
  const now = Date.now();
  const newPlayerTimeout = 10000; // 10 seconds for players who never became ready
  const inactiveTimeout = 30000; // 30 seconds for players who haven't moved
  
  for (const id in players) {
    // Case 1: Player connected but never became ready
    if (!players[id].readyState && players[id].connectTime && (now - players[id].connectTime > newPlayerTimeout)) {
      console.log(`Removing stale player ${id} who never became ready`);
      delete players[id];
      io.emit('playerDisconnected', { playerId: id });
    }
    // Case 2: Player was active but hasn't moved in a while
    else if (players[id].readyState && players[id].lastActive && (now - players[id].lastActive > inactiveTimeout)) {
      console.log(`Removing inactive player ${id} who hasn't moved in 30 seconds`);
      delete players[id];
      io.emit('playerDisconnected', { playerId: id });
    }
  }

  // Periodically broadcast the full player list to all clients for synchronization
  io.emit('activePlayersList', {
    playerIds: Object.keys(players)
  });
}

// Run cleanup every 10 seconds
setInterval(cleanupStalePlayers, 10000);

// ────────────────────────────────────────────────────────────────────────────────
// 7. Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  console.log(`Current players: ${Object.keys(players).join(', ')}`);

  // 7a. Initialize this player's state
  players[socket.id] = {
    x: 0,
    y: 0,
    coins: 0,
    onSwitchA: false,
    onSwitchB: false,
    readyState: false,
    connectTime: Date.now() // Track connection time for this player
  };

  // 7b. When a new client connects, send them:
  //     - All existing players & their data
  //     - All currently spawned coins
  //     - Current door state (if you'll use it)
  console.log(`Sending currentState to ${socket.id} with players: ${Object.keys(players).join(', ')}`);
  socket.emit('currentState', {
    players,
    coins,     // so the newcomer can render existing coins
    doorOpen
  });

  // 7c. Tell everyone else: "A new player joined"
  console.log(`Broadcasting newPlayer event for ${socket.id} to others`);
  socket.broadcast.emit('newPlayer', {
    playerId: socket.id,
    data: players[socket.id]
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // 7d. When this client signals "I'm loaded and here's my spawn pos"
  socket.on('playerReady', (data) => {
    // data = { x, y }
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].readyState = true;
    players[socket.id].lastActive = Date.now(); // Track when the player was last active

    console.log(`Player ${socket.id} is READY at position (${data.x}, ${data.y})`);
    console.log(`Current server players: ${Object.keys(players).join(', ')}`);

    // Broadcast: "PlayerId X has joined the scene at (x,y)"
    io.emit('playerJoinedScene', {
      playerId: socket.id,
      x: data.x,
      y: data.y
    });
    
    // Send player information to ensure all clients are synchronized
    console.log(`Broadcasting player ${socket.id} to all clients to ensure visibility`);
    
    // First update everyone else about this player
    socket.broadcast.emit('newPlayer', {
      playerId: socket.id,
      data: players[socket.id]
    });
    
    // Then send this player info about all other players (one by one for reliability)
    Object.keys(players).forEach(id => {
      if (id !== socket.id && players[id].readyState) {
        console.log(`Sending player ${id} info to new player ${socket.id}`);
        socket.emit('newPlayer', {
          playerId: id,
          data: players[id]
        });
      }
    });
  });
  // 7e. Movement updates—throttled on the client side
  socket.on('playerMoved', (data) => {
    // data = { x, y }
    if (!players[socket.id]) return;
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].lastActive = Date.now(); // Update last active timestamp
    
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
  // 7g. (Optional) Switch pressed logic—leave it for Day 4 if you use it
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

  // 7h. (Optional) Switch released logic
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

  // Handle getActivePlayers request
  socket.on('getActivePlayers', () => {
    console.log(`${socket.id} requested active players list`);
    socket.emit('activePlayersList', {
      playerIds: Object.keys(players)
    });
  });
  // Handle requestPlayerInfo - send info about a specific player
  socket.on('requestPlayerInfo', ({ playerId }) => {
    console.log(`${socket.id} requested info about player ${playerId}`);
    console.log(`Current players on server: ${Object.keys(players).join(', ')}`);
    
    if (players[playerId]) {
      console.log(`Found player ${playerId}, sending data:`, players[playerId]);
      socket.emit('newPlayer', {
        playerId: playerId,
        data: players[playerId]
      });
    } else {
      console.log(`${playerId} not found in players object`);
      // If we don't have this player, tell the client to remove it
      socket.emit('playerDisconnected', { playerId });
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 8. Start the server on port 3000
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
