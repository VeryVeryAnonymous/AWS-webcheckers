const GameServer = require('./GameServer');

const dbUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/webcheckers';
const port = process.env.PORT || 3000;

const server = new GameServer(port, dbUrl);

server.start().catch((error) => {
  console.error('Erreur démarrage serveur:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('Arrêt du serveur...');
  await server.stop();
  process.exit(0);
});
