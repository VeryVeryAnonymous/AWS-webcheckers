const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const nunjucks = require('nunjucks');
const WebSocketManager = require('./WebSocketManager');
const DatabaseManager = require('./DatabaseManager');
const bcrypt = require('bcrypt');

class GameServer {
  constructor(port = 3000, dbUrl = 'mongodb://localhost:27017/webcheckers') {
    this.app = express();
    this.server = http.createServer(this.app);
    this.port = port;
    this.dbUrl = dbUrl;
    this.dbManager = new DatabaseManager(dbUrl);
    this.wsManager = new WebSocketManager(this.server);
  }

  setupMiddleware() {
    // Setup view engine
    const viewsDir = path.join(__dirname, '..', 'client', 'views');
    const nb_jours_expiration_cookie = 7;
    nunjucks.configure(viewsDir, { autoescape: true, express: this.app });
    this.app.set('view engine', 'html');
    this.app.set('views', viewsDir);

    this.app.use(express.static(path.join(__dirname, '..', 'client')));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.json());
    this.app.use(session({
      secret: process.env.SESSION_SECRET || 'webcheckers-secret-key',
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: this.dbUrl }),
      cookie: { 
        maxAge: nb_jours_expiration_cookie * 24 * 60 * 60 * 1000
      }
    }));
  }

  setupRoutes() {
    // Page routes (render with Nunjucks)
    this.app.get('/', (req, res) => {
      if (req.session?.userId) return res.redirect('/menu');
      res.redirect('/login');
    });
    this.app.get('/login', (req, res) => {
      if (req.session?.userId) return res.redirect('/menu');
      res.render('login.html', { error: null });
    });
    this.app.get('/register', (req, res) => {
      if (req.session?.userId) return res.redirect('/menu');
      res.render('register.html', { error: null });
    });
    this.app.get('/menu', (req, res) => {
      if (!req.session?.userId) return res.redirect('/login');
      res.render('menu.html', { username: req.session?.username || '', userId: req.session?.userId || '' });
    });
    this.app.get('/logout', this.handleLogoutPage.bind(this));
    this.app.get('/game', (req, res) => {
      if (!req.session?.userId) return res.redirect('/login');
      const isSpectator = req.query.mode === 'spectator' ? true : false;
      const gameName = req.query.gameName || 'Partie de dames';
      const isSolo = req.query.solo === 'true';
      res.render('game.html', {
        userId: req.session?.userId || '',
        username: req.session?.username || '',
        gameName: gameName,
        isSpectator: isSpectator,
        soloMode: isSolo
      });
    });
    this.app.get('/createGame', (req, res) => {
      if (!req.session?.userId) return res.redirect('/login');
      res.render('createGame.html', { username: req.session?.username || '', userId: req.session?.userId || '' });
    });
    this.app.get('/listGames', (req, res) => {
      if (!req.session?.userId) return res.redirect('/login');
      res.render('listGames.html', { username: req.session?.username || '', userId: req.session?.userId || '' });
    });
    this.app.get('/gameResult', async (req, res) => {
      if (!req.session?.userId) return res.redirect('/login');

      const result = req.query.result;
      let isWinner;
      if (result === 'win') {
        isWinner = true;
      } else if (result === 'lose') {
        isWinner = false;
      } else {
        return res.redirect('/menu'); 
      }

      let resultClass = '';
      if (isWinner) {
        resultClass = 'victoire';
      } else {
        resultClass = 'defaite';
      }

      var wins = 0;
      var losses = 0;

      const userResult = await this.dbManager.getUserById(req.session.userId);
      if (userResult.success && userResult.user && userResult.user.stats) {
        wins = userResult.user.stats.wins || 0;
        losses = userResult.user.stats.losses || 0;
      }

      res.render('gameResult.html', {
        username: req.session?.username || '',
        userId: req.session?.userId || '',
        isWinner,
        resultClass,
        wins,
        losses
      });
    });

    // Form submission routes
    this.app.post('/menu', this.handleLoginForm.bind(this));
    this.app.post('/register', this.handleRegisterForm.bind(this));
    this.app.post('/game', this.handleGameForm.bind(this));

    // Auth routes (REST API)
    this.app.post('/api/auth/register', this.handleRegister.bind(this));
    this.app.post('/api/auth/login', this.handleLogin.bind(this));
    this.app.post('/api/auth/logout', this.handleLogout.bind(this));

    // User routes
    this.app.get('/api/users', this.handleGetUsers.bind(this));
    this.app.get('/api/users/leaderboard', this.handleGetLeaderboard.bind(this));
    this.app.get('/api/users/:userId', this.handleGetUser.bind(this));
    this.app.get('/api/users/:userId/history', this.handleGetUserHistory.bind(this));

    // Friends routes
    this.app.get('/api/friends/rechercher', this.handleRechercherJoueurs.bind(this));
    this.app.get('/api/friends/demandes', this.handleGetDemandes.bind(this));
    this.app.get('/api/friends/liste', this.handleGetAmis.bind(this));
    this.app.post('/api/friends/demande', this.handleEnvoyerDemande.bind(this));
    this.app.post('/api/friends/accepter', this.handleAccepterDemande.bind(this));
    this.app.post('/api/friends/refuser', this.handleRefuserDemande.bind(this));

    // Game routes
    this.app.post('/api/games/create', this.handleCreateGame.bind(this));
    this.app.post('/api/games/join', this.handleJoinGame.bind(this));
    this.app.post('/api/games/:gameId/move', this.handleGameMove.bind(this));
    this.app.post('/api/games/:gameId/end', this.handleEndGame.bind(this));
    this.app.post('/api/games/:gameId/abandon', this.handleAbandonGame.bind(this));
    this.app.get('/api/games/active', this.handleGetActiveGames.bind(this));
    this.app.get('/api/games/:gameId', this.handleGetGame.bind(this));

    // Stats route
    this.app.get('/api/ws-stats', (req, res) => {
      res.json(this.wsManager.getStats());
    });
  }

  // ===== AUTH HANDLERS =====
  async handleRegister(req, res) {
    try {
      const { username, email, password } = req.body;
      
      if (!username || !email || !password) {
        return res.status(400).json({ success: false, error: 'Champs manquants' });
      }

      if (username.length < 3) {
        return res.status(400).json({ success: false, error: 'Le pseudo doit faire au moins 3 caractères' });
      }

      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Le mot de passe doit faire au moins 6 caractères' });
      }

      const result = await this.dbManager.createUser(username, email, password);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json({ success: true, userId: result.userId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleLogin(req, res) {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Identifiants manquants' });
      }

      const result = await this.dbManager.getUserByUsername(username);

      if (!result.success) {
        return res.status(401).json({ success: false, error: 'Nom d\'utilisateur ou mot de passe incorrect' });
      }

      const validPassword = await bcrypt.compare(password, result.user.password);
      if (!validPassword) {
        return res.status(401).json({ success: false, error: 'Nom d\'utilisateur ou mot de passe incorrect' });
      }

      await this.dbManager.updateUserLastLogin(result.user._id);

      req.session.userId = result.user._id.toString();
      req.session.username = result.user.username;

      res.json({ 
        success: true, 
        userId: result.user._id.toString(),
        username: result.user.username 
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleLogout(req, res) {
    try {
      req.session.destroy((err) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ success: false, error: 'Erreur serveur' });
        }
        res.json({ success: true });
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  // ===== FORM HANDLERS (HTML form submissions) =====
  async handleLoginForm(req, res) {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.render('login.html', { error: 'Identifiants manquants' });
      }

      const result = await this.dbManager.getUserByUsername(username);
      
      if (!result.success) {
        return res.render('login.html', { error: 'Nom d\'utilisateur ou mot de passe incorrect' });
      }

      const validPassword = await bcrypt.compare(password, result.user.password);
      if (!validPassword) {
        return res.render('login.html', { error: 'Nom d\'utilisateur ou mot de passe incorrect' });
      }

      await this.dbManager.updateUserLastLogin(result.user._id);

      req.session.userId = result.user._id.toString();
      req.session.username = result.user.username;

      res.redirect('/menu');
    } catch (error) {
      res.render('login.html', { error: 'Erreur serveur' });
    }
  }

  async handleRegisterForm(req, res) {
    try {
      const { username, email, password, confirmPassword } = req.body;
      
      if (!username || !email || !password || !confirmPassword) {
        return res.render('register.html', { error: 'Tous les champs sont obligatoires' });
      }

      if (password !== confirmPassword) {
        return res.render('register.html', { error: 'Les mots de passe ne correspondent pas' });
      }

      if (username.length < 3) {
        return res.render('register.html', { error: 'Le pseudo doit faire au moins 3 caractères' });
      }

      if (password.length < 6) {
        return res.render('register.html', { error: 'Le mot de passe doit faire au moins 6 caractères' });
      }

      const result = await this.dbManager.createUser(username, email, password);
      
      if (!result.success) {
        return res.render('register.html', { error: result.error });
      }

      res.redirect('/login');
    } catch (error) {
      res.render('register.html', { error: 'Erreur serveur' });
    }
  }

  handleLogoutPage(req, res) {
    req.session.destroy((err) => {
      res.redirect('/login');
    });
  }

  async handleGameForm(req, res) {
    try {
      // Vérifie que l'utilisateur est connecté
      if (!req.session?.userId) {
        return res.redirect('/login');
      }

      const gameName = req.body.gameName;
      const accessMode = req.body.accessMode;
      const soloMode = req.body.soloMode;

      const isSpectator = accessMode === 'spectator';

      if (soloMode === 'true') {
        const result = await this.dbManager.createGame(
          req.session.userId,
          req.session.userId, // Same player 2
          'Partie Solo'
        );
        if (!result.success) return res.redirect('/menu');
        return res.redirect(`/game?gameId=${result.gameId}&solo=true`);
      }

      // Rejoindre une partie existante (formulaire depuis /listGames, bouton "Rejoindre")
      if (req.body.gameId && !accessMode) {
        const joinResult = await this.dbManager.joinGame(req.body.gameId, req.session.userId);
        if (!joinResult.success) {
          return res.redirect('/listGames');
        }
        return res.redirect(`/game?gameId=${req.body.gameId}&gameName=${encodeURIComponent(gameName || '')}`);
      }

      // Créer une nouvelle partie (formulaire depuis /createGame)
      if (req.body.gameName && !accessMode) {
        const result = await this.dbManager.createGame(
          req.session.userId,
          null,
          gameName || 'Partie sans nom'
        );

        if (!result.success) {
          return res.render('createGame.html', { error: result.error, username: req.session.username });
        }

        return res.redirect(`/game?gameId=${result.gameId}&gameName=${encodeURIComponent(gameName || '')}`);
      }

      // Lorsque l'on rejoint en tant que spectateur
      if (isSpectator) {
        return res.redirect(`/game?mode=spectator&gameId=${req.body.gameId || ''}&gameName=${encodeURIComponent(gameName || '')}`);
      }

      // Redirige vers la partie 
      return res.redirect(`/game?gameName=${encodeURIComponent(gameName || '')}`);
    } catch (error) {
      res.render('createGame.html', { error: 'Erreur serveur', username: req.session?.username || '' });
    }
  }

  // ===== USER HANDLERS =====
  async handleGetUsers(req, res) {
    try {
      const result = await this.dbManager.getAllUsers();
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json({ success: true, users: result.users });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleGetUser(req, res) {
    try {
      const result = await this.dbManager.getUserById(req.params.userId);
      if (!result.success) {
        return res.status(404).json(result);
      }
      res.json({ success: true, user: result.user });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleGetLeaderboard(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const result = await this.dbManager.getLeaderboard(limit);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json({ success: true, leaderboard: result.leaderboard });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleGetUserHistory(req, res) {
    try {
      const result = await this.dbManager.getGameHistory(req.params.userId);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json({ success: true, history: result.history });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  // Gestion des amis (le panel avec la recherche, les demandes,la liste d'amis)
  async handleRechercherJoueurs(req, res) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Non authentifié' });
      }

      const query = req.query.q || '';
      if (!query.trim()) {
        return res.json({ success: true, users: [] });
      }

      const result = await this.dbManager.rechercherUtilisateurs(query, req.session.userId);
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json({ success: true, users: result.users });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleGetDemandes(req, res) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Non authentifié' });
      }

      const result = await this.dbManager.getDemandesRecues(req.session.userId);
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json({ success: true, demandes: result.demandes });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleGetAmis(req, res) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Non authentifié' });
      }

      const result = await this.dbManager.getListeAmis(req.session.userId);
      if (!result.success) {
        return res.status(400).json(result);
      }

      const amis = [];
      for (let i= 0; i < result.amis.length; i++) {
        const ami = result.amis[i];
        const enLigne = this.wsManager.estEnLigne(ami._id.toString());
        amis.push({
          userId: ami._id.toString(),
          username: ami.username,
          enLigne
        });
      }

      res.json({ success: true, amis });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleEnvoyerDemande(req, res) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Non authentifié' });
      }

      const toUserId = req.body.toUserId;
      const toUsername = req.body.toUsername;
      if (!toUserId || !toUsername) {
        return res.status(400).json({ success: false, error: 'Données manquantes' });
      }

      const result = await this.dbManager.envoyerDemandeAmi(
        req.session.userId, req.session.username, toUserId, toUsername
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      // Notification en direct à l'utilisateur qui reçoit la demande
      this.wsManager.envoyerNotificationAmi(toUserId, {
        type: 'demandeAmiRecue',
        fromUserId: req.session.userId,
        fromUsername: req.session.username,
        timestamp: new Date()
      });

      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleAccepterDemande(req, res) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Non authentifié' });
      }

      const { requestId } = req.body;
      if (!requestId) {
        return res.status(400).json({ success: false, error: 'requestId manquant' });
      }

      const result = await this.dbManager.accepterDemandeAmi(requestId, req.session.userId);
      if (!result.success) {
        return res.status(400).json(result);
      }

      // Notification en direct concernant la demande d'ami à l'utilisateur qui a envoyé la demande (qui a été acceptée)
      this.wsManager.envoyerNotificationAmi(result.ami.userId, {
        type: 'demandeAmiAcceptee',
        userId: req.session.userId,
        username: req.session.username,
        timestamp: new Date()
      });

      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleRefuserDemande(req, res) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Non authentifié' });
      }

      const { requestId } = req.body;
      if (!requestId) {
        return res.status(400).json({ success: false, error: 'requestId manquant' });
      }

      const result = await this.dbManager.refuserDemandeAmi(requestId, req.session.userId);
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  // ===== GAME HANDLERS =====
  async handleCreateGame(req, res) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Non authentifié' });
      }

      const { gameName } = req.body;
      const result = await this.dbManager.createGame(
        req.session.userId,
        null,
        gameName || 'Partie sans nom'
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json({ success: true, gameId: result.gameId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleJoinGame(req, res) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Non authentifié' });
      }

      const { gameId } = req.body;
      const result = await this.dbManager.joinGame(gameId, req.session.userId);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleGetGame(req, res) {
    try {
      const result = await this.dbManager.getGameById(req.params.gameId);
      if (!result.success) {
        return res.status(404).json(result);
      }
      res.json({ success: true, game: result.game });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleGetActiveGames(req, res) {
    try {
      const result = await this.dbManager.getActiveGames();
      if (!result.success) {
        return res.status(400).json(result);
      }

      const games = result.games;

      for (var i = 0; i < games.length; i++) {
        var game = games[i];
        game.players = { 
          white: null, 
          black: null 
        };

        if (game.whitePlayerId) {
          const whiteResult = await this.dbManager.getUserById(game.whitePlayerId.toString());
          if (whiteResult.success) {
            game.players.white = whiteResult.user.username;
          }
        }

        if (game.blackPlayerId) {
          const blackResult = await this.dbManager.getUserById(game.blackPlayerId.toString());
          if (blackResult.success) {
            game.players.black = blackResult.user.username;
          }
        }
      }

      res.json({ success: true, games: games });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleGameMove(req, res) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Non authentifié' });
      }

      const { from, to, boardState } = req.body;
      const result = await this.dbManager.saveGameMove(
        req.params.gameId,
        from.row,
        from.col,
        to.row,
        to.col,
        boardState
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleEndGame(req, res) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Non authentifié' });
      }

      const { winnerId, whiteStatsDelta, blackStatsDelta } = req.body;
      const result = await this.dbManager.endGame(
        req.params.gameId,
        winnerId,
        whiteStatsDelta || 0,
        blackStatsDelta || 0
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  async handleAbandonGame(req, res) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Non authentifié' });
      }

      const result = await this.dbManager.abandonGame(
        req.params.gameId,
        req.session.userId
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  // ===== SERVER LIFECYCLE =====
  async start() {
    try {
      // Connect to MongoDB
      const dbConnect = await this.dbManager.connect();
      if (!dbConnect.success) {
        throw new Error(`MongoDB connection error: ${dbConnect.error}`);
      }
      console.log('✅ MongoDB connecté');

      // Setup Express
      this.setupMiddleware();
      this.setupRoutes();

      // Start WebSocket manager
      this.wsManager.initialize(this.dbManager);

      // Listen
      this.server.listen(this.port, () => {
        console.log(`✅ Serveur écoute sur http://localhost:${this.port}`);
      });
    } catch (error) {
      console.error('❌ Erreur démarrage:', error.message);
      throw error;
    }
  }

  async stop() {
    console.log('Arrêt du serveur...');
    if (this.wsManager) {
      this.wsManager.close();
    }
    if (this.dbManager) {
      await this.dbManager.disconnect();
    }
    this.server.close();
  }
}

module.exports = GameServer;
