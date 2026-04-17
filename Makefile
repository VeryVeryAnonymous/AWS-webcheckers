.PHONY: help install start clean test

help:
	@echo "WebCheckers Makefile"
	@echo ""
	@echo "Commandes disponibles:"
	@echo "  make install    - Installer les dépendances"
	@echo "  make start      - Démarrer le serveur"
	@echo "  make dev        - Démarrer avec nodemon (rechargement auto)"
	@echo "  make clean      - Supprimer node_modules"
	@echo "  make mongo      - Lancer MongoDB"
	@echo ""

install:
	npm install

start:
	npm start

dev:
	npx nodemon ./server/index.js

clean:
	rm -rf node_modules/
	rm -rf package-lock.json

mongo:
	mkdir -p ./data && mongod --dbpath ./data

mongo-shell:
	mongosh

.DEFAULT_GOAL := help
