class CheckersEngine {
  constructor() {
    this.damier = this.initializeBoard();
    this.currentPlayer = 'white';
    this.gameOver = false;
    this.winner = null;
    this.Pion_Cible = null;
    this.deadPieces = [];
    this.raflePiece = null;
  }

  initializeBoard() {
    const damier = Array(10).fill(null).map(() => Array(10).fill(null));
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 10; col++) {
        if ((row + col) % 2 !== 0) damier[row][col] = { player: 'white', isQueen: false };
      }
    }
    for (let row = 6; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        if ((row + col) % 2 !== 0) damier[row][col] = { player: 'black', isQueen: false };
      }
    }
    return damier;
  }

  getBoard() { return this.damier.map(row => [...row]); }
  getCurrentPlayer() { return this.currentPlayer; }

  getGameState() {
    return {
      board: this.getBoard(),
      currentPlayer: this.currentPlayer,
      gameOver: this.gameOver,
      winner: this.winner,
      selectedPiece: this.Pion_Cible,
      whitePiecesCount: this.countPieces('white'),
      blackPiecesCount: this.countPieces('black')
    };
  }

  countPieces(player) {
    let count = 0;
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        if (this.damier[row][col] && this.damier[row][col].player === player) count++;
      }
    }
    return count;
  }

  selectPiece(row, col) {
    if (this.gameOver) return { success: false, error: 'Game over' };
    const piece = this.damier[row][col];
    if (!piece) return { success: false, error: 'Case vide' };
    if (piece.player !== this.currentPlayer) return { success: false, error: 'Pion adverse' };
    
    if (this.raflePiece) {
        if (row !== this.raflePiece.row || col !== this.raflePiece.col) {
            return { success: false, error: 'Rafle en cours. Vous devez continuer avec ce pion.' };
        }
    }

    this.Pion_Cible = { row, col };
    return { success: true, piece };
  }

  deselectPiece() {
    this.Pion_Cible = null;
    return { success: true };
  }

  isDead(r, c, deadPieces) {
    return deadPieces.some(dp => dp.r === r && dp.c === c);
  }

  isValidPosition(row, col) {
    return row >= 0 && row < 10 && col >= 0 && col < 10;
  }

  getDirectCaptures(board, row, col, deadPieces = []) {
    const piece = board[row][col];
    const captures = [];

    if (piece.isQueen) {
        const directions = [
            { dRow: -1, dCol: -1 }, { dRow: -1, dCol: 1 },
            { dRow: 1, dCol: -1 }, { dRow: 1, dCol: 1 }
        ];
        for (const dir of directions) {
            let r = row + dir.dRow;
            let c = col + dir.dCol;
            let enemyFound = null;

            while (this.isValidPosition(r, c)) {
                if (board[r][c]) {
                    if (enemyFound) break;
                    if (board[r][c].player === piece.player) break;
                    if (this.isDead(r, c, deadPieces)) break;
                    enemyFound = { r, c };
                } else {
                    if (enemyFound) {
                         captures.push({
                             to: { r, c },
                             captured: { r: enemyFound.r, c: enemyFound.c }
                         });
                    }
                }
                r += dir.dRow;
                c += dir.dCol;
            }
        }
    } else {
        const directions = [
            { dRow: -1, dCol: -1 }, { dRow: -1, dCol: 1 },
            { dRow: 1, dCol: -1 }, { dRow: 1, dCol: 1 }
        ];
        for (const dir of directions) {
            const enemyR = row + dir.dRow;
            const enemyC = col + dir.dCol;
            const landR = row + 2*dir.dRow;
            const landC = col + 2*dir.dCol;

            if (this.isValidPosition(enemyR, enemyC) && this.isValidPosition(landR, landC)) {
                const enemyPiece = board[enemyR][enemyC];
                if (enemyPiece && enemyPiece.player !== piece.player && !this.isDead(enemyR, enemyC, deadPieces)) {
                    if (!board[landR][landC]) {
                        captures.push({
                            to: { r: landR, c: landC },
                            captured: { r: enemyR, c: enemyC }
                        });
                    }
                }
            }
        }
    }
    return captures;
  }

  getCapturePaths(board, row, col, deadPieces = []) {
    const piece = board[row][col];
    const directCaptures = this.getDirectCaptures(board, row, col, deadPieces);
    if (directCaptures.length === 0) return [];

    let allPaths = [];
    for (const cap of directCaptures) {
        const newBoard = board.map(r => [...r]);
        newBoard[cap.to.r][cap.to.c] = piece;
        newBoard[row][col] = null;
        const newDead = [...deadPieces, cap.captured];

        const subPaths = this.getCapturePaths(newBoard, cap.to.r, cap.to.c, newDead);
        if (subPaths.length === 0) {
            allPaths.push([cap]);
        } else {
            for (const sp of subPaths) {
                allPaths.push([cap, ...sp]);
            }
        }
    }
    return allPaths;
  }

  getSimpleMoves(row, col, piece) {
    const moves = [];
    if (piece.isQueen) {
        const directions = [
            { dRow: -1, dCol: -1 }, { dRow: -1, dCol: 1 },
            { dRow: 1, dCol: -1 }, { dRow: 1, dCol: 1 }
        ];
        for (const dir of directions) {
            let r = row + dir.dRow;
            let c = col + dir.dCol;
            while (this.isValidPosition(r, c) && !this.damier[r][c]) {
                moves.push({
                    to: { row: r, col: c },
                    isCapture: false,
                    capturedPiece: null
                });
                r += dir.dRow;
                c += dir.dCol;
            }
        }
    } else {
        const directions = piece.player === 'white' ? 
            [{ dRow: 1, dCol: -1 }, { dRow: 1, dCol: 1 }] : 
            [{ dRow: -1, dCol: -1 }, { dRow: -1, dCol: 1 }];
            
        for (const dir of directions) {
            const r = row + dir.dRow;
            const c = col + dir.dCol;
            if (this.isValidPosition(r, c) && !this.damier[r][c]) {
                moves.push({
                    to: { row: r, col: c },
                    isCapture: false,
                    capturedPiece: null
                });
            }
        }
    }
    return moves;
  }

  getAvailableMoves(row, col) {
    if (!this.damier[row][col]) return [];
    const piece = this.damier[row][col];
    
    if (this.raflePiece) {
        if (row !== this.raflePiece.row || col !== this.raflePiece.col) return [];
        const paths = this.getCapturePaths(this.damier, row, col, this.deadPieces);
        if (paths.length === 0) return [];
        const maxLength = Math.max(...paths.map(p => p.length));
        const validPaths = paths.filter(p => p.length === maxLength);
        
        const movesMap = new Map();
        validPaths.forEach(p => {
            const step = p[0];
            const key = `${step.to.r},${step.to.c}`;
            if (!movesMap.has(key)) {
                movesMap.set(key, {
                    to: { row: step.to.r, col: step.to.c },
                    isCapture: true,
                    capturedPiece: { row: step.captured.r, col: step.captured.c }
                });
            }
        });
        return Array.from(movesMap.values());
    }

    let allPaths = [];
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
            const p = this.damier[r][c];
            if (p && p.player === piece.player) {
                const paths = this.getCapturePaths(this.damier, r, c, []);
                paths.forEach(path => allPaths.push({ from: {row: r, col: c}, path }));
            }
        }
    }

    if (allPaths.length > 0) {
        const maxLength = Math.max(...allPaths.map(p => p.path.length));
        const bestPaths = allPaths.filter(p => p.path.length === maxLength);
        
        const piecePaths = bestPaths.filter(p => p.from.row === row && p.from.col === col);
        if (piecePaths.length > 0) {
            const movesMap = new Map();
            piecePaths.forEach(p => {
                const step = p.path[0];
                const key = `${step.to.r},${step.to.c}`;
                if (!movesMap.has(key)) {
                    movesMap.set(key, {
                        to: { row: step.to.r, col: step.to.c },
                        isCapture: true,
                        capturedPiece: { row: step.captured.r, col: step.captured.c }
                    });
                }
            });
            return Array.from(movesMap.values());
        } else {
             return [];
        }
    }

    return this.getSimpleMoves(row, col, piece);
  }

  movePiece(toRow, toCol) {
    if (this.gameOver) return { success: false, error: 'La partie est terminée.' };
    if (!this.Pion_Cible) return { success: false, error: 'Aucun pion sélectionné.' };

    const startRow = this.Pion_Cible.row;
    const startCol = this.Pion_Cible.col;
    const availableMoves = this.getAvailableMoves(startRow, startCol);
    const move = availableMoves.find(m => m.to.row === toRow && m.to.col === toCol);

    if (!move) return { success: false, error: 'Mouvement invalide.' };

    const piece = this.damier[startRow][startCol];
    this.damier[toRow][toCol] = piece;
    this.damier[startRow][startCol] = null;

    let isCapture = false;
    if (move.isCapture) {
      isCapture = true;
      this.deadPieces.push({ r: move.capturedPiece.row, c: move.capturedPiece.col });
      // Remove captured piece immediately from the active board state to avoid visual bug
      this.damier[move.capturedPiece.row][move.capturedPiece.col] = null;
    }

    let turnContinues = false;
    if (isCapture) {
        // Evaluate remaining paths with the updated board (piece removed)
        const paths = this.getCapturePaths(this.damier, toRow, toCol, this.deadPieces);
        if (paths.length > 0) {
            turnContinues = true;
            this.raflePiece = { row: toRow, col: toCol };
        }
    }

    if (!turnContinues) {
        // Pieces are already removed progressively now, but keep deadPieces clear
        this.deadPieces = [];
        this.checkPromotion(toRow, toCol, this.damier[toRow][toCol]);
        this.raflePiece = null;
        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        this.checkGameOver();
    }

    this.Pion_Cible = null;

    return {
      success: true,
      move,
      gameState: this.getGameState()
    };
  }

  checkPromotion(row, col, piece) {
    if (piece.player === 'white' && row === 9 && !piece.isQueen) piece.isQueen = true;
    if (piece.player === 'black' && row === 0 && !piece.isQueen) piece.isQueen = true;
  }

  checkGameOver() {
    const whiteCount = this.countPieces('white');
    const blackCount = this.countPieces('black');

    if (whiteCount === 0) { this.gameOver = true; this.winner = 'black'; return; }
    if (blackCount === 0) { this.gameOver = true; this.winner = 'white'; return; }

    if (!this.canPlayerMove(this.currentPlayer)) {
      this.gameOver = true;
      this.winner = this.currentPlayer === 'white' ? 'black' : 'white';
    }
  }

  canPlayerMove(player) {
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const piece = this.damier[row][col];
        if (piece && piece.player === player) {
          const moves = this.getAvailableMoves(row, col);
          if (moves.length > 0) return true;
        }
      }
    }
    return false;
  }

  reset() {
    this.damier = this.initializeBoard();
    this.currentPlayer = 'white';
    this.gameOver = false;
    this.winner = null;
    this.Pion_Cible = null;
    this.deadPieces = [];
    this.raflePiece = null;
  }

  toString() {
    let str = '';
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const piece = this.damier[row][col];
        if (!piece) {
          str += ' . ';
        } else {
          const symbol = piece.player === 'white' ? 'W' : 'B';
          const kingMark = piece.isQueen ? '*' : ' ';
          str += symbol + kingMark + ' ';
        }
      }
      str += '\n';
    }
    return str;
  }
}

module.exports = CheckersEngine;
