var gameClient = new GameClient();

function openFriendsMenu() {
    var overlay = document.getElementById('friends-overlay');
    var panel = document.getElementById('friends-menu');
    overlay.style.display = 'block';
    panel.classList.add('open');
}

function closeFriendsMenu() {
    var overlay = document.getElementById('friends-overlay');
    var panel = document.getElementById('friends-menu');
    overlay.style.display = 'none';
    panel.classList.remove('open');
}

function createFriendLine(username, status, actions) {
    var line = document.createElement('div');
    line.className = 'amis-ligne';
    
    var joueur = document.createElement('div');
    joueur.className = 'amis-joueur';
    
    var statusSpan = document.createElement('span');
    statusSpan.className = 'amis-statut ' + (status === 'online' ? 'en-ligne' : 'hors-ligne');
    
    var pseudo = document.createElement('span');
    pseudo.className = 'amis-pseudo';
    pseudo.textContent = username;
    
    joueur.appendChild(statusSpan);
    joueur.appendChild(pseudo);
    
    line.appendChild(joueur);
    
    if (actions) {
        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'amis-ligne-actions';
        
        actions.forEach(function(action) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'bouton bouton-petit';
            btn.textContent = action.label;
            btn.className += ' bouton-' + action.type;
            
            if (action.onclick) {
                btn.onclick = action.onclick;
            }
            
            actionsDiv.appendChild(btn);
        });
        
        line.appendChild(actionsDiv);
    } else {
        var etat = document.createElement('span');
        etat.className = 'amis-etat-texte ' + (status === 'online' ? 'en-ligne' : 'hors-ligne');
        etat.textContent = status === 'online' ? 'En ligne' : 'Hors ligne';
        line.appendChild(etat);
    }
    
    return line;
}

function rechercherJoueur() {
    var input = document.getElementById('recherche-joueur');
    var query = input.value.trim();
    
    if (!query) {
        return;
    }
    
    gameClient.getUsers().then(function(response) {
        if (!response || !response.users) {
            console.log('No users found');
            return;
        }
        
        var results = response.users.filter(function(user) {
            return user.username.toLowerCase().includes(query.toLowerCase());
        });
        
        var resultsDiv = document.getElementById('resultats-recherche');
        resultsDiv.innerHTML = '';
        
        if (results.length === 0) {
            var noResults = document.createElement('p');
            noResults.style.color = 'var(--texte-secondaire)';
            noResults.textContent = 'Aucun joueur trouvé';
            resultsDiv.appendChild(noResults);
            return;
        }
        
        results.forEach(function(user) {
            var line = createFriendLine(user.username, 'offline', [
                { label: 'Ajouter', type: 'vert', onclick: function() {
                    console.log('Add friend: ' + user.username);
                }}
            ]);
            resultsDiv.appendChild(line);
        });
    }).catch(function(error) {
        console.error('Search failed:', error);
    });
}

function loadFriendsData() {
    var requestsDiv = document.querySelector('.amis-section:nth-child(2) .amis-liste');
    var friendsDiv = document.querySelector('.amis-section:nth-child(3) .amis-liste');
    
    // Pour maintenant, vider les listes si aucune donnée du serveur
    requestsDiv.innerHTML = '<p style="color: var(--texte-secondaire);">Aucune demande d\'ami</p>';
    friendsDiv.innerHTML = '<p style="color: var(--texte-secondaire);">Aucun ami pour le moment</p>';
}

document.addEventListener('DOMContentLoaded', function() {
    loadFriendsData();
    
    var searchInput = document.getElementById('recherche-joueur');
    if (searchInput) {
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                rechercherJoueur();
            }
        });
    }
});
