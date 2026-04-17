const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');

class DatabaseManager {
  constructor(url = 'mongodb://localhost:27017/webcheckers') {
    this.url = url;
    this.client = null;
    this.db = null;
  }

  async connect() {
    try {
      this.client = new MongoClient(this.url);
      await this.client.connect();
      this.db = this.client.db('webcheckers');
      await this.initializeCollections();
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.close();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async initializeCollections() {
    const collections = await this.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    if (!collectionNames.includes('users')) {
      await this.db.createCollection('users');
      await this.db.collection('users').createIndex({ username: 1 }, { unique: true });
      await this.db.collection('users').createIndex({ email: 1 }, { unique: true });
    }

    if (!collectionNames.includes('games')) {
      await this.db.createCollection('games');
      await this.db.collection('games').createIndex({ createdAt: 1 });
    }

    if (!collectionNames.includes('gameHistory')) {
      await this.db.createCollection('gameHistory');
    }

    if (!collectionNames.includes('friendRequests')) {
      await this.db.createCollection('friendRequests');
      await this.db.collection('friendRequests').createIndex(
        { fromUserId: 1, toUserId: 1 }, { unique: true }
      );
      await this.db.collection('friendRequests').createIndex({ toUserId: 1 });
    }
  }

  async createUser(username, email, password) {
    try {
      const user = {
        username,
        email,
        password: await bcrypt.hash(password, 10),
        stats: {
          wins: 0,
          losses: 0
        },
        createdAt: new Date(),
        lastLogin: null
      };

      const result = await this.db.collection('users').insertOne(user);
      return { success: true, userId: result.insertedId };
    } catch (error) {
      if (error.code === 11000) {
        return { success: false, error: 'Utilisateur ou email déjà existant' };
      }
      return { success: false, error: 'Erreur interne' };
    }
  }

  async getUserByUsername(username) {
    try {
      const user = await this.db.collection('users').findOne({ username });
      if (!user) {
        return { success: false, error: 'Utilisateur non trouvé' };
      }
      return { success: true, user };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async getUserById(userId) {
    try {
      const user = await this.db.collection('users').findOne({ _id: new ObjectId(userId) });
      if (!user) {
        return { success: false, error: 'Utilisateur non trouvé' };
      }
      return { success: true, user };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async updateUserLastLogin(userId) {
    try {
      await this.db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { $set: { lastLogin: new Date() } }
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async getAllUsers() {
    try {
      const users = await this.db.collection('users')
        .find({})
        .project({ password: 0 })
        .toArray();
      return { success: true, users };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async createGame(whitePlayerId, blackPlayerId, gameName) {
    try {
      var gameStatus;
      if (blackPlayerId) {
        gameStatus = 'in-progress';
      } else {
        gameStatus = 'waiting';
      }

      const game = {
        whitePlayerId: new ObjectId(whitePlayerId),
        blackPlayerId: blackPlayerId ? new ObjectId(blackPlayerId) : null,
        gameName,
        status: gameStatus,
        moves: [],
        currentBoardState: null,
        startedAt: new Date(),
        endedAt: null,
        winner: null,
        spectators: []
      };

      const result = await this.db.collection('games').insertOne(game);
      return { success: true, gameId: result.insertedId };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async getGameById(gameId) {
    try {
      const game = await this.db.collection('games').findOne({ _id: new ObjectId(gameId) });
      if (!game) {
        return { success: false, error: 'Partie non trouvée' };
      }
      return { success: true, game };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async getActiveGames() {
    try {
      const games = await this.db.collection('games')
        .find({ status: { $in: ['waiting', 'in-progress'] } })
        .toArray();
      return { success: true, games };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async getGamesByPlayer(playerId) {
    try {
      const objectId = new ObjectId(playerId);
      const games = await this.db.collection('games')
        .find({
          $or: [
            { whitePlayerId: objectId },
            { blackPlayerId: objectId }
          ]
        })
        .toArray();
      return { success: true, games };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async saveGameMove(gameId, fromRow, fromCol, toRow, toCol, boardState) {
    try {
      const move = {
        timestamp: new Date(),
        from: { row: fromRow, col: fromCol },
        to: { row: toRow, col: toCol },
        boardState
      };

      await this.db.collection('games').updateOne(
        { _id: new ObjectId(gameId) },
        {
          $push: { moves: move },
          $set: { currentBoardState: boardState }
        }
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async addSpectator(gameId, spectatorId) {
    try {
      await this.db.collection('games').updateOne(
        { _id: new ObjectId(gameId) },
        { $addToSet: { spectators: new ObjectId(spectatorId) } }
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async removeSpectator(gameId, spectatorId) {
    try {
      await this.db.collection('games').updateOne(
        { _id: new ObjectId(gameId) },
        { $pull: { spectators: new ObjectId(spectatorId) } }
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async joinGame(gameId, blackPlayerId) {
    try {
      const result = await this.db.collection('games').updateOne(
        { _id: new ObjectId(gameId), blackPlayerId: null },
        { $set: { blackPlayerId: new ObjectId(blackPlayerId), status: 'in-progress' } }
      );

      if (result.matchedCount === 0) {
        return { success: false, error: 'Partie non disponible' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async endGame(gameId, winnerId, whiteStatsDelta, blackStatsDelta) {
    try {
      const game = await this.db.collection('games').findOne({ _id: new ObjectId(gameId) });
      if (!game) {
        return { success: false, error: 'Partie non trouvée' };
      }

      // Si la partie est déjà finie
      if (game.status === 'finished') {
        return { success: true, message: 'Déjà terminée' };
      }

      await this.db.collection('games').updateOne(
        { _id: new ObjectId(gameId) },
        {
          $set: {
            status: 'finished',
            endedAt: new Date(),
            winner: winnerId ? new ObjectId(winnerId) : null
          }
        }
      );

      // Ne pas comptabiliser les stats pour les parties solos
      const isSolo = !game.blackPlayerId || game.whitePlayerId.equals(game.blackPlayerId);

      if (!isSolo) {
        if (whiteStatsDelta) {
          await this.db.collection('users').updateOne(
            { _id: game.whitePlayerId },
            { $inc: { 'stats.wins': whiteStatsDelta.wins || 0, 'stats.losses': whiteStatsDelta.losses || 0 } }
          );
        }

        if (game.blackPlayerId && blackStatsDelta) {
          await this.db.collection('users').updateOne(
            { _id: game.blackPlayerId },
            { $inc: { 'stats.wins': blackStatsDelta.wins || 0, 'stats.losses': blackStatsDelta.losses || 0 } }
          );
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async abandonGame(gameId, abandoningPlayerId) {
    try {
      const game = await this.db.collection('games').findOne({ _id: new ObjectId(gameId) });
      if (!game) {
        return { success: false, error: 'Partie non trouvée' };
      }

      // Si la partie est déjà finie
      if (game.status === 'finished') {
        return { success: true, message: 'Déjà terminée' };
      }

      const isWhite = game.whitePlayerId.toString() === abandoningPlayerId;
      const isBlack = game.blackPlayerId && game.blackPlayerId.toString() === abandoningPlayerId;

      // Si c'est un spectateur, on ignore
      if (!isWhite && !isBlack) {
         return { success: true, message: 'Spectateur' };
      }

      const winnerId = isWhite ? game.blackPlayerId : game.whitePlayerId;

      const whiteStatsDelta = isWhite ? { wins: 0, losses: 1 } : { wins: 1, losses: 0 };
      const blackStatsDelta = isBlack ? { wins: 0, losses: 1 } : { wins: 1, losses: 0 };

      return await this.endGame(gameId, winnerId, whiteStatsDelta, blackStatsDelta);
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async deleteGame(gameId) {
    try {
      await this.db.collection('games').deleteOne({ _id: new ObjectId(gameId) });
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async saveGameHistory(gameId, gameName, whitePlayerId, blackPlayerId, moves, winner) {
    try {
      const history = {
        gameId: new ObjectId(gameId),
        gameName,
        whitePlayerId: new ObjectId(whitePlayerId),
        blackPlayerId: blackPlayerId ? new ObjectId(blackPlayerId) : null,
        moves,
        winner: new ObjectId(winner),
        playedAt: new Date()
      };

      await this.db.collection('gameHistory').insertOne(history);
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async getGameHistory(playerId) {
    try {
      const objectId = new ObjectId(playerId);
      const history = await this.db.collection('gameHistory')
        .find({
          $or: [
            { whitePlayerId: objectId },
            { blackPlayerId: objectId }
          ]
        })
        .sort({ playedAt: -1 })
        .toArray();
      return { success: true, history };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async getLeaderboard(limit = 10) {
    try {
      const leaderboard = await this.db.collection('users')
        .find({})
        .project({ password: 0 })
        .sort({ 'stats.wins': -1 })
        .limit(limit)
        .toArray();
      return { success: true, leaderboard };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async rechercherUtilisateurs(query, currentUserId) {
    try {
      const regex = new RegExp(query, 'i');
      const users = await this.db.collection('users')
        .find({
          username: { $regex: regex },
          _id: { $ne: new ObjectId(currentUserId) }
        })
        .project({ _id: 1, username: 1 })
        .limit(10)
        .toArray();
      return { success: true, users };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async envoyerDemandeAmi(fromUserId, fromUsername, toUserId, toUsername) {
    try {
      // Vérifier si déjà amis
      const user = await this.db.collection('users').findOne({ _id: new ObjectId(fromUserId) });
      if (user && user.friends) {
        let dejaAmis = false;
        for (let i =0; i < user.friends.length; i++) {
          if (user.friends[i].toString() === toUserId) {
            dejaAmis = true;
            break;
          }
        }
        if (dejaAmis) {
          return { success: false, error: 'Déjà amis' };
        }
      }

      const demande = {
        fromUserId: new ObjectId(fromUserId),
        fromUsername,
        toUserId: new ObjectId(toUserId),
        toUsername,
        status: 'en attente',
        createdAt: new Date()
      };

      await this.db.collection('friendRequests').insertOne(demande);
      return { success: true };
    } catch (error) {
      if (error.code === 11000) {
        return { success: false, error: 'Demande déjà envoyée' };
      }
      return { success: false, error: 'Erreur interne' };
    }
  }

  async getDemandesRecues(userId) {
    try {
      const demandes = await this.db.collection('friendRequests')
        .find({ toUserId: new ObjectId(userId), status: 'en attente' })
        .toArray();
      return { success: true, demandes };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async accepterDemandeAmi(requestId, userId) {
    try {
      const demande = await this.db.collection('friendRequests').findOne({
        _id: new ObjectId(requestId)
      });

      if (!demande) {
        return { success: false, error: 'Demande non trouvée' };
      }

      if (demande.toUserId.toString() !== userId) {
        return { success: false, error: 'Non autorisé' };
      }

      // Ajouter chacun dans la liste d'amis de l'autre
      await this.db.collection('users').updateOne(
        { _id: demande.fromUserId },
        { $addToSet: { friends: demande.toUserId } }
      );
      await this.db.collection('users').updateOne(
        { _id: demande.toUserId },
        { $addToSet: { friends: demande.fromUserId } }
      );

      // Supprimer la demande
      await this.db.collection('friendRequests').deleteOne({ _id: new ObjectId(requestId) });

      return {
        success: true,
        ami: {
          userId: demande.fromUserId.toString(),
          username: demande.fromUsername
        }
      };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async refuserDemandeAmi(requestId, userId) {
    try {
      const demande = await this.db.collection('friendRequests').findOne({
        _id: new ObjectId(requestId)
      });

      if (!demande) {
        return { success: false, error: 'Demande non trouvée' };
      }

      if (demande.toUserId.toString() !== userId) {
        return { success: false, error: 'Non autorisé' };
      }

      await this.db.collection('friendRequests').deleteOne({ _id: new ObjectId(requestId) });
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async getListeAmis(userId) {
    try {
      const user = await this.db.collection('users').findOne({ _id: new ObjectId(userId) });
      if (!user || !user.friends || user.friends.length === 0) {
        return { success: true, amis: [] };
      }

      const amis = await this.db.collection('users')
        .find({ _id: { $in: user.friends } })
        .project({ _id: 1, username: 1 })
        .toArray();
      return { success: true, amis };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async deleteUser(userId) {
    try {
      await this.db.collection('users').deleteOne({ _id: new ObjectId(userId) });
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }

  async clearDatabase() {
    try {
      await this.db.collection('users').deleteMany({});
      await this.db.collection('games').deleteMany({});
      await this.db.collection('gameHistory').deleteMany({});
      await this.db.collection('friendRequests').deleteMany({});
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erreur interne' };
    }
  }
}

module.exports = DatabaseManager;
