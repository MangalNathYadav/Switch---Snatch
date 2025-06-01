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
  
  // Get a definitive list of active player IDs from the server (excluding ourselves)
  const activeServerPlayerIds = Object.keys(players).filter(id => id !== socket.id);
  console.log(`Active server players (excluding me): ${activeServerPlayerIds.join(', ')}`);
  
  // First, remove any players in our local list that aren't in the server's list
  Object.keys(otherPlayers).forEach((id) => {
    if (!activeServerPlayerIds.includes(id)) {
      console.log(`Removing stale player ${id} from local list - not in server's active list`);
      if (otherPlayers[id]) {
        if (otherPlayers[id].sprite) otherPlayers[id].sprite.destroy();
        if (otherPlayers[id].nameLabel) otherPlayers[id].nameLabel.destroy();
        if (otherPlayers[id].scoreText) otherPlayers[id].scoreText.destroy();
        delete otherPlayers[id];
      }
    }
  });
  
  // 3a. Render all existing players from the server (except ourselves)
  activeServerPlayerIds.forEach((id) => {
    if (otherPlayers[id]) {
      // Player already exists in our local list, update their position
      console.log(`Updating existing player ${id} position to:`, players[id]);
      otherPlayers[id].sprite.setPosition(players[id].x, players[id].y);
      if (otherPlayers[id].nameLabel) otherPlayers[id].nameLabel.setPosition(players[id].x, players[id].y - 32);
      if (otherPlayers[id].scoreText) otherPlayers[id].scoreText.setPosition(players[id].x, players[id].y - 48);
    } else {
      // New player we don't have yet, add them
      console.log(`Adding new player ${id} at position:`, players[id]);
      addOtherPlayer(players[id], id);
    }
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
  console.log(`Received newPlayer event for ${playerId}`, data);
  if (playerId === socket.id) {
    console.log('Ignoring newPlayer event for self');
    return;
  }
  
  // Check if we already have this player in our local list
  if (otherPlayers[playerId] && otherPlayers[playerId].sprite) {
    console.log(`Player ${playerId} already exists in our local list, updating position`);
    // Update position instead of creating a new sprite
    otherPlayers[playerId].sprite.setPosition(data.x, data.y);
    if (otherPlayers[playerId].nameLabel) otherPlayers[playerId].nameLabel.setPosition(data.x, data.y - 32);
    if (otherPlayers[playerId].scoreText) otherPlayers[playerId].scoreText.setPosition(data.x, data.y - 48);
    return;
  }
  
  console.log(`Adding new player ${playerId} at position:`, data);
  addOtherPlayer(data, playerId);
});

// ────────────────────────────────────────────────────────────────────────────────
// 5. When an existing player moves
socket.on('updatePosition', ({ playerId, x, y }) => {
  // Skip updating our own player position from the server
  if (playerId === socket.id) return;

  const other = otherPlayers[playerId];
  if (other && other.sprite) {
    // Update the sprite and UI elements
    try {
      other.sprite.setPosition(x, y);
      // Keep their nameLabel & scoreText above the head
      if (other.nameLabel) other.nameLabel.setPosition(x, y - 32);
      if (other.scoreText) other.scoreText.setPosition(x, y - 48);
      // Update the last update time
      other.lastUpdated = Date.now();
    } catch (err) {
      console.error(`Error updating player ${playerId} position:`, err);
      // If there was an error updating, try to recreate the sprite
      removePlayerSprite(playerId);
      socket.emit('requestPlayerInfo', { playerId });
    }
  } else {
    console.log(`Cannot update position for player ${playerId} - player not found or missing sprite`);
    console.log('Current otherPlayers:', Object.keys(otherPlayers));
    
    // If the player doesn't exist in our local list, request their info from the server
    if (!other && playerId !== socket.id) {
      console.log(`Trying to add missing player ${playerId}`);
      socket.emit('requestPlayerInfo', { playerId });
      // Also request a full player list sync to ensure we haven't missed anything
      socket.emit('getActivePlayers');
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 6. When the server broadcasts that a player disconnected
socket.on('playerDisconnected', ({ playerId }) => {
  console.log(`Received playerDisconnected event for ${playerId}`);
  
  // Use our removePlayerSprite helper function for consistent cleanup
  removePlayerSprite(playerId);
  
  // Force a check with the server to ensure our player list is in sync
  socket.emit('getActivePlayers');
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
// Clean up any stale players in the otherPlayers object that didn't properly disconnect
function cleanupStalePlayerSprites() {
  console.log('Running periodic sprite cleanup check');
  // Get list of players from the server
  socket.emit('getActivePlayers');
}

// Function to safely remove a player sprite and its associated elements
function removePlayerSprite(playerId) {
  console.log(`Removing player sprite for ${playerId}`);
  if (otherPlayers[playerId]) {
    // Check if elements exist before destroying them
    try {
      if (otherPlayers[playerId].sprite && otherPlayers[playerId].sprite.destroy) {
        otherPlayers[playerId].sprite.destroy();
      }
      if (otherPlayers[playerId].nameLabel && otherPlayers[playerId].nameLabel.destroy) {
        otherPlayers[playerId].nameLabel.destroy();
      }
      if (otherPlayers[playerId].scoreText && otherPlayers[playerId].scoreText.destroy) {
        otherPlayers[playerId].scoreText.destroy();
      }
    } catch (e) {
      console.error(`Error cleaning up player ${playerId}:`, e);
    }
    
    // Remove from our tracking object
    delete otherPlayers[playerId];
  }
}

// Listen for active players list from server
socket.on('activePlayersList', ({ playerIds }) => {
  console.log('Received active players list:', playerIds);
  
  // Filter out our own ID
  const activeServerPlayerIds = playerIds.filter(id => id !== socket.id);
  console.log(`Active server players (excluding me): ${activeServerPlayerIds.join(', ')}`);
  
  // Find any players in our local list that aren't in the server's list
  const localPlayerIds = Object.keys(otherPlayers);
  console.log(`Local player sprites: ${localPlayerIds.join(', ')}`);
  
  localPlayerIds.forEach(id => {
    if (!activeServerPlayerIds.includes(id)) {
      console.log(`Found stale player ${id} - removing from local list`);
      removePlayerSprite(id);
    }
  });
  
  // Also check for any players in the server list that aren't in our local list
  activeServerPlayerIds.forEach(id => {
    if (!otherPlayers[id]) {
      console.log(`Found missing player ${id} - requesting player info`);
      socket.emit('requestPlayerInfo', { playerId: id });
    }
  });
});

// Run cleanup check every 3 seconds
setInterval(cleanupStalePlayerSprites, 3000);

// ────────────────────────────────────────────────────────────────────────────────
// Utility: Add a Phaser sprite for another player
//   'playerInfo' = { x, y, coins, onSwitchA, onSwitchB, readyState }
//   'id'        = their socket ID
function addOtherPlayer(playerInfo, id) {
  console.log(`addOtherPlayer called for ID: ${id} at position:`, playerInfo);
  
  // Safety check: prevent adding ourselves or players with invalid data
  if (id === socket.id) {
    console.log('Attempted to add self as other player - ignoring');
    return;
  }
  
  if (!playerInfo || typeof playerInfo.x === 'undefined' || typeof playerInfo.y === 'undefined') {
    console.error('Invalid playerInfo data:', playerInfo);
    return;
  }
  
  // Check if player already exists, remove first to prevent duplicates
  if (otherPlayers[id]) {
    console.log(`Player ${id} already exists, removing before re-adding`);
    if (otherPlayers[id].sprite) otherPlayers[id].sprite.destroy();
    if (otherPlayers[id].nameLabel) otherPlayers[id].nameLabel.destroy();
    if (otherPlayers[id].scoreText) otherPlayers[id].scoreText.destroy();
    delete otherPlayers[id];
  }
  
  const scene = game.scene.scenes[0];

  // 1. Create sprite (attempt 'player2', else 'player1' tinted)
  let sprite;
  try {
    sprite = scene.physics.add.sprite(playerInfo.x, playerInfo.y, 'player2');
    console.log(`Created sprite for player ${id} using player2 texture at (${playerInfo.x}, ${playerInfo.y})`);
  } catch (err) {
    console.log(`Failed to use player2 texture, using player1 with tint for ${id}:`, err);
    try {
      sprite = scene.physics.add.sprite(playerInfo.x, playerInfo.y, 'player1');
      sprite.setTint(Math.floor(Math.random() * 0xffffff));
    } catch (err2) {
      console.error(`Failed to create sprite for player ${id}:`, err2);
      return; // Exit if we can't create a sprite
    }
  }
  
  sprite.setCollideWorldBounds(true);
  sprite.playerId = id;               // attach socket ID
  sprite.coins = playerInfo.coins || 0;    // how many they already have

  // 2. Name label (first 4 chars of ID)
  const nameLabel = scene.add.text(playerInfo.x, playerInfo.y - 32, id.slice(0, 4), {
    font: '10px PressStart2P, Arial',
    fill: '#ffffff'
  }).setOrigin(0.5);

  // 3. Score text (display current coins count)
  const scoreText = scene.add.text(playerInfo.x, playerInfo.y - 48, `Coins: ${playerInfo.coins || 0}`, {
    font: '12px PressStart2P, Arial',
    fill: '#ffff00'
  }).setOrigin(0.5);

  // 4. Store in our map
  otherPlayers[id] = { sprite, nameLabel, scoreText, lastUpdated: Date.now() };
  console.log(`Successfully added player ${id} to local players list at (${playerInfo.x}, ${playerInfo.y})`);
}

// ────────────────────────────────────────────────────────────────────────────────
// Utility: Add a Phaser sprite for a coin at (x,y) with ID = coinId
function addCoinSprite(coinId, x, y) {
  const scene = game.scene.scenes[0];
  const coinSprite = scene.physics.add.staticSprite(x, y, 'coin');
  coinSprite.coinId = coinId;
  coinsMap[coinId] = coinSprite;
}
