// public/js/client-net.js

// 1. Establish socket connection (io() comes from /socket.io/socket.io.js)
const socket = io();

// 2. Keep track of:
//    a) otherPlayers: { socketId: { sprite: Phaser.Sprite, nameLabel: Phaser.Text, scoreText: Phaser.Text } }
//    b) coinsMap:     { coinId: Phaser.Sprite } (for quick lookup & removal)
const otherPlayers = {};
const coinsMap = {};

// ────────────────────────────────────────────────────────────────────────────────
// 3. Handle the initial state sent by the server when we first connect:
//    { players, coins, doorOpen }
socket.on('currentState', ({ players, coins, doorOpen }) => {
  // 3a. Render all existing players (except ourselves)
  Object.keys(players).forEach((id) => {
    if (id === socket.id) return;
    addOtherPlayer(players[id], id);
  });

  // 3b. Render all existing coins
  Object.keys(coins).forEach((coinId) => {
    const { x, y } = coins[coinId];
    addCoinSprite(coinId, x, y);
  });

  // 3c. (Optional) If doorOpen === true, remove the door in Phaser
  if (doorOpen) {
    // game.scene.scenes[0].removeDoorSprite();
    // We'll handle this in game.js when we code the door. For now, just log.
    console.log('Door was already open');
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 4. When a new player joins after us
socket.on('newPlayer', ({ playerId, data }) => {
  if (playerId === socket.id) return;
  addOtherPlayer(data, playerId);
});

// ────────────────────────────────────────────────────────────────────────────────
// 5. When an existing player moves
socket.on('updatePosition', ({ playerId, x, y }) => {
  const other = otherPlayers[playerId];
  if (other) {
    other.sprite.setPosition(x, y);
    // Keep their nameLabel & scoreText 20px above the head
    other.nameLabel.setPosition(x, y - 32);
    other.scoreText.setPosition(x, y - 48);
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 6. When the server broadcasts that a player disconnected
socket.on('playerDisconnected', ({ playerId }) => {
  if (otherPlayers[playerId]) {
    otherPlayers[playerId].sprite.destroy();
    otherPlayers[playerId].nameLabel.destroy();
    otherPlayers[playerId].scoreText.destroy();
    delete otherPlayers[playerId];
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 7. When the server spawns a new coin
socket.on('spawnCoin', ({ coinId, x, y }) => {
  addCoinSprite(coinId, x, y);
});

// ────────────────────────────────────────────────────────────────────────────────
// 8. When the server tells us to remove a coin (because someone picked it up)
socket.on('removeCoin', ({ coinId }) => {
  if (coinsMap[coinId]) {
    coinsMap[coinId].destroy();  // remove the sprite
    delete coinsMap[coinId];
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 9. When someone earns a coin (the server already incremented that player’s count)
//    data = { playerId, coinId, newCount }
socket.on('earnCoin', ({ playerId, coinId, newCount }) => {
  // 9a. Update that player's score count in their scoreText
  if (playerId === socket.id) {
    // It’s us: update our own on-screen score
    const { scoreText } = otherPlayers[playerId] || {};
    // However, we haven't added ourselves to otherPlayers. We'll handle our own scoreText in game.js.
    // Instead, emit a custom event so game.js can update our score.
    game.events.emit('updateMyScore', newCount);
  } else {
    // It’s someone else: update their scoreText
    const other = otherPlayers[playerId];
    if (other) {
      other.scoreText.setText(`Coins: ${newCount}`);
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// Utility: Add a Phaser sprite for another player
//   'playerInfo' = { x, y, coins, onSwitchA, onSwitchB, readyState }
//   'id'        = their socket ID
function addOtherPlayer(playerInfo, id) {
  const scene = game.scene.scenes[0];

  // 1. Create sprite (attempt 'player2', else 'player1' tinted)
  let sprite;
  try {
    sprite = scene.physics.add.sprite(playerInfo.x, playerInfo.y, 'player2');
  } catch (err) {
    sprite = scene.physics.add.sprite(playerInfo.x, playerInfo.y, 'player1');
    sprite.setTint(Math.floor(Math.random() * 0xffffff));
  }
  sprite.setCollideWorldBounds(true);
  sprite.playerId = id;               // attach socket ID
  sprite.coins = playerInfo.coins;    // how many they already have

  // 2. Name label (first 4 chars of ID)
  const nameLabel = scene.add.text(playerInfo.x, playerInfo.y - 32, id.slice(0, 4), {
    font: '10px PressStart2P, Arial',
    fill: '#ffffff'
  }).setOrigin(0.5);

  // 3. Score text (display current coins count)
  const scoreText = scene.add.text(playerInfo.x, playerInfo.y - 48, `Coins: ${playerInfo.coins}`, {
    font: '12px PressStart2P, Arial',
    fill: '#ffff00'
  }).setOrigin(0.5);

  // 4. Store in our map
  otherPlayers[id] = { sprite, nameLabel, scoreText };
}

// ────────────────────────────────────────────────────────────────────────────────
// Utility: Add a Phaser sprite for a coin at (x,y) with ID = coinId
function addCoinSprite(coinId, x, y) {
  const scene = game.scene.scenes[0];
  const coinSprite = scene.physics.add.staticSprite(x, y, 'coin');
  coinSprite.coinId = coinId;
  coinsMap[coinId] = coinSprite;
}
