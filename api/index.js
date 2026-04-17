const GameServer = require('../server/GameServer');

const dbUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/webcheckers';
const port = process.env.PORT || 3000;

const server = new GameServer(port, dbUrl);

server.setupMiddleware();
server.setupRoutes();

// The DB connection needs to happen, but Vercel is stateless
server.dbManager.connect().catch(console.error);
server.wsManager.initialize(server.dbManager);

module.exports = server.app;