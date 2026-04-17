class GameClient {
  constructor(apiUrl, wsUrl) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    
    this.apiUrl = apiUrl || `${protocol}//${host}`;
    this.wsUrl = wsUrl || `${wsProtocol}//${host}`;
    
    this.ws = null;
    this.userId = localStorage.getItem('userId');
    this.username = localStorage.getItem('username');
    this.gameId = null;
    this.isConnected = false;
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => cb(data));
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          this.isConnected = true;
          this.emit('connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            console.log('WS RCVD:', event.data);
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (e) {
            console.error('Failed to parse message:', e);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this.emit('disconnected');
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  handleMessage(message) {
    const { type, ...data } = message;

    switch (type) {
      case 'authenticated':
        this.emit('authenticated', data);
        break;
      case 'validMoves':
        this.emit('validMoves', data);
        break;
      case 'chatMessage':
        this.emit('chatMessage', data);
        break;
      case 'gameJoined':
        this.gameId = data.gameId;
        this.emit('gameJoined', data);
        break;
      case 'spectating':
        this.gameId = data.gameId;
        this.emit('spectating', data);
        break;
      case 'movePiece':
        this.emit('movePiece', data);
        break;
      case 'playerJoined':
        this.emit('playerJoined', data);
        break;
      case 'spectatorJoined':
        this.emit('spectatorJoined', data);
        break;
      case 'gameUpdated':
        console.log('Emitting gameUpdated', data);
        this.emit('gameUpdated', data);
        break;
      case 'gameEnded':
        this.emit('gameEnded', data);
        break;
      case 'playerAbandoned':
        this.emit('playerAbandoned', data);
        break;
      case 'playerDisconnected':
        this.emit('playerDisconnected', data);
        break;
      case 'error':
        this.emit('error', data);
        break;
      default:
        this.emit('message', message);
    }
  }

  send(message) {
    if (!this.isConnected || !this.ws) {
      console.error('WebSocket not connected');
      return false;
    }
    this.ws.send(JSON.stringify(message));
    return true;
  }

  authenticate(userId) {
    this.userId = userId;
    this.send({
      type: 'authenticate',
      userId: userId
    });
  }

  register(username, email, password) {
    return fetch(`${this.apiUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    }).then(res => res.json());
  }

  login(username, password) {
    return fetch(`${this.apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    }).then(res => res.json());
  }

  logout() {
    return fetch(`${this.apiUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).then(res => res.json());
  }

  getUsers() {
    return fetch(`${this.apiUrl}/api/users`)
      .then(res => res.json());
  }

  getUser(userId) {
    return fetch(`${this.apiUrl}/api/users/${userId}`)
      .then(res => res.json());
  }

  getLeaderboard(limit = 10) {
    return fetch(`${this.apiUrl}/api/users/leaderboard?limit=${limit}`)
      .then(res => res.json());
  }

  getUserHistory(userId) {
    return fetch(`${this.apiUrl}/api/users/${userId}/history`)
      .then(res => res.json());
  }

  createGame(gameName) {
    return fetch(`${this.apiUrl}/api/games/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameName })
    }).then(res => res.json());
  }

  getActiveGames() {
    return fetch(`${this.apiUrl}/api/games/active`).then(res => res.json());
  }

  getGame(gameId) {
    return fetch(`${this.apiUrl}/api/games/${gameId}`)
      .then(res => res.json());
  }

  joinGame(gameId) {
    return fetch(`${this.apiUrl}/api/games/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId })
    }).then(res => res.json());
  }

  joinGameWS(gameId) {
    this.gameId = gameId;
    this.send({
      type: 'joinGame',
      gameId: gameId
    });
  }

  spectateGameWS(gameId) {
    this.gameId = gameId;
    this.send({
      type: 'spectate',
      gameId: gameId
    });
  }

  sendMove(gameId, move) {
    return fetch(`${this.apiUrl}/api/games/${gameId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(move)
    }).then(res => res.json());
  }

  sendMoveWS(gameId, from, to, boardState) {
    this.send({
      type: 'movePiece',
      gameId: gameId,
      from: from,
      to: to,
      boardState: boardState
    });
  }

  sendChatMessageWS(gameId, text, username, roleClass, playerColor) {
    this.send({
      type: 'chatMessage',
      gameId: gameId,
      text: text,
      username: username,
      roleClass: roleClass,
      playerColor: playerColor
    });
  }

  getValidMovesWS(gameId, row, col, boardState) {
    return new Promise((resolve) => {
      const messageId = Date.now() + Math.random().toString();
      const handler = (data) => {
        if (data.messageId === messageId) {
          this.off('validMoves', handler);
          resolve(data.moves);
        }
      };
      this.on('validMoves', handler);
      this.send({
        type: 'getValidMoves',
        gameId: gameId,
        row: row,
        col: col,
        boardState: boardState,
        messageId: messageId
      });
    });
  }

  endGame(gameId, winnerId, whiteStatsDelta = 0, blackStatsDelta = 0) {
    return fetch(`${this.apiUrl}/api/games/${gameId}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerId, whiteStatsDelta, blackStatsDelta })
    }).then(res => res.json());
  }

  abandonGame(gameId) {
    return fetch(`${this.apiUrl}/api/games/${gameId}/abandon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).then(res => res.json());
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}
