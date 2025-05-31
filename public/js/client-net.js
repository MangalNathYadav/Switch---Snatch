// public/js/client-net.js

// 1. Create a socket.io connection (io() is provided by /socket.io/socket.io.js)
const socket = io();

// 2. Keep track of "other" players: a map from socketId → Phaser sprite
const otherPlayers = {};

// 3. Listen for the initial state from the server: all connected players + door status
socket.on('currentState', ({ players, doorOpen }) => {
  // 'players' is an object: { socketId1: { x, y, coins, ... }, socketId2: {...}, ... }
  Object.keys(players).forEach((id) => {
    // Skip ourselves (we'll add our own sprite in game.js)
    if (id === socket.id) return;
    // Add a sprite for each other player
    addOtherPlayer(players[id], id);
  });
});

// 4. When the server tells us a new player connected
socket.on('newPlayer', ({ playerId, data }) => {
  // 'data' = { x, y, coins, onSwitchA, onSwitchB, readyState }
  if (playerId === socket.id) return; // ignore if it's ourselves
  addOtherPlayer(data, playerId);
});

// 5. When the server broadcasts a position update for some other player
socket.on('updatePosition', ({ playerId, x, y }) => {
  const other = otherPlayers[playerId];
  if (other) {
    // Smoothly move or just set directly
    other.setPosition(x, y);
  }
});

// 6. When the server tells us a player disconnected
socket.on('playerDisconnected', ({ playerId }) => {
  if (otherPlayers[playerId]) {
    otherPlayers[playerId].destroy();      // remove sprite
    delete otherPlayers[playerId];         // remove from our map
  }
});

// 7. Utility function: create a new sprite for another player
//    'playerInfo' must at least have { x, y }. We assume "player1.png" is loaded.
function addOtherPlayer(playerInfo, id) {
  // game.scene.scenes[0] is the only scene we use (the "main" scene)
  const scene = game.scene.scenes[0];

  // Create a new sprite at given x,y. Use 'player2.png' if you have it; else tint 'player1'
  // If 'player2.png' does not exist, Phaser will throw an error. To be safe, check first:
  let sprite;
  try {
    // Attempt to use a second texture for other players
    sprite = scene.physics.add.sprite(playerInfo.x, playerInfo.y, 'player2');
  } catch (err) {
    // Fallback: use 'player1' and tint a random color
    sprite = scene.physics.add.sprite(playerInfo.x, playerInfo.y, 'player1');
    sprite.setTint(Math.floor(Math.random() * 0xffffff));
  }

  sprite.setCollideWorldBounds(true);
  sprite.playerId = id;              // attach the socket ID to this sprite
  sprite.coins = playerInfo.coins;   // track how many coins they've collected (not used yet)

  // Optionally, add a text label above their head (e.g., last 4 chars of the ID)
  const nameLabel = scene.add.text(playerInfo.x, playerInfo.y - 20, id.slice(0, 4), {
    font: '10px PressStart2P, Arial',
    fill: '#ffffff'
  }).setOrigin(0.5);
  sprite.nameLabel = nameLabel;

  // Save both sprite and label together, so we can update/remove them later
  otherPlayers[id] = { sprite, nameLabel };
}
