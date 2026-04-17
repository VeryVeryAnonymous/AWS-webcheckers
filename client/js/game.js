var currentUsername = document.body.getAttribute('data-username') || 'Utilisateur';
var isSpectatorUser = document.body.getAttribute('data-is-spectator') === 'true';
var roleClass = isSpectatorUser ? 'spectateur' : 'joueur';

var gameId = new URLSearchParams(window.location.search).get('gameId');
var soloMode = new URLSearchParams(window.location.search).get('solo') === 'true';
var gameClient = new GameClient();
var gameBoard = null;
var selectedPiece = null;
var currentPlayerTurn = 'white';
var playerColor = null;
var userId = document.body.getAttribute('data-userid');
var gameStatus = null;
var flipBoard = false;

function openChatMenu() {
    var panel = document.getElementById('chat-menu');
    var button = document.getElementById('chat-toggle');
    panel.classList.add('open');
    button.hidden = true;
    document.getElementById('chat-input').focus();
}

function closeChatMenu() {
    var panel = document.getElementById('chat-menu');
    var button = document.getElementById('chat-toggle');
    panel.classList.remove('open');
    button.hidden = false;
}

function initializeChatUI() {
    var panel = document.getElementById('chat-menu');
    var button = document.getElementById('chat-toggle');
    panel.classList.remove('open');
    button.hidden = false;
}

function isNearBottom(container) {
    var distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distance < 40;
}

function addMessage(text, username = currentUsername, role = roleClass, color = null) {
    var messages = document.getElementById('chat-messages');
    var position = isNearBottom(messages);

    var line = document.createElement('div');
    line.className = 'message-chat';

    var usernameTag = document.createElement('span');
    usernameTag.className = 'pseudo-chat ' + role;
    if (role !== 'spectateur' && color) {
        if (color === 'white') {
            usernameTag.textContent = username + ' (blanc)';
        } else {
            usernameTag.textContent = username + ' (noir)';
        }
    } else {
        usernameTag.textContent = username;
    }

    var messageBubble = document.createElement('span');
    messageBubble.className = 'bulle-chat';
    messageBubble.textContent = text;

    line.appendChild(usernameTag);
    line.appendChild(messageBubble);
    messages.appendChild(line);

    if (position) {
        messages.scrollTop = messages.scrollHeight;
    }
}

function initializeBoard() {
    var board = Array(10).fill(null).map(() => Array(10).fill(null));
    
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 10; col++) {
            if ((row + col) % 2 !== 0) {
                board[row][col] = { player: 'white', isQueen: false };
            }
        }
    }
    
    for (let row = 6; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            if ((row + col) % 2 !== 0) {
                board[row][col] = { player: 'black', isQueen: false };
            }
        }
    }
    
    return board;
}

function renderBoard() {
    var grid = document.querySelector('.grille-plateau');
    grid.innerHTML = '';
    
    for (let i = 0; i < 100; i++) {
        let index;
        if (flipBoard) {
            index = 99 - i;
        } else {
            index = i;
        }
        let row = Math.floor(index / 10);
        let col = index % 10;
        
        var cell = document.createElement('div');
        cell.className = ((row + col) % 2 === 0) ? 'case-claire' : 'case-foncee';
        
        if (gameBoard[row][col]) {
            var piece = gameBoard[row][col];
            var pieceCls = 'pion ' + piece.player;
            if (piece.isQueen) {
                pieceCls += ' dame';
            }
            
            if (selectedPiece && selectedPiece.row === row && selectedPiece.col === col) {
                pieceCls += ' selected';
            }
            
            var pieceElement = document.createElement('div');
            pieceElement.className = pieceCls;
            
            cell.appendChild(pieceElement);
        }
        
        (function(r, c) {
            cell.addEventListener('click', function() {
                if (!isSpectatorUser) {
                    selectPieceOrMove(r, c);
                }
            });
        })(row, col);
        
        grid.appendChild(cell);
    }
    
    clearAvailableMoves();
}

function getCellIndex(row, col) {
    if (flipBoard) {
        return (9 - row) * 10 + (9 - col);
    }
    return row * 10 + col;
}

function getSimpleMoves(row, col, piece) {
    var moves = [];
    var directions = [];
    
    if (piece.player === 'white') {
        directions.push({ dRow: 1, dCol: -1 }, { dRow: 1, dCol: 1 });
    }
    if (piece.player === 'black') {
        directions.push({ dRow: -1, dCol: -1 }, { dRow: -1, dCol: 1 });
    }
    if (piece.isQueen) {
        if (piece.player === 'white') {
            directions.push({ dRow: -1, dCol: -1 }, { dRow: -1, dCol: 1 });
        }
        if (piece.player === 'black') {
            directions.push({ dRow: 1, dCol: -1 }, { dRow: 1, dCol: 1 });
        }
    }
    
    for (var i = 0; i < directions.length; i++) {
        var dir = directions[i];
        var newRow = row + dir.dRow;
        var newCol = col + dir.dCol;
        
        if (newRow >= 0 && newRow < 10 && newCol >= 0 && newCol < 10) {
            if (!gameBoard[newRow][newCol]) {
                moves.push({ row: newRow, col: newCol, type: 'simple' });
            }
        }
    }
    
    return moves;
}

function getCaptureMoves(row, col, piece) {
    var moves = [];
    var directions = [
        { dRow: -1, dCol: -1 },
        { dRow: -1, dCol: 1 },
        { dRow: 1, dCol: -1 },
        { dRow: 1, dCol: 1 }
    ];
    
    for (var i = 0; i < directions.length; i++) {
        var dir = directions[i];
        
        if (!piece.isQueen) {
            if (piece.player === 'white' && dir.dRow < 0) continue;
            if (piece.player === 'black' && dir.dRow > 0) continue;
        }

        var jumpRow = row + dir.dRow;
        var jumpCol = col + dir.dCol;
        
        if (jumpRow >= 0 && jumpRow < 10 && jumpCol >= 0 && jumpCol < 10) {
            var target = gameBoard[jumpRow][jumpCol];
            
            if (target && target.player !== piece.player) {
                var landRow = jumpRow + dir.dRow;
                var landCol = jumpCol + dir.dCol;
                
                if (landRow >= 0 && landRow < 10 && landCol >= 0 && landCol < 10) {
                    if (!gameBoard[landRow][landCol]) {
                        moves.push({ 
                            row: landRow, 
                            col: landCol, 
                            type: 'capture',
                            captureRow: jumpRow,
                            captureCol: jumpCol
                        });
                    }
                }
            }
        }
    }
    
    return moves;
}

function getAvailableMoves(row, col) {
    if (!gameBoard[row][col]) {
        return [];
    }
    
    var piece = gameBoard[row][col];
    var moves = [];
    
    moves = moves.concat(getSimpleMoves(row, col, piece));
    moves = moves.concat(getCaptureMoves(row, col, piece));
    
    return moves;
}

function showAvailableMoves(moves) {
    clearAvailableMoves();
    var grid = document.querySelector('.grille-plateau');
    
    for (var i = 0; i < moves.length; i++) {
        var move = moves[i];
        var index = getCellIndex(move.row, move.col);
        var cell = grid.children[index];
        
        cell.classList.add('mouvement-disponible');
    }
}

function clearAvailableMoves() {
    var grid = document.querySelector('.grille-plateau');
    Array.from(grid.children).forEach(cell => {
        cell.classList.remove('mouvement-disponible');
    });
}

function selectPieceOrMove(row, col) {
    if (currentPlayerTurn !== playerColor && !soloMode) {
        return;
    }
    
    if (!selectedPiece) {
        var piece = gameBoard[row][col];
        if (piece && piece.player === (soloMode ? currentPlayerTurn : playerColor)) {
            selectedPiece = { row: row, col: col };
            renderBoard();
            
            gameClient.getValidMovesWS(gameId, row, col, gameBoard).then(function(moves) {
                var displayMoves = moves.map(m => ({
                    row: m.to.row,
                    col: m.to.col,
                    type: m.isCapture ? 'capture' : 'simple',
                    captureRow: m.capturedPiece ? m.capturedPiece.row : null,
                    captureCol: m.capturedPiece ? m.capturedPiece.col : null
                }));
                showAvailableMoves(displayMoves);
            }).catch(function(err) {
                console.error("Erreur moves", err);
            });
        }
        return;
    }
    
    // Si on reclique sur la même pièce, on la désélectionne
    if (selectedPiece.row === row && selectedPiece.col === col) {
        selectedPiece = null;
        renderBoard();
        clearAvailableMoves();
        return;
    }
    
    // L'envoi direct du coup - c'est le serveur qui gèrera sa validité
    gameClient.sendMoveWS(gameId, 
        { row: selectedPiece.row, col: selectedPiece.col },
        { row: row, col: col },
        gameBoard
    );
    
    selectedPiece = null;
    clearAvailableMoves();
}

function handleGameUpdated(data) {
    if (data.board) {
        gameBoard = data.board;
        renderBoard();
    }
    if (data.currentPlayer) {
        currentPlayerTurn = data.currentPlayer;
        updateGameStatus();
    }
    if (data.gameEnded) {
        handleGameEnded(data);
    }
}

function handleGameEnded(data) {
    setTimeout(function() {
        if (isSpectatorUser) {
            location.href = '/menu';
            return;
        }
        if (data.winner === playerColor) {
            location.href = '/gameResult?result=win';
        } else {
            location.href = '/gameResult?result=lose';
        }
    }, 1000);
}

function handlePlayerLeft(data) {
    if (isSpectatorUser) {
        setTimeout(function() { location.href = '/menu'; }, 1500);
        return;
    }
    // Si c'est l'adversaire du joueur qui est parti, le joueur gagne
    if (data.userId !== userId) {
        setTimeout(function() { location.href = '/gameResult?result=win'; }, 1500);
    }
    // Si c'est le joueur (userId) qui est parti, c'est traité dans quitterPartie() 
}

function quitterPartie() {
    if (isSpectatorUser || soloMode) {
        location.href = '/menu';
        return;
    }
    if (gameClient && gameId) {
        gameClient.send({ type: 'abandonGame', gameId: gameId });
    }
    // Partie en attente (1 seul joueur) : pas de défaite, on revient au menu
    if (gameStatus === 'waiting') {
        location.href = '/menu';
    } else {
        location.href = '/gameResult?result=lose';
    }
}

function updateGameStatus() {
    var whitePieces = 0, blackPieces = 0;
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
            if (gameBoard[r][c]) {
                if (gameBoard[r][c].player === 'white') whitePieces++;
                else blackPieces++;
            }
        }
    }
    
    console.log('Current turn: ' + currentPlayerTurn + ' | White: ' + whitePieces + ' | Black: ' + blackPieces);
}

document.getElementById('chat-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var input = document.getElementById('chat-input');
    var value = input.value.trim();

    if (!value) {
        return;
    }

    if (gameClient && gameId) {
        gameClient.sendChatMessageWS(gameId, value, currentUsername, roleClass, playerColor);
    } else {
        // En cas de jeu déconnecté ou erreur, l'afficher uniquement localement
        addMessage(value, currentUsername, roleClass, playerColor);
    }
    input.value = '';
    input.focus();
});

function initializeGame() {
    initializeChatUI();
    gameBoard = initializeBoard();
    renderBoard();

    if (isSpectatorUser && gameClient) {
        gameClient.connect().then(function() {
            gameClient.authenticate(userId);
            gameClient.spectateGameWS(gameId);

            gameClient.on('spectating', function(data) {
                if (data.board) {
                    gameBoard = data.board;
                    renderBoard();
                }
                if (data.currentPlayer) {
                    currentPlayerTurn = data.currentPlayer;
                }
                updateGameStatus();
            });

            gameClient.on('gameUpdated', handleGameUpdated);
            gameClient.on('playerAbandoned', handlePlayerLeft);
            gameClient.on('playerDisconnected', handlePlayerLeft);

            gameClient.on('chatMessage', function(data) {
                addMessage(data.text, data.username, data.roleClass, data.playerColor);
            });
        }).catch(function(err) {
            console.error('Connection failed (spectateur):', err);
        });
    } else if (!isSpectatorUser && gameClient) {
        gameClient.connect().then(function() {
            gameClient.authenticate(userId);
            gameClient.joinGameWS(gameId);

            gameClient.on('gameJoined', function(data) {
                if (soloMode) {
                    playerColor = null;
                    currentPlayerTurn = 'white';
                } else if (data.playerColor) {
                    playerColor = data.playerColor;
                    currentPlayerTurn = 'white';
                }
                if (playerColor === 'white') {
                    flipBoard = true;
                }
                if (data.gameStatus) {
                    gameStatus = data.gameStatus;
                }
                if (data.playersInfo) {
                    window.whitePlayerInfo = data.playersInfo.white;
                    window.blackPlayerInfo = data.playersInfo.black;
                }
                if (data.board) {
                    gameBoard = data.board;
                }
                renderBoard();
                updateNoms();
                startTimer();
                updateGameStatus();
            });

            gameClient.on('playerJoined', function(data) {
                gameStatus = 'in-progress';
                if (data.playersInfo) {
                    window.whitePlayerInfo = data.playersInfo.white || window.whitePlayerInfo;
                    window.blackPlayerInfo = data.playersInfo.black || window.blackPlayerInfo;
                }
                updateNoms();
                startTimer();
            });

            gameClient.on('gameUpdated', handleGameUpdated);
            gameClient.on('gameEnded', handleGameEnded);
            gameClient.on('playerAbandoned', handlePlayerLeft);
            gameClient.on('playerDisconnected', handlePlayerLeft);

            gameClient.on('chatMessage', function(data) {
                addMessage(data.text, data.username, data.roleClass, data.playerColor);
            });
        }).catch(function(err) {
            console.error('Connection failed:', err);
        });
    } else if (soloMode) {
        playerColor = null;
        currentPlayerTurn = 'white';
        updateGameStatus();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGame);
} else {
    initializeGame();
}

window.addEventListener('pageshow', initializeChatUI);

function tournerDamier() {
    flipBoard = !flipBoard;
    renderBoard();
    updateChronos();
    updateNoms();
}

var timerInterval = null;
var whiteTime = 0;
var blackTime = 0;
var gameStatus = "waiting";

function formatTime(val) {
    var m = Math.floor(val / 60);
    var s = val % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}

function updateChronos() {
    document.getElementById("chrono-haut").textContent = formatTime(flipBoard ? blackTime : whiteTime);
    document.getElementById("chrono-bas").textContent = formatTime(flipBoard ? whiteTime : blackTime);
}

function updateNoms() {
    var nomHaut = document.getElementById("nom-haut");
    var palmaresHaut = document.getElementById("palmares-haut");
    var nomBas = document.getElementById("nom-bas");
    var palmaresBas = document.getElementById("palmares-bas");

    if (flipBoard) {
        nomHaut.textContent = window.blackPlayerInfo ? window.blackPlayerInfo.name : "En attente...";
        palmaresHaut.textContent = window.blackPlayerInfo ? (window.blackPlayerInfo.wins + "V - " + window.blackPlayerInfo.losses + "D") : "";
        nomBas.textContent = window.whitePlayerInfo ? window.whitePlayerInfo.name : "En attente...";
        palmaresBas.textContent = window.whitePlayerInfo ? (window.whitePlayerInfo.wins + "V - " + window.whitePlayerInfo.losses + "D") : "";
    } else {
        nomHaut.textContent = window.whitePlayerInfo ? window.whitePlayerInfo.name : "En attente...";
        palmaresHaut.textContent = window.whitePlayerInfo ? (window.whitePlayerInfo.wins + "V - " + window.whitePlayerInfo.losses + "D") : "";
        nomBas.textContent = window.blackPlayerInfo ? window.blackPlayerInfo.name : "En attente...";
        palmaresBas.textContent = window.blackPlayerInfo ? (window.blackPlayerInfo.wins + "V - " + window.blackPlayerInfo.losses + "D") : "";
    }
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(function() {
        if (gameStatus === "in-progress") {
           if (currentPlayerTurn === "white") {
               whiteTime++;
           } else {
               blackTime++;
           }
           updateChronos();
        }
    }, 1000);
}

