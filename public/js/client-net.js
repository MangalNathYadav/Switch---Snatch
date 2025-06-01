// public/js/client-net.js

// 1. Establish socket connection (io() comes from /socket.io/socket.io.js)
const socket = io();

// Debug: Log when socket connects
socket.on('connect', () => {
  console.log('Connected to server with ID:', socket.id);
});

// 2. Keep track of:
//    a) otherPlayers: { socketId: { sprite: Phaser.Sprite, nameLabel: Phaser.Text, scoreText: Phaser.Text } }
//    b) coinsMap:     { coinId: Phaser.Sprite } (for quick lookup & removal)
const otherPlayers = {};
const coinsMap = {};

// ────────────────────────────────────────────────────────────────────────────────
// 3. Handle the initial state sent by the server when we first connect:
//    { players, coins, doorOpen }
socket.on('currentState', ({ players, coins, doorOpen }) => {
  console.log('Received currentState:', {
    playerCount: Object.keys(players).length,
    coinCount: Object.keys(coins).length,
    myId: socket.id,
    allPlayerIds: Object.keys(players)
  });

  // 3a. Add each existing player (except ourselves) who is ready
  Object.keys(players).forEach((id) => {
    if (id === socket.id) return;
    const info = players[id];
    if (info.readyState === true &&
        typeof info.x === 'number' &&
        typeof info.y === 'number') {
      addOtherPlayer(info, id);
    }
  });

  // 3b. Day 3+: render all existing coins
  Object.keys(coins).forEach((coinId) => {
    const { x, y } = coins[coinId];
    addCoinSprite(coinId, x, y);
  });

  // 3c. (Day 4+) If doorOpen === true, emit an event so game.js can remove it
  if (doorOpen) {
    game.events.emit('doorAlreadyOpen');
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 4. When a new player joins after us
socket.on('newPlayer', ({ playerId, data }) => {
  console.log(`Received newPlayer event for ${playerId}`, data);
  if (playerId === socket.id) return;

  if (data.readyState === true &&
      typeof data.x === 'number' &&
      typeof data.y === 'number') {
    addOtherPlayer(data, playerId);
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 5. When an existing player moves
socket.on('updatePosition', ({ playerId, x, y }) => {
  if (playerId === socket.id) return;

  const other = otherPlayers[playerId];
  if (other && other.sprite) {
    other.sprite.setPosition(x, y);
    other.nameLabel.setPosition(x, y - 32);
    other.scoreText.setPosition(x, y - 48);
  } else {
    console.warn(`Cannot update position: player ${playerId} not found.`);
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 6. When the server broadcasts that a player disconnected
socket.on('playerDisconnected', ({ playerId }) => {
  console.log(`Received playerDisconnected event for ${playerId}`);
  const other = otherPlayers[playerId];
  if (other) {
    other.sprite.destroy();
    other.nameLabel.destroy();
    other.scoreText.destroy();
    delete otherPlayers[playerId];
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 7. Day 3+: When the server spawns a new coin
socket.on('spawnCoin', ({ coinId, x, y }) => {
  addCoinSprite(coinId, x, y);
});

// ────────────────────────────────────────────────────────────────────────────────
// 8. Day 3+: When the server tells us to remove a coin
socket.on('removeCoin', ({ coinId }) => {
  if (coinsMap[coinId]) {
    coinsMap[coinId].destroy();
    delete coinsMap[coinId];
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 9. Day 3+: When someone earns a coin, update scores
socket.on('earnCoin', ({ playerId, newCount }) => {
  if (playerId === socket.id) {
    // It’s us: update our own on-screen score via game.js
    game.events.emit('updateMyScore', newCount);
  } else {
    const other = otherPlayers[playerId];
    if (other && other.scoreText) {
      other.scoreText.setText(`Coins: ${newCount}`);
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// Utility: create and store a Phaser sprite + labels for another player
function addOtherPlayer(playerInfo, id) {
  // Avoid adding ourselves
  if (id === socket.id) return;

  const scene = game.scene.scenes[0];

  // 1. Create the sprite: use 'player2' key, fallback to tinted 'player1' if needed
  let sprite;
  try {
    sprite = scene.physics.add.sprite(playerInfo.x, playerInfo.y, 'player2');
  } catch (err) {
    sprite = scene.physics.add.sprite(playerInfo.x, playerInfo.y, 'player1');
    sprite.setTint(Math.floor(Math.random() * 0xffffff));
  }
  sprite.setCollideWorldBounds(true);
  sprite.playerId = id;

  // 2. Name label (first 4 chars of socket ID)
  const nameLabel = scene.add.text(playerInfo.x, playerInfo.y - 32, id.slice(0, 4), {
    font: '10px PressStart2P, Arial',
    fill: '#ffffff'
  }).setOrigin(0.5);

  // 3. Score text (initially “Coins: N”)
  const scoreText = scene.add.text(playerInfo.x, playerInfo.y - 48, `Coins: ${playerInfo.coins || 0}`, {
    font: '12px PressStart2P, Arial',
    fill: '#ffff00'
  }).setOrigin(0.5);

  // 4. Store in our map
  otherPlayers[id] = { sprite, nameLabel, scoreText };
}

// ────────────────────────────────────────────────────────────────────────────────
// Utility: create and store a Phaser static sprite for a coin
function addCoinSprite(coinId, x, y) {
  const scene = game.scene.scenes[0];
  const coinSprite = scene.physics.add.staticSprite(x, y, 'coin');
  coinSprite.coinId = coinId;
  coinsMap[coinId] = coinSprite;
}
