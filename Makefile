# Jugnu Alert: shortcuts for local work, git, and deploy.
#
# Run `make help` to list targets. Use Git Bash (or any POSIX shell) on Windows.
# Deploys run from YOUR Google accounts: `gcloud auth login` and `firebase login` first.
#
# Examples
#   make install test
#   make ship m="Fix expected-amount match"      # scan, commit and push the current branch
#   make deploy PROJECT_ID=my-project            # Cloud Run + Firebase Hosting
#   make check-live PROJECT_ID=my-project

.DEFAULT_GOAL := help

# --- settings (override on the command line: make push BRANCH=main) ---
PROJECT_ID ?=
REGION     ?= asia-south1
SERVICE    ?= jugnu-alert
SA_NAME    ?= jugnu-alert-run
SA_EMAIL   := $(SA_NAME)@$(PROJECT_ID).iam.gserviceaccount.com
MODEL      ?= gemini-3.5-flash-lite
EXTRA_ENV  ?=

REMOTE     ?= origin
REPO       ?= PayChirm-Jugnu
GH_USER    ?= SyedAsadRazaDevops
BRANCH     ?= $(shell git branch --show-current)
GIT_NAME   ?= syed asad raza
GIT_EMAIL  ?= 71556060+SyedAsadRazaDevops@users.noreply.github.com

SECRET_RE := AIza[0-9A-Za-z_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|gh[opsu]_[A-Za-z0-9]{20,}|ya29\.[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}

.PHONY: help install dev build typecheck test check \
        setup-git status scan commit push ship \
        need-project gcp-setup secret-gemini-key deploy-run deploy-run-mock deploy-run-fallback unmock \
        firebase-setup deploy-hosting deploy check-live

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  make %-20s %s\n", $$1, $$2}'

# ---------------------------------------------------------------- local work
install: ## Install dependencies (npm ci)
	npm ci

dev: ## Run the service locally with auto-reload (mock Gemini, no credentials)
	npm run dev

build: ## Compile TypeScript to dist/
	npm run build

typecheck: ## Type-check without emitting files
	npm run typecheck

test: ## Run the unit tests
	npm test

check: typecheck test ## Type-check and test

# ----------------------------------------------------------------------- git
setup-git: ## Set this clone's commit identity and use https for the remote (once)
	git config --local user.name "$(GIT_NAME)"
	git config --local user.email "$(GIT_EMAIL)"
	git remote set-url $(REMOTE) https://github.com/$(GH_USER)/$(REPO).git
	@echo "git is set up for $(GH_USER)/$(REPO)"

status: ## Short git status
	@git status -sb

scan: ## Stage everything and abort if a key or private key is staged
	@git add -A
	@if git grep --cached -nIE '$(SECRET_RE)' -- . ':!Makefile'; then echo "Possible secret staged. Fix it before committing."; exit 1; fi; echo "scan: clean"

commit: scan ## Commit everything: make commit m="message"
	@test -n "$(m)" || (echo 'Usage: make commit m="your message"' && exit 1)
	git commit -m "$(m)"

# Pushes with the $(GH_USER) login for this one command only, then switches the
# GitHub CLI back to whichever account was active before. Global git config is untouched.
push: ## Push the current branch (BRANCH=dev or main) with the personal GitHub login
	@PREV=$$(gh api user --jq .login 2>/dev/null || true); \
	gh auth switch --hostname github.com --user $(GH_USER) || exit 1; \
	git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u $(REMOTE) $(BRANCH); \
	STATUS=$$?; \
	if [ -n "$$PREV" ] && [ "$$PREV" != "$(GH_USER)" ]; then gh auth switch --hostname github.com --user "$$PREV"; fi; \
	exit $$STATUS

ship: commit push ## Scan, commit and push: make ship m="message"

# ------------------------------------------------------- Google Cloud deploy
need-project:
	@test -n "$(PROJECT_ID)" || (echo "Set PROJECT_ID, e.g. make $(MAKECMDGOALS) PROJECT_ID=my-project" && exit 1)

gcp-setup: need-project ## One-time: enable APIs, create Firestore and the service account
	gcloud config set project "$(PROJECT_ID)"
	gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com aiplatform.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com
	-gcloud firestore databases create --location="$(REGION)" --type=firestore-native
	-gcloud iam service-accounts create $(SA_NAME) --display-name="Jugnu Alert service"
	for ROLE in roles/datastore.user roles/aiplatform.user; do \
	  gcloud projects add-iam-policy-binding "$(PROJECT_ID)" --member="serviceAccount:$(SA_EMAIL)" --role="$$ROLE"; \
	done

secret-gemini-key: need-project ## Optional: store a Gemini API key in Secret Manager (export GEMINI_KEY first)
	@test -n "$$GEMINI_KEY" || (echo "export GEMINI_KEY=... first (never commit it)" && exit 1)
	gcloud services enable secretmanager.googleapis.com
	@printf '%s' "$$GEMINI_KEY" | gcloud secrets create jugnu-gemini-key --data-file=-
	gcloud secrets add-iam-policy-binding jugnu-gemini-key --member="serviceAccount:$(SA_EMAIL)" --role=roles/secretmanager.secretAccessor
	gcloud run services update $(SERVICE) --region "$(REGION)" --update-secrets GEMINI_API_KEY=jugnu-gemini-key:latest

deploy-run: need-project ## Deploy the alert service to Cloud Run (Firestore relay, Gemini via Vertex AI)
	gcloud run deploy $(SERVICE) --source . --region "$(REGION)" --allow-unauthenticated --service-account "$(SA_EMAIL)" --max-instances 3 --set-env-vars "STORE=firestore,GOOGLE_CLOUD_PROJECT=$(PROJECT_ID),GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=$(MODEL),SEED_DEMO_SHOP=true$(EXTRA_ENV)"

deploy-run-mock: EXTRA_ENV := ,MOCK_GEMINI=true
deploy-run-mock: deploy-run ## Dry run: same as deploy-run but with mock Gemini

unmock: need-project ## Turn mock Gemini off after a dry run
	gcloud run services update $(SERVICE) --region "$(REGION)" --remove-env-vars MOCK_GEMINI

deploy-run-fallback: need-project ## Fallback: single always-on instance with the in-memory relay (no Firestore)
	gcloud run deploy $(SERVICE) --source . --region "$(REGION)" --allow-unauthenticated --service-account "$(SA_EMAIL)" --min-instances 1 --max-instances 1 --timeout 3600 --set-env-vars "STORE=memory,GOOGLE_CLOUD_PROJECT=$(PROJECT_ID),GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=$(MODEL)"

# ------------------------------------------------------------- Firebase deploy
firebase-setup: need-project ## One-time: make the project a Firebase project and register the web app
	-firebase projects:addfirebase "$(PROJECT_ID)"
	-firebase apps:create web "Jugnu Alert Screen" --project "$(PROJECT_ID)"
	@echo "Now enable Authentication > Sign-in method > Anonymous in the Firebase console (one click)."

deploy-hosting: need-project ## Publish the Screen and Console pages, the /api rewrite and Firestore rules
	firebase deploy --only hosting,firestore --project "$(PROJECT_ID)"

deploy: deploy-run deploy-hosting ## Cloud Run, then Firebase Hosting

check-live: need-project ## Check the live site (open the pages in a private window too)
	curl -fsS "https://$(PROJECT_ID).web.app/api/health"; echo
	curl -fsS "https://$(PROJECT_ID).web.app/api/config"; echo
	@echo "Open https://$(PROJECT_ID).web.app/ and https://$(PROJECT_ID).web.app/console in a private window."
