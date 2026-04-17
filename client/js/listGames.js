var gameClient = new GameClient();

function createGameCard(game, mode) {
    var article = document.createElement('article');
    article.className = 'carte-partie';

    var info = document.createElement('div');
    info.className = 'carte-partie-info';

    var title = document.createElement('p');
    title.textContent = game.gameName;

    var details = document.createElement('p');
    if (mode === 'waiting') {
        var creator = game.players.white || 'Créateur';
        details.textContent = 'Createur : ' + creator + ' | Places : 1/2';
    } else {
        var white = game.players.white || 'Blanc';
        var black = game.players.black || 'Noir';
        details.textContent = white + ' vs ' + black;
    }

    info.appendChild(title);
    info.appendChild(details);

    var form = document.createElement('form');
    form.action = '/game';
    form.method = 'post';

    var gameIdInput = document.createElement('input');
    gameIdInput.type = 'hidden';
    gameIdInput.name = 'gameId';
    gameIdInput.value = game._id || game.id;

    var gameNameInput = document.createElement('input');
    gameNameInput.type = 'hidden';
    gameNameInput.name = 'gameName';
    gameNameInput.value = game.gameName;

    var button = document.createElement('button');
    button.type = 'submit';
    button.className = 'bouton bouton-petit';

    if (mode === 'waiting') {
        button.className += ' bouton-vert';
        button.textContent = 'Rejoindre';
    } else {
        var spectatorInput = document.createElement('input');
        spectatorInput.type = 'hidden';
        spectatorInput.name = 'accessMode';
        spectatorInput.value = 'spectator';
        form.appendChild(spectatorInput);

        button.className += ' bouton-gris';
        button.textContent = 'Regarder';
    }

    form.appendChild(gameIdInput);
    form.appendChild(gameNameInput);
    form.appendChild(button);

    article.appendChild(info);
    article.appendChild(form);

    return article;
}

function loadGames() {
    gameClient.getActiveGames().then(function(response) {
        if (!response || !response.games) {
            console.error('No games data received');
            return;
        }

        var games = response.games;
        var waitingGames = [];
        var ongoingGames = [];

        games.forEach(function(game) {
            if (game.status === 'waiting') {
                waitingGames.push(game);
            } else if (game.status === 'in-progress') {
                ongoingGames.push(game);
            }
        });

        var waitingContainer = document.getElementById('liste-en-attente');
        var ongoingContainer = document.getElementById('liste-en-cours');

        waitingContainer.innerHTML = '';
        ongoingContainer.innerHTML = '';

        if (waitingGames.length === 0) {
            var emptyWaiting = document.createElement('p');
            emptyWaiting.style.color = 'var(--texte-secondaire)';
            emptyWaiting.textContent = 'Aucune partie en attente';
            waitingContainer.appendChild(emptyWaiting);
        } else {
            waitingGames.forEach(function(game) {
                waitingContainer.appendChild(createGameCard(game, 'waiting'));
            });
        }

        if (ongoingGames.length === 0) {
            var emptyOngoing = document.createElement('p');
            emptyOngoing.style.color = 'var(--texte-secondaire)';
            emptyOngoing.textContent = 'Aucune partie en cours';
            ongoingContainer.appendChild(emptyOngoing);
        } else {
            ongoingGames.forEach(function(game) {
                ongoingContainer.appendChild(createGameCard(game, 'ongoing'));
            });
        }
    }).catch(function(error) {
        console.error('Failed to load games:', error);
        var waitingContainer = document.getElementById('liste-en-attente');
        var ongoingContainer = document.getElementById('liste-en-cours');

        waitingContainer.innerHTML = '<p style="color: var(--texte-secondaire);">Erreur lors du chargement</p>';
        ongoingContainer.innerHTML = '<p style="color: var(--texte-secondaire);">Erreur lors du chargement</p>';
    });
}

document.addEventListener('DOMContentLoaded', function() {
    loadGames();
    setInterval(loadGames, 2000);
});
