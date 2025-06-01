// public/js/game.js

// 1. Phaser game configuration
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game-container',  // HTML <div id="game-container"></div>
  physics: {
    default: 'arcade',
    arcade: {
      debug: false  // set to true if you want collision outlines
    }
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};

// 2. Create the Phaser game instance
const game = new Phaser.Game(config);

// 3. Global variables for our scene
let player;                 // this client’s own sprite
let cursors;                // for arrow‐key input
let lastSent = 0;           // timestamp of last emit('playerMoved')

// 4. Preload assets
function preload() {
  // These paths are relative to public/index.html. Since assets are in public/assets:
  this.load.image('player1', 'assets/player1.png');
  this.load.image('player2', 'assets/player2.png');
  // (If you’re on Day 3+, also preload coin.png, etc.)
}

// 5. Create scene
function create() {
  // 5a. Spawn position for this player (random within 100px margin)
  const spawnX = Phaser.Math.Between(100, 700);
  const spawnY = Phaser.Math.Between(100, 500);

  // 5b. Create our sprite using key 'player1'
  player = this.physics.add.sprite(spawnX, spawnY, 'player1');
  player.setCollideWorldBounds(true);
  player.coins = 0;   // track how many coins we collected (Day 3+)

  // 5c. Notify server that we're ready and send our starting pos
  socket.emit('playerReady', { x: spawnX, y: spawnY });

  // 5d. Set up arrow keys (up/down/left/right)
  cursors = this.input.keyboard.createCursorKeys();

  // 5e. Placeholder for future events (Day 3+)
  // socket.on('playerJoinedScene', ({ playerId, x, y }) => { … });
  // socket.on('openDoor', () => { … });
}

// 6. Update loop (called ~60 times/sec)
function update(time) {
  if (!player) return;

  // 6a. Reset velocity each frame
  player.setVelocity(0);

  // 6b. Basic arrow‐key movement controls
  const speed = 200;
  if (cursors.left.isDown) {
    player.setVelocityX(-speed);
  } else if (cursors.right.isDown) {
    player.setVelocityX(speed);
  }
  if (cursors.up.isDown) {
    player.setVelocityY(-speed);
  } else if (cursors.down.isDown) {
    player.setVelocityY(speed);
  }

  // 6c. Emit 'playerMoved' at most every 50 ms so we don't spam the server
  if (time - lastSent > 50) {
    socket.emit('playerMoved', { x: player.x, y: player.y });
    lastSent = time;
  }

  // 6d. (Day 3+) If you have your own score text above your head, update its position here.
  // e.g. myScoreText.setPosition(player.x, player.y - 48);
}
