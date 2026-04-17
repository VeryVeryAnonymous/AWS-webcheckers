const WebSocket = require('ws');
const { ObjectId } = require('mongodb');

class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.connections = new Map();
    this.activeGames = new Map();
    this.userConnections = new Map();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.wss.on('connection', (ws) => {
      ws.id = this.generateId();
      ws.userId = null;
      ws.gameId = null;
      ws.isAlive = true;

      ws.on('message', (message) => this.handleMessage(ws, message));
      ws.on('close', () => this.handleDisconnect(ws));
      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('error', (error) => this.handleError(ws, error));
    });

    this.startHeartbeat();
  }

  initialize(dbManager) {
    this.dbManager = dbManager;
  }

  handleMessage(ws, rawMessage) {
    try {
      const message = JSON.parse(rawMessage);

      if (!message.type) {
        this.sendError(ws, 'Message invalide: type manquant');
        return;
      }

      switch (message.type) {
        case 'authenticate':
          this.handleAuthenticate(ws, message);
          break;
        case 'joinGame':
          this.handleJoinGame(ws, message);
          break;
        case 'leaveGame':
          this.handleLeaveGame(ws, message);
          break;
        case 'movePiece':
          this.handleMovePiece(ws, message);
          break;
        case 'getValidMoves':
          this.handleGetValidMoves(ws, message);
          break;
        case 'chatMessage':
          this.handleChatMessage(ws, message);
          break;
        case 'spectate':
          this.handleSpectate(ws, message);
          break;
        case 'abandonGame':
          this.handleAbandonGame(ws, message);
          break;
        default:
          this.sendError(ws, 'Type de message inconnu');
      }
    } catch (error) {
      this.sendError(ws, 'Erreur lors du traitement du message');
    }
  }

  handleAuthenticate(ws, message) {
    if (!message.userId) {
      this.sendError(ws, 'userId manquant');
      return;
    }

    ws.userId = message.userId;
    ws.username = message.username || null;
    this.connections.set(ws.id, ws);

    // Ajouter dans userConnections
    if (!this.userConnections.has(ws.userId)) {
      this.userConnections.set(ws.userId, new Set());
    }
    var isFirstConnection = this.userConnections.get(ws.userId).size === 0;
    this.userConnections.get(ws.userId).add(ws.id);

    // Sans ca lors de la première connexion d'un utilisateur, il ne verra pas ses amis en ligne (car il n'est pas encore considéré comme en ligne)
    if (isFirstConnection) {
      this.notifierAmisEnLigne(ws.userId, ws.username);
    }

    this.send(ws, {
      type: 'authenticated',
      success: true,
      connectionId: ws.id
    });
  }

  async handleJoinGame(ws, message) {
    if (!ws.userId) {
      this.sendError(ws, 'Non authentifié');
      return;
    }

    if (!message.gameId) {
      this.sendError(ws, 'gameId manquant');
      return;
    }

    ws.gameId = message.gameId;

    if (!this.activeGames.has(message.gameId)) {
      this.activeGames.set(message.gameId, new Set());
    }

    this.activeGames.get(message.gameId).add(ws.id);

    // Déterminer la couleur du joueur et récupérer l'état du plateau depuis la BDD pour l'envoyer a l'utilisateur qui rejoint la partie
    let playerColor = null;
    let board = null;
    let gameStatus = null;
    let playersInfo = { white: null, black: null };

    if (this.dbManager) {
      try {
        const { ObjectId } = require('mongodb');
        const game = await this.dbManager.db.collection('games').findOne({ _id: new ObjectId(message.gameId) });
        if (game) {
          if (game.whitePlayerId && game.whitePlayerId.toString() === ws.userId) {
            playerColor = 'white';
          } else if (game.blackPlayerId && game.blackPlayerId.toString() === ws.userId) {
            playerColor = 'black';
          }
          board = game.currentBoardState || null;
          gameStatus = game.status;

          // Fetch user info for UI display
          if (game.whitePlayerId) {
             const whiteUser = await this.dbManager.db.collection('users').findOne({ _id: game.whitePlayerId });
             if (whiteUser) playersInfo.white = { name: whiteUser.username, wins: whiteUser.stats.wins, losses: whiteUser.stats.losses };
          }
          if (game.blackPlayerId) {
             const blackUser = await this.dbManager.db.collection('users').findOne({ _id: game.blackPlayerId });
             if (blackUser) playersInfo.black = { name: blackUser.username, wins: blackUser.stats.wins, losses: blackUser.stats.losses };
          }
        }
      } catch (e) {
        console.error('Erreur :', e);
      }
    }

    this.send(ws, {
      type: 'gameJoined',
      success: true,
      gameId: message.gameId,
      playerColor: playerColor,
      gameStatus: gameStatus,
      board: board,
      playersInfo: playersInfo
    });

    this.broadcastToGame(message.gameId, {
      type: 'playerJoined',
      userId: ws.userId,
      playersInfo: playersInfo,
      timestamp: new Date()
    }, ws.id);
  }

  handleLeaveGame(ws, message) {
    if (!ws.gameId) {
      this.sendError(ws, 'Pas dans une partie');
      return;
    }

    const gameId = ws.gameId;
    this.activeGames.get(gameId)?.delete(ws.id);

    if (this.activeGames.get(gameId)?.size === 0) {
      this.activeGames.delete(gameId);
    }

    ws.gameId = null;

    this.send(ws, {
      type: 'gameLeft',
      success: true
    });
  }

  handleMovePiece(ws, message) {
    if (!ws.userId || !ws.gameId) {
      this.sendError(ws, 'Non authentifié ou pas dans une partie');
      return;
    }

    if (!this.validateMoveMessage(message)) {
      this.sendError(ws, 'Données de mouvement invalides');
      return;
    }

    const CheckersEngine = require('./CheckersEngine');
    const engine = new CheckersEngine();
    
    if (message.boardState) {
        engine.damier = message.boardState;
    }
    
    const piece = engine.damier[message.from.row][message.from.col];
    if (!piece) {
       this.sendError(ws, 'Aucune pièce à cette position');
       return;
    }
    
    engine.currentPlayer = piece.player;
    const selectRes = engine.selectPiece(message.from.row, message.from.col);
    
    if (!selectRes.success) {
        this.sendError(ws, selectRes.error);
        return;
    }

    const moveRes = engine.movePiece(message.to.row, message.to.col);
    if (!moveRes.success) {
        this.sendError(ws, moveRes.error);
        return;
    }

    if (engine.gameOver && this.dbManager) {
        // Enregistre les stats de victoire de fin de match réelle !
        // find the actual DB game document
        try {
            this.dbManager.db.collection('games').findOne({ _id: new ObjectId(ws.gameId) })
            .then(game => {
                 if (game && game.status !== 'finished') {
                    const winnerId = engine.winner === 'white' ? game.whitePlayerId.toString() : (game.blackPlayerId ? game.blackPlayerId.toString() : null);
                    let whiteDelta = { wins: 0, losses: 0 };
                    let blackDelta = { wins: 0, losses: 0 };
                    
                    if (engine.winner === 'white') {
                        whiteDelta.wins = 1; 
                        blackDelta.losses = 1;
                    } else if (engine.winner === 'black') {
                        blackDelta.wins = 1;
                        whiteDelta.losses = 1;
                    }

                    this.dbManager.endGame(ws.gameId, winnerId, whiteDelta, blackDelta);
                 }
            }).catch(err => console.error("Erreur enregistrement partie: ", err));
        } catch(e) {
            console.error("Format ID de partie invalide pour sauvegarde:", e);
        }
    }

    // Persister l'état du plateau et le tour actuel de la partie en BDD pour les spectateurs qui rejoignent
    if (this.dbManager && !engine.gameOver) {
      try {
        this.dbManager.db.collection('games').updateOne(
          { _id: new ObjectId(ws.gameId) },
          { $set: { currentBoardState: engine.damier, currentPlayer: engine.currentPlayer } }
        ).catch(err => console.error('Erreur sauvegarde état partie :', err));
      } catch (e) {
        console.error('Erreur sauvegarde état partie :', e);
      }
    }

    this.broadcastToGame(ws.gameId, {
      type: 'gameUpdated',
      board: engine.damier,
      currentPlayer: engine.currentPlayer,
      gameEnded: engine.gameOver,
      winner: engine.winner
    }); // N'exclut plus le sender, pour que son écran se mette à jour !
  }

  handleGetValidMoves(ws, message) {
    if (!ws.userId || !ws.gameId) {
      this.sendError(ws, 'Non authentifié ou pas dans une partie');
      return;
    }

    const CheckersEngine = require('./CheckersEngine');
    const engine = new CheckersEngine();
    
    // On peuple temporairement le moteur de la requete du client pour ce test
    if (message.boardState) {
        engine.damier = message.boardState;
    }
    
    const piece = engine.damier[message.row][message.col];
    if (piece) {
       engine.currentPlayer = piece.player; // Crucial pour getAllCapturesForPlayer
    }
    
    const moves = engine.getAvailableMoves(message.row, message.col);
    
    this.send(ws, {
      type: 'validMoves',
      messageId: message.messageId,
      moves: moves
    });
  }

  handleChatMessage(ws, message) {
    if (!ws.userId || !ws.gameId) {
      this.sendError(ws, 'Non authentifié ou pas dans une partie');
      return;
    }

    if (!message.text) {
      this.sendError(ws, 'Texte du message manquant');
      return;
    }

    this.broadcastToGame(ws.gameId, {
      type: 'chatMessage',
      userId: ws.userId,
      username: message.username,
      text: message.text,
      roleClass: message.roleClass,
      playerColor: message.playerColor,
      timestamp: new Date()
    });
  }

  async handleSpectate(ws, message) {
    if (!ws.userId) {
      this.sendError(ws, 'Non authentifié');
      return;
    }

    if (!message.gameId) {
      this.sendError(ws, 'gameId manquant');
      return;
    }

    ws.gameId = message.gameId;
    ws.isSpectator = true;

    if (!this.activeGames.has(message.gameId)) {
      this.activeGames.set(message.gameId, new Set());
    }

    this.activeGames.get(message.gameId).add(ws.id);

    // Récupérer l'état actuel du plateau depuis la BDD
    let board = null;
    let currentPlayer = null;
    if (this.dbManager) {
      try {
        const game = await this.dbManager.db.collection('games').findOne({ _id: new ObjectId(message.gameId) });
        if (game) {
          board = game.currentBoardState || null;
          currentPlayer = game.currentPlayer || 'white';
        }
      } catch (e) {
        console.error('Erreur récupération état partie pour spectateur :', e);
      }
    }

    this.send(ws, {
      type: 'spectating',
      success: true,
      gameId: message.gameId,
      board: board,
      currentPlayer: currentPlayer
    });

    this.broadcastToGame(message.gameId, {
      type: 'spectatorJoined',
      userId: ws.userId,
      timestamp: new Date()
    }, ws.id);
  }

  async handleAbandonGame(ws, message) {
    if (!ws.userId || !ws.gameId) {
      this.sendError(ws, 'Non authentifié ou pas dans une partie');
      return;
    }

    let winnerColor = null;
    if (this.dbManager) {
      try {
        const game = await this.dbManager.db.collection('games').findOne({ _id: new ObjectId(ws.gameId) });
        if (game && game.status !== 'finished') {
          if (game.status === 'waiting') {
            // Partie sans adversaire : suppression simple rien de plus
            await this.dbManager.deleteGame(ws.gameId);
          } else {
            // Partie à deux joueurs : abandon avec mise à jour des stats
            await this.dbManager.abandonGame(ws.gameId, ws.userId);
            const isWhite = game.whitePlayerId.toString() === ws.userId;
            if (isWhite) {
              winnerColor = 'black';
            } else {
              winnerColor = 'white';
            }
          }
        }
      } catch (e) {
        console.error('Erreur abandon partie :', e);
      }
    }

    this.broadcastToGame(ws.gameId, {
      type: 'playerAbandoned',
      userId: ws.userId,
      gameId: ws.gameId,
      winnerColor: winnerColor,
      timestamp: new Date()
    });

    this.handleLeaveGame(ws, message);
  }

  async handleDisconnect(ws) {
    if (ws.gameId && this.activeGames.has(ws.gameId)) {
      let winnerColor = null;
      if (this.dbManager && !ws.isSpectator) {
        try {
          const game = await this.dbManager.db.collection('games').findOne({ _id: new ObjectId(ws.gameId) });
          if (game && game.status !== 'finished') {
            if (game.status === 'waiting') {
              // Partie sans adversaire : suppression simple, pas de défaite
              await this.dbManager.deleteGame(ws.gameId);
            } else {
              // compte comme un abandon
              await this.dbManager.abandonGame(ws.gameId, ws.userId);
              const isWhite = game.whitePlayerId.toString() === ws.userId;
              if (isWhite) {
                winnerColor = 'black';
              } else {
                winnerColor = 'white';
              }
            }
          }
        } catch (e) {
          console.error(error);
        }
      }

      this.broadcastToGame(ws.gameId, {
        type: 'playerDisconnected',
        userId: ws.userId,
        gameId: ws.gameId,
        winnerColor: winnerColor,
        timestamp: new Date()
      });

      this.activeGames.get(ws.gameId).delete(ws.id);

      if (this.activeGames.get(ws.gameId).size === 0) {
        this.activeGames.delete(ws.gameId);
      }
    }

    // Retirer de userConnections
    if (ws.userId && this.userConnections.has(ws.userId)) {
      this.userConnections.get(ws.userId).delete(ws.id);
      if (this.userConnections.get(ws.userId).size === 0) {
        this.userConnections.delete(ws.userId);
        this.notifierAmisHorsLigne(ws.userId);
      }
    }

    this.connections.delete(ws.id);
  }

  handleError(ws, error) {
    this.sendError(ws, 'Erreur de connexion WebSocket');
  }

  validateMoveMessage(message) {
    return (
      message.from &&
      typeof message.from.row === 'number' &&
      typeof message.from.col === 'number' &&
      message.to &&
      typeof message.to.row === 'number' &&
      typeof message.to.col === 'number' &&
      message.boardState &&
      Array.isArray(message.boardState)
    );
  }

  broadcastToGame(gameId, message, excludeConnectionId = null) {
    if (!this.activeGames.has(gameId)) return;

    const connections = this.activeGames.get(gameId);
    connections.forEach((connectionId) => {
      if (excludeConnectionId && connectionId === excludeConnectionId) return;

      const ws = this.getConnectionById(connectionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.send(ws, message);
      }
    });
  }

  broadcastToAll(message) {
    this.connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        this.send(ws, message);
      }
    });
  }

  send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Erreur lors de l\'envoi du message:', error);
      }
    }
  }

  sendError(ws, errorMessage) {
    console.error('WS Error:', errorMessage);
    this.send(ws, {
      type: 'error',
      message: errorMessage,
      timestamp: new Date()
    });
  }

  getConnectionById(connectionId) {
    return this.connections.get(connectionId);
  }

  getConnectionsByGameId(gameId) {
    if (!this.activeGames.has(gameId)) return [];
    const connectionIds = Array.from(this.activeGames.get(gameId));
    return connectionIds
      .map(id => this.connections.get(id))
      .filter(ws => ws && ws.readyState === WebSocket.OPEN);
  }

  getGameConnections(gameId) {
    return this.activeGames.get(gameId)?.size || 0;
  }

  startHeartbeat() {
    setInterval(() => {
      this.connections.forEach((ws) => {
        if (!ws.isAlive) {
          ws.terminate();
          this.connections.delete(ws.id);
          return;
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  estEnLigne(userId) {
    return this.userConnections.has(userId) && this.userConnections.get(userId).size;
  }

  getUtilisateursEnLigne(userIds) {
    var enLigne = new Set();
    userIds.forEach((id) => {
      if (this.estEnLigne(id)) {
        enLigne.add(id);
      }
    });
    return enLigne;
  }

  envoyerNotificationAmi(userId, message) {
    if (!this.userConnections.has(userId)) 
      return;

    this.userConnections.get(userId).forEach((wsId) => {
      var ws = this.connections.get(wsId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.send(ws, message);
      }
    });
  }

  async notifierAmisEnLigne(userId, username) {
    if (!this.dbManager) return;
    try {
      var result = await this.dbManager.getListeAmis(userId);
      if (!result.success) return;

      result.amis.forEach((ami) => {
        this.envoyerNotificationAmi(ami._id.toString(), {
          type: 'amiEnLigne',
          userId: userId,
          username: username,
          timestamp: new Date()
        });
      });
    } catch (error) {
      console.error('Erreur notification amis en ligne:', error);
    }
  }

  async notifierAmisHorsLigne(userId) {
    if (!this.dbManager) return;
    try {
      var result = await this.dbManager.getListeAmis(userId);
      if (!result.success) return;

      result.amis.forEach((ami) => {
        this.envoyerNotificationAmi(ami._id.toString(), {
          type: 'amiHorsLigne',
          userId: userId,
          timestamp: new Date()
        });
      });
    } catch (error) {
      console.error('Erreur notification amis hors ligne:', error);
    }
  }

  close() {
    this.wss.close();
  }

  getStats() {
    return {
      totalConnections: this.connections.size,
      activeGames: this.activeGames.size,
      games: Array.from(this.activeGames.entries()).map(([gameId, connections]) => ({
        gameId,
        players: connections.size
      }))
    };
  }
}

module.exports = WebSocketManager;
