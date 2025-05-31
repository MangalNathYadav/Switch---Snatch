// server/server.js
// 1. Load dependencies
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// 2. Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// 3. Attach Socket.io to the server
const io = new Server(server);

// 4. Serve static files from /public
app.use(express.static(path.join(__dirname, '../public')));

// 5. In-memory game state
const players = {};                // Will hold { socketId: { x, y, coins, onSwitchA, onSwitchB, readyState } }
let doorOpen = false;              // Has the door been opened?
const switchesPressed = { A: null, B: null };  // Which player is standing on switch A or B

// 6. Handle socket connections
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // 6a. Initialize player state when they join
  players[socket.id] = {
    x: 0,
    y: 0,
    coins: 0,
    onSwitchA: false,
    onSwitchB: false,
    readyState: false
  };

  // 6b. Send the existing state to the newcomer
  socket.emit('currentState', { players, doorOpen });

  // 6c. Tell everyone else a new player showed up
  socket.broadcast.emit('newPlayer', {
    playerId: socket.id,
    data: players[socket.id]
  });

  // 6d. When the client signals it’s fully loaded and gives its spawn position
  socket.on('playerReady', (data) => {
    // data = { x, y }
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].readyState = true;
    io.emit('playerJoinedScene', {
      playerId: socket.id,
      x: data.x,
      y: data.y
    });
  });

  // 6e. Handle movement updates (throttled on client)
  socket.on('playerMoved', (data) => {
    // data = { x, y }
    if (!players[socket.id]) return;
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    socket.broadcast.emit('updatePosition', {
      playerId: socket.id,
      x: data.x,
      y: data.y
    });
  });

  // 6f. Handle coin collection
  socket.on('coinCollected', ({ coinId }) => {
    if (!players[socket.id]) return;
    players[socket.id].coins += 1;
    io.emit('earnCoin', {
      playerId: socket.id,
      coinId,
      newCount: players[socket.id].coins
    });
  });

  // 6g. Handle when a player steps on a switch
  socket.on('switchPressed', ({ switchId }) => {
    if (!players[socket.id]) return;
    if (switchId === 'A') players[socket.id].onSwitchA = true;
    if (switchId === 'B') players[socket.id].onSwitchB = true;
    switchesPressed[switchId] = socket.id;

    // If both switch A and B are pressed by *any* two players and door isn’t open yet
    if (switchesPressed.A && switchesPressed.B && !doorOpen) {
      doorOpen = true;
      io.emit('openDoor');
    }
  });

  // 6h. Handle when a player releases a switch (steps off)
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

  // 6i. Clean up when a player disconnects
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerDisconnected', { playerId: socket.id });

    // If they were on a switch, free it up
    if (switchesPressed.A === socket.id) switchesPressed.A = null;
    if (switchesPressed.B === socket.id) switchesPressed.B = null;
  });
});

// 7. Start the server on port 3000
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
