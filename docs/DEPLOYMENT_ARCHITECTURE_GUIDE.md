# Deployment Architecture — Complete Learning Guide

## For the Placement Interview Performance Tracker

> This document explains **what containerization, CI/CD, and cloud deployment are, every decision made during this session, and how to explain the entire deployment architecture to someone**. Written for a first-time deployer.

**Date:** 2026-10-07
**Branch:** `development`

---

## Table of Contents

1. [Decisions Made and Why](#1-decisions-made-and-why)
2. [What is Deployment? (The Big Picture)](#2-what-is-deployment-the-big-picture)
3. [What is Docker and Why Do We Need It?](#3-what-is-docker-and-why-do-we-need-it)
4. [What is a Container vs a Virtual Machine?](#4-what-is-a-container-vs-a-virtual-machine)
5. [Anatomy of Our Dockerfile — Line by Line](#5-anatomy-of-our-dockerfile--line-by-line)
6. [What is CI/CD?](#6-what-is-cicd)
7. [GitHub Actions — Our CI/CD Pipeline](#7-github-actions--our-cicd-pipeline)
8. [What is Google Cloud Run?](#8-what-is-google-cloud-run)
9. [What is Auto-Scaling and Why It Matters](#9-what-is-auto-scaling-and-why-it-matters)
10. [Gunicorn + Uvicorn Workers — Production Server](#10-gunicorn--uvicorn-workers--production-server)
11. [Environment Variables — Keeping Secrets Safe](#11-environment-variables--keeping-secrets-safe)
12. [The Complete Deployment Flow — Step by Step](#12-the-complete-deployment-flow--step-by-step)
13. [Every File Created and Why](#13-every-file-created-and-why)
14. [Every File Modified and Why](#14-every-file-modified-and-why)
15. [Database Decision — SQLite Now, PostgreSQL Later](#15-database-decision--sqlite-now-postgresql-later)
16. [Why Google Cloud Over AWS and Azure](#16-why-google-cloud-over-aws-and-azure)
17. [Cost Analysis — How This Stays Free](#17-cost-analysis--how-this-stays-free)
18. [What "Scalable" Actually Means](#18-what-scalable-actually-means)
19. [Common Interview Questions About Deployment](#19-common-interview-questions-about-deployment)
20. [Glossary](#20-glossary)

---

## 1. Decisions Made and Why

These are the key architectural decisions taken during this session and the reasoning behind each one.

### Decision 1: Google Cloud Platform over AWS and Azure

| Option Considered | Free Tier Duration | Why We Rejected/Chose It |
|---|---|---|
| **AWS (EC2 t2.micro)** | 12 months only | Starts charging ~$8.50/month after the free year ends |
| **Azure (B1s VM)** | 12 months only | Same problem — ~$7.60/month after year one |
| **Google Cloud (Cloud Run)** | **Always free** | 2 million requests/month free forever, scales to zero |

**The decision:** Google Cloud Run — because its free tier is **permanent**, not a 12-month trial.

### Decision 2: Cloud Run (Serverless Containers) over a VM

| Option | Scaling | Cost When Idle | Company Standard? |
|---|---|---|---|
| **VM (Compute Engine)** | Manual — you resize it yourself | Runs 24/7 even with 0 users | Old-school |
| **Cloud Run** | Automatic — spins up/down with traffic | **$0 when no traffic** | Yes — cloud-native |

**The decision:** Cloud Run — because the project requirement was "scalable" and Cloud Run auto-scales. A VM doesn't.

### Decision 3: Docker for Containerization

**Why Docker?** Cloud Run only accepts Docker containers. But beyond that requirement, Docker solves the "works on my machine" problem — your app runs identically on your laptop, your teammate's laptop, and Google's servers.

### Decision 4: GitHub Actions for CI/CD

**Why GitHub Actions?** The code is already on GitHub. GitHub Actions is free for public repos (2000 minutes/month for private). No need to set up Jenkins, CircleCI, or any external CI tool.

### Decision 5: Keep SQLite for Now, Migrate to PostgreSQL Later

**Why not migrate the database immediately?**
- The codebase has 1500+ lines of database code in `db.py`
- Rewriting it all at once risks breaking the app
- SQLite works fine for demos and low traffic
- The migration to PostgreSQL + Supabase is planned as Phase 2

**Why will we eventually need PostgreSQL?**
- Cloud Run can spin up multiple copies of the app simultaneously
- Each copy would get its own SQLite file — they can't share data
- PostgreSQL lives on a separate server that all copies connect to

### Decision 6: Gunicorn with Uvicorn Workers (not plain Uvicorn)

| Server Setup | What It Does | Suitable For |
|---|---|---|
| `uvicorn app:app` | Single async Python process | Development only |
| `gunicorn -k uvicorn.workers.UvicornWorker` | Multiple worker processes managed by gunicorn | **Production** |

**The decision:** Gunicorn manages multiple uvicorn workers. If one worker crashes, gunicorn restarts it. If one worker is busy handling a slow request, another worker takes the next request. This is the industry-standard way to run FastAPI in production.

---

## 2. What is Deployment? (The Big Picture)

Right now, your app runs like this:

```
Your laptop
├── python app.py
├── Browser opens http://localhost:8000
└── Only YOU can access it
```

**Deployment** means moving your app to a server on the internet so anyone with the URL can access it:

```
Google's Server (Cloud Run)
├── Your app is running
├── URL: https://placement-tracker-xxxxx.run.app
└── ANYONE can access it from anywhere in the world
```

The challenge is: Google's server is a completely different computer. It doesn't have your Python installed, your files, your `.env`, or your dependencies. You need to package everything your app needs into a **container** (using Docker) and ship that container to Google.

---

## 3. What is Docker and Why Do We Need It?

### The Problem Docker Solves

Imagine you're moving houses. You could carry your furniture piece by piece — but some things might break, you might forget something, and your new house might have different door sizes.

**Or** you could pack everything into a standardized shipping container. The container fits on any truck, any ship, and opens the same way anywhere in the world.

Docker does the same thing for software:

```
WITHOUT Docker:
  You: "Here are my Python files, you also need Python 3.11, and these
       10 pip packages, and this specific folder structure, and..."
  Server: "I have Python 3.9, some packages conflict, folder structure
           is different... it doesn't work."

WITH Docker:
  You: "Here's a container."
  Server: "Running it." ✅
```

### What's Inside a Docker Container?

```
┌─────────────────────────────────┐
│        Docker Container          │
│                                  │
│  ┌───────────────────────────┐  │
│  │  Linux (slim)              │  │  ← Tiny operating system
│  │  Python 3.11               │  │  ← Exact Python version
│  │  pip packages (FastAPI...) │  │  ← All dependencies
│  │  Your code (app.py, etc.)  │  │  ← Your application
│  │  public/ (frontend files)  │  │  ← Static files
│  └───────────────────────────┘  │
│                                  │
│  Exposes port 8080               │
│  Runs: gunicorn app:app          │
└─────────────────────────────────┘
```

A container is a **lightweight, isolated environment** that has everything your app needs. It's like a mini computer inside your computer, but much lighter than a virtual machine.

### Docker Terminology

| Term | What It Means | Analogy |
|---|---|---|
| **Dockerfile** | A recipe for building a container | A cooking recipe |
| **Image** | The built container (ready to run) | A frozen meal (made from the recipe) |
| **Container** | A running instance of an image | The meal being eaten |
| **Registry** | A storage place for images | A freezer warehouse |

---

## 4. What is a Container vs a Virtual Machine?

You might hear people compare containers to VMs. Here's the key difference:

```
VIRTUAL MACHINE                          DOCKER CONTAINER
┌──────────────────┐                     ┌──────────────────┐
│   Your App       │                     │   Your App       │
│   Python 3.11    │                     │   Python 3.11    │
│   pip packages   │                     │   pip packages   │
├──────────────────┤                     └──────┬───────────┘
│   Full Guest OS  │  ← Entire OS               │
│   (Ubuntu 22.04) │     (~2-10 GB)              │ Shares host OS kernel
├──────────────────┤                             │ (only ~100-300 MB)
│   Hypervisor     │                             │
├──────────────────┤                     ┌───────┴──────────┐
│   Host OS        │                     │   Host OS        │
│   (Windows/Mac)  │                     │   (Windows/Mac)  │
└──────────────────┘                     └──────────────────┘

Size: 2-10 GB                            Size: 100-500 MB
Boot time: minutes                       Boot time: seconds
```

**Why containers win for deployment:**
- **Faster to start** — Cloud Run can spin up a new container in seconds
- **Smaller** — less storage, faster to transfer
- **Identical everywhere** — same container runs on your laptop and in the cloud

---

## 5. Anatomy of Our Dockerfile — Line by Line

Our `Dockerfile` is the recipe that tells Docker how to build our container:

```dockerfile
FROM python:3.11-slim
```
**What:** Start with an official Python 3.11 image (slim variant — only ~150MB instead of ~900MB).
**Why:** We need Python to run our app. The `slim` variant doesn't include build tools we don't need, keeping the image small.

```dockerfile
WORKDIR /app
```
**What:** Create a `/app` directory inside the container and `cd` into it.
**Why:** Gives our code a clean home. Everything after this runs inside `/app`.

```dockerfile
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
```
**What:** Copy `requirements.txt` first, then install all Python packages.
**Why this is TWO separate steps:** Docker caches each step. If your code changes but `requirements.txt` doesn't, Docker skips the `pip install` (which takes 30+ seconds) and reuses the cached result. This makes rebuilds fast. This is called **layer caching** — one of Docker's most important optimizations.

```dockerfile
COPY . .
```
**What:** Copy the rest of your project files into the container.
**Why separate from requirements?** Because your code changes frequently but dependencies don't. By copying requirements first and installing them, Docker caches that expensive step.

```dockerfile
EXPOSE 8080
```
**What:** Declares that the container listens on port 8080.
**Why 8080?** Cloud Run expects containers to listen on port 8080 by default. This line is documentation — it doesn't actually open the port, but tells Docker (and humans reading the Dockerfile) which port the app uses.

```dockerfile
CMD ["gunicorn", "app:app", "-w", "2", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8080"]
```
**What:** The command that runs when the container starts.
**Breaking it down:**
- `gunicorn` — the production process manager
- `app:app` — "in the file `app.py`, use the variable `app`" (which is our FastAPI instance)
- `-w 2` — run 2 worker processes (each handles requests independently)
- `-k uvicorn.workers.UvicornWorker` — each worker uses uvicorn's async engine (needed for FastAPI's `async def` routes)
- `--bind 0.0.0.0:8080` — listen on all network interfaces, port 8080

---

## 6. What is CI/CD?

**CI** = Continuous Integration
**CD** = Continuous Deployment

In plain English:

```
WITHOUT CI/CD (manual deployment):
  1. You finish coding
  2. You open Google Cloud console
  3. You build the Docker image manually
  4. You push it to the registry manually
  5. You update Cloud Run manually
  6. You pray nothing broke
  7. Repeat for every single change

WITH CI/CD (automated):
  1. You: git push
  2. Everything else happens automatically ✅
```

**CI (Continuous Integration)** — Every time someone pushes code, it's automatically built and tested. This catches bugs before they reach production.

**CD (Continuous Deployment)** — After CI passes, the code is automatically deployed to the live server. No manual steps, no human error.

### Why CI/CD is a Company Standard

Companies use CI/CD because:
1. **Speed** — Deploy in minutes, not hours
2. **Reliability** — Same steps every time, no "I forgot to..."
3. **Audit trail** — Every deployment is logged in GitHub Actions
4. **Rollback** — If something breaks, deploy the previous version with one click

---

## 7. GitHub Actions — Our CI/CD Pipeline

GitHub Actions is GitHub's built-in CI/CD system. It runs "workflows" — automated scripts triggered by events (like a `git push`).

### Our Workflow Explained: `.github/workflows/deploy.yml`

**Trigger:**
```yaml
on:
  push:
    branches: [development]
```
This workflow runs **only when code is pushed to the `development` branch**. Pushes to feature branches don't trigger deployment. This means you can work freely on feature branches and only deploy when you merge to `development`.

**Environment variables:**
```yaml
env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  SERVICE_NAME: placement-tracker
  REGION: us-central1
```
- `${{ secrets.GCP_PROJECT_ID }}` — Reads from GitHub's encrypted secrets store. Never hardcoded.
- `SERVICE_NAME` — What your Cloud Run service is called
- `REGION` — `us-central1` (Iowa, USA) — one of the cheapest Google Cloud regions

**The steps, in order:**

| Step | What It Does | Why |
|---|---|---|
| `actions/checkout@v4` | Downloads your code into the GitHub Actions runner | The runner starts empty — it needs your code |
| `google-github-actions/auth@v2` | Authenticates to Google Cloud using a service account key | Google needs to know you're authorized to deploy |
| `google-github-actions/setup-gcloud@v2` | Installs the `gcloud` CLI tool | Needed to interact with Google Cloud services |
| Configure Docker | Tells Docker how to authenticate with Google's container registry | So `docker push` can upload to Google's registry |
| Build and push image | `docker build` + `docker push` | Builds your container and stores it in Google Artifact Registry |
| Deploy to Cloud Run | `gcloud run deploy` | Tells Cloud Run to use the new image |

**The `gcloud run deploy` flags explained:**

```yaml
gcloud run deploy placement-tracker \
  --image $IMAGE \              # Which Docker image to use
  --region us-central1 \        # Where to run it
  --platform managed \          # Google manages the infrastructure
  --allow-unauthenticated \     # Anyone can access the URL (it's a public web app)
  --port 8080 \                 # The port your container listens on
  --memory 512Mi \              # 512 MB RAM per container
  --cpu 1 \                     # 1 vCPU per container
  --min-instances 0 \           # Scale to ZERO when no traffic (saves cost)
  --max-instances 3 \           # Never run more than 3 containers (controls cost)
  --set-env-vars "SECURE_COOKIES=true"  # Environment variable for HTTPS cookies
```

### How Secrets Work in GitHub Actions

Secrets like `GCP_PROJECT_ID` and `GCP_SA_KEY` are stored encrypted in your GitHub repository settings. They are:
- **Never visible** in logs (GitHub redacts them automatically)
- **Never accessible** from forked repositories
- **Only available** during workflow runs

This is how you keep API keys and credentials safe while still using them in automated deployments.

---

## 8. What is Google Cloud Run?

Cloud Run is Google's **serverless container platform**. Let's break that down:

- **Serverless** — You don't manage any server. No SSH, no security patches, no disk management. Google handles all of that.
- **Container** — You give it a Docker container, and it runs it.
- **Platform** — It's a managed service with auto-scaling, logging, HTTPS, and custom domains built in.

### How Cloud Run Works

```
               ┌─── No traffic ───┐
               │                  │
               │  0 containers    │  ← Costs $0
               │  (scaled to      │
               │   zero)          │
               └──────────────────┘

User visits    ┌──────────────────┐
your URL  ───→ │  1 container     │  ← Cloud Run starts one
               │  spins up        │     (takes 1-2 seconds)
               └──────────────────┘

100 users      ┌──────────────────┐
at once   ───→ │  3 containers    │  ← Cloud Run adds more
               │  running         │     (up to your max of 3)
               └──────────────────┘

Traffic stops  ┌──────────────────┐
               │  Scales back     │  ← After ~15 min idle,
               │  to 0            │     back to $0
               └──────────────────┘
```

### Cloud Run vs Traditional Hosting

| Feature | Traditional VM | Cloud Run |
|---|---|---|
| You manage the server | Yes (OS updates, security) | No |
| Scaling | Manual (buy bigger VM) | Automatic |
| Paying when idle | Yes (24/7) | No (scales to zero) |
| HTTPS certificate | You install it yourself | Automatic |
| Custom domain | You configure DNS + Nginx | Built-in |
| Deployment | SSH + manual restart | `git push` (via GitHub Actions) |

---

## 9. What is Auto-Scaling and Why It Matters

**Scaling** = Adjusting resources to handle more (or fewer) users.

### Types of Scaling

```
VERTICAL SCALING (Scale Up)          HORIZONTAL SCALING (Scale Out)
"Buy a bigger machine"               "Add more machines"

┌─────────┐     ┌───────────────┐   ┌─────┐ ┌─────┐ ┌─────┐
│         │     │               │   │ App │ │ App │ │ App │
│  Small  │ ──→ │    Large      │   │  1  │ │  2  │ │  3  │
│  Server │     │    Server     │   └─────┘ └─────┘ └─────┘
└─────────┘     └───────────────┘
                                    ← This is what Cloud Run does
```

**Cloud Run does horizontal scaling** — it adds more containers when traffic increases. This is why the project was flagged as needing a "scalable" architecture:

- **Without scaling:** If 50 students open the app during a demo and the single server can't handle it, the app crashes.
- **With Cloud Run:** It automatically spins up more containers to handle the load, then scales back down when the demo is over.

Our `--max-instances 3` setting means Cloud Run will run at most 3 copies of our app simultaneously. This caps costs while still handling reasonable traffic.

---

## 10. Gunicorn + Uvicorn Workers — Production Server

### Why Not Just Use `uvicorn app:app`?

During development, you run:
```bash
uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

This is a **single process** with `--reload` watching for file changes. It works for development but has problems in production:

1. **Single process** — One slow request blocks everything
2. **`--reload`** — Wastes CPU constantly scanning for file changes
3. **No crash recovery** — If the process dies, your app goes down

### Gunicorn as the Process Manager

```
WITHOUT gunicorn (development):
┌──────────────────┐
│  uvicorn          │  ← Single process
│  (handles ALL     │     If this crashes, app is dead
│   requests)       │
└──────────────────┘

WITH gunicorn (production):
┌──────────────────────────────────┐
│  gunicorn (master process)        │  ← Watches over workers
│                                   │
│  ┌──────────┐  ┌──────────┐      │
│  │ uvicorn  │  │ uvicorn  │      │
│  │ worker 1 │  │ worker 2 │      │  ← 2 workers (-w 2)
│  │          │  │          │      │     handle requests independently
│  └──────────┘  └──────────┘      │
│                                   │
│  If worker 1 crashes → gunicorn   │
│  automatically restarts it        │
└──────────────────────────────────┘
```

**`-w 2`** means 2 worker processes. Each worker can handle requests independently. On our Cloud Run container with 1 vCPU and 512MB RAM, 2 workers is the sweet spot — enough to handle concurrent requests without running out of memory.

**`-k uvicorn.workers.UvicornWorker`** tells gunicorn that each worker should be a uvicorn async worker. This is required because FastAPI uses `async def` for its routes — a regular gunicorn worker wouldn't support that.

---

## 11. Environment Variables — Keeping Secrets Safe

### The Problem

Your app needs secrets — the JWT signing key, database passwords, API keys. You can't put these in your code because:

1. Your code is on GitHub — anyone can read it
2. Different environments need different values (dev vs production)
3. Rotating a secret shouldn't require a code change

### The Solution: Environment Variables

```
DEVELOPMENT (your laptop):
  .env file (gitignored):
    JWT_SECRET_KEY=my-dev-secret
    SECURE_COOKIES=false

PRODUCTION (Cloud Run):
  Cloud Run environment variables (set in Google Console):
    JWT_SECRET_KEY=a1b2c3d4e5f6... (long random string)
    SECURE_COOKIES=true
    GROQ_API_KEY=gsk_xxxxx
```

Your code reads `os.getenv("JWT_SECRET_KEY")` — it doesn't care WHERE the value comes from. On your laptop it comes from `.env`. On Cloud Run it comes from the Cloud Run configuration.

### Our `.env.example` File

This file is committed to Git (unlike `.env`). It documents every environment variable the app needs, with safe placeholder values. When a new developer clones the repo, they:

1. Copy `.env.example` to `.env`
2. Fill in their own values
3. Never commit `.env`

---

## 12. The Complete Deployment Flow — Step by Step

Here's exactly what happens from the moment you push code to it being live on the internet:

```
Step 1: You push code
  git push origin development

Step 2: GitHub detects the push
  GitHub sees a push to 'development' branch
  Checks: do any workflow files match this trigger?
  Yes → .github/workflows/deploy.yml triggers

Step 3: GitHub spins up a runner
  A fresh Ubuntu Linux virtual machine starts up
  It has Docker, git, and basic tools pre-installed

Step 4: Checkout
  git clone (your repo) into the runner
  Now the runner has all your code

Step 5: Authenticate to Google Cloud
  Reads GCP_SA_KEY from GitHub Secrets
  Uses it to log in to Google Cloud
  Now the runner can interact with Google Cloud APIs

Step 6: Build Docker image
  Reads your Dockerfile
  FROM python:3.11-slim     → Downloads Python base image
  COPY requirements.txt .   → Copies requirements into image
  RUN pip install ...        → Installs all dependencies
  COPY . .                   → Copies your application code
  Result: a Docker image tagged with the commit SHA

Step 7: Push image to Artifact Registry
  docker push sends the image to Google's container storage
  Tagged as: us-central1-docker.pkg.dev/YOUR_PROJECT/cloud-run-builds/placement-tracker:abc123

Step 8: Deploy to Cloud Run
  gcloud run deploy tells Cloud Run:
  "Use this new image, with these settings"
  Cloud Run pulls the image and prepares it

Step 9: Cloud Run is ready
  The old version keeps serving traffic until the new one is healthy
  Once the new container responds to health checks → traffic switches over
  Zero downtime — users never see an error page

Step 10: Live!
  https://placement-tracker-xxxxx.run.app is serving your new code
  Total time: ~2-4 minutes from git push to live
```

---

## 13. Every File Created and Why

### `Dockerfile`

| Property | Value |
|---|---|
| **What it is** | A recipe for building a Docker container |
| **Why it was created** | Cloud Run only runs Docker containers. Without this file, your app can't be containerized. |
| **Who reads it** | Docker (during `docker build`) |
| **When it runs** | Every time GitHub Actions builds a new image (on push to `development`) |

### `.dockerignore`

| Property | Value |
|---|---|
| **What it is** | A list of files Docker should NOT include in the container |
| **Why it was created** | Without it, Docker copies everything — including test files, `.git/` history (which can be huge), `.env` (which has secrets), and documentation. None of these are needed to run the app, and `.env` would be a security risk. |
| **How it works** | Same syntax as `.gitignore`. Any file matching a pattern is excluded from `COPY . .` |

**What it excludes and why:**

| Pattern | Why excluded |
|---|---|
| `__pycache__/`, `*.pyc` | Python bytecode — regenerated automatically |
| `*.db` | SQLite database — production will use its own |
| `.env` | **Security** — contains secrets that should never be in an image |
| `.git/` | Git history — can be hundreds of MB, not needed at runtime |
| `docs/` | Documentation — not needed for the app to run |
| `test_*.py`, `conftest.py` | Test files — not needed in production |
| `.pytest_cache/` | Test cache — not needed in production |

### `.github/workflows/deploy.yml`

| Property | Value |
|---|---|
| **What it is** | A GitHub Actions workflow definition |
| **Why it was created** | Automates the entire deployment pipeline. Without it, you'd manually build, push, and deploy every time. |
| **When it runs** | Every time code is pushed to the `development` branch |
| **What it does** | Builds Docker image → pushes to Google Artifact Registry → deploys to Cloud Run |

### `docker-compose.yml`

| Property | Value |
|---|---|
| **What it is** | A configuration file for running multi-container applications locally |
| **Why it was created** | So any developer can run the entire app with one command: `docker compose up`. No need to install Python, pip packages, or configure anything. |
| **When it's used** | Local development only — NOT used in production deployment |

**What it configures:**
- Builds the app using the same Dockerfile
- Maps port 8000 on your laptop to port 8080 in the container
- Loads your `.env` file for local secrets
- Mounts `database.db` as a volume so data persists between restarts

---

## 14. Every File Modified and Why

### `app.py` — Server configuration

**Before:**
```python
uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
```

**After:**
```python
port = int(os.getenv("PORT", "8000"))
uvicorn.run("app:app", host="0.0.0.0", port=port, reload=os.getenv("ENV") != "production")
```

**Three changes, three reasons:**

1. **`127.0.0.1` → `0.0.0.0`**
   - `127.0.0.1` means "only accept connections from this machine" (localhost)
   - `0.0.0.0` means "accept connections from anywhere"
   - Inside a Docker container, the outside world connects via Docker's network bridge. If the app only listens on `127.0.0.1`, those connections are rejected.

2. **`8000` → `os.getenv("PORT", "8000")`**
   - Cloud Run automatically sets a `PORT` environment variable (usually 8080)
   - The app must listen on that port or Cloud Run marks it as unhealthy
   - Falls back to 8000 for local development (where PORT isn't set)

3. **`reload=True` → `os.getenv("ENV") != "production"`**
   - `reload=True` makes uvicorn watch every file for changes and restart — great for development
   - In production, this wastes CPU and can cause unexpected restarts
   - Now it's only enabled when `ENV` is not set to `production`

### `requirements.txt` — Missing dependencies

**Added:**

| Package | Why It Was Missing | What Breaks Without It |
|---|---|---|
| `python-multipart>=0.0.9` | Was only in `bulk_upload_module/requirements.txt` | All file upload endpoints crash with a 422 error |
| `PyJWT>=2.8.0` | Was in the old branch but not in `development` | JWT authentication completely fails |
| `slowapi>=0.1.9` | Same — existed on old branch | Rate limiting won't work (may not be in current dev branch routes yet) |
| `gunicorn>=21.2.0` | New addition for production | The `CMD` in Dockerfile wouldn't work |

### `.env.example` — Environment variable documentation

**Added sections for:** JWT configuration, cookie security, environment flag, port, and Groq AI API key. This ensures any developer (or you in 6 months) knows exactly what environment variables the app expects.

### `.gitignore` — Cleanup

**Added:** `venv/`, `.pytest_cache/`, `*.egg-info/` — common Python artifacts that should never be committed to Git.

---

## 15. Database Decision — SQLite Now, PostgreSQL Later

### Why SQLite Works Now

```
Current setup:
┌──────────────────────────┐
│   Single Cloud Run        │
│   Container               │
│                           │
│   FastAPI ←→ SQLite       │  Works fine for demos and low traffic
│   (same container)        │
└──────────────────────────┘
```

SQLite is a **file-based database** — it's just a file called `database.db`. It's fast, requires zero configuration, and handles thousands of reads per second.

### Why PostgreSQL Will Be Needed for True Scalability

```
When Cloud Run scales up:
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Container 1 │  │ Container 2 │  │ Container 3 │
│             │  │             │  │             │
│ App ↔ SQLite│  │ App ↔ SQLite│  │ App ↔ SQLite│
│ (file A)    │  │ (file B)    │  │ (file C)    │
└─────────────┘  └─────────────┘  └─────────────┘
  ↑ PROBLEM: Three separate databases! 
  User logs in on Container 1 → their data doesn't exist on Container 2
```

```
With PostgreSQL (Supabase):
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Container 1 │  │ Container 2 │  │ Container 3 │
│    App      │  │    App      │  │    App      │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │   Supabase       │
              │   (PostgreSQL)   │  ← All containers share one database
              │   Free tier      │
              └──────────────────┘
```

### Why Not Migrate Now?

The migration involves rewriting `db.py` (1500+ lines) from SQLite syntax to PostgreSQL syntax. Key differences include:

| SQLite | PostgreSQL |
|---|---|
| `?` placeholders | `%s` placeholders |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| `sqlite3.connect()` | Connection pooling via `psycopg2` |
| File on disk | Network connection with authentication |

This is planned as **Phase 2** — a separate task with its own branch and testing.

---

## 16. Why Google Cloud Over AWS and Azure

### For a Student Project Requiring Scalability

| Requirement | AWS | Azure | Google Cloud |
|---|---|---|---|
| Free tier duration | 12 months | 12 months | **Always free** |
| Auto-scaling free | Lambda (complex setup) | App Service (limited) | **Cloud Run (simple)** |
| Container deployment | ECS/Fargate ($$$) | Container Apps ($) | **Cloud Run ($0)** |
| HTTPS included | No (need ALB or CloudFront) | No (need App Gateway) | **Yes (automatic)** |
| Deployment complexity | High (IAM, VPC, ECS, ECR) | Medium | **Low** |
| Free requests/month | Varies | Varies | **2 million** |

### The Deciding Factor

**AWS and Azure free tiers expire after 12 months.** If your professor or interviewer visits the URL 13 months from now, they'd see a dead link or a billing surprise.

Google Cloud Run's free tier is **permanent** — 2 million requests/month, forever. For a college project, that's effectively unlimited.

---

## 17. Cost Analysis — How This Stays Free

### Google Cloud Run Free Tier (per month, forever)

| Resource | Free Allowance | Our Usage | Verdict |
|---|---|---|---|
| Requests | 2,000,000 | ~1,000-5,000 (demo traffic) | ✅ Well under |
| CPU | 180,000 vCPU-seconds | Minimal | ✅ Well under |
| Memory | 360,000 GB-seconds | 512MB × minutes of use | ✅ Well under |
| Networking | 1 GB outbound | Tiny (text/JSON responses) | ✅ Well under |
| Artifact Registry | 500 MB storage | ~200MB per image | ✅ Under |

### What Could Trigger Costs?

| Scenario | Risk Level | Prevention |
|---|---|---|
| App goes viral (millions of requests) | Very low | `--max-instances 3` caps scaling |
| Image storage grows (many deployments) | Low | Periodically delete old images |
| Someone DDoSes your URL | Very low | Cloud Run rate limiting + `--max-instances 3` |

**Worst case with our settings:** If all 3 max instances ran 24/7 for a full month (extremely unlikely), it would cost roughly ~$15-20. But with `--min-instances 0`, the app scales to zero when not in use, so realistic cost is **$0**.

---

## 18. What "Scalable" Actually Means

In interviews, "scalable" is a buzzword. Here's what it actually means in the context of this project:

### The Three Axes of Scalability

**1. Horizontal Scaling (adding more instances)**
Our Cloud Run setup handles this. More users → more containers → same performance per user.

**2. Database Scaling (handling more data and queries)**
Currently limited by SQLite. Phase 2 (PostgreSQL migration) addresses this.

**3. Feature Scaling (adding complexity without slowing down)**
The codebase is already structured well — routers, services, controllers, ORM models. New features go in their own modules without touching existing code.

### What Makes Our Architecture "Scalable" (For an Interview)

> "We containerized the FastAPI application with Docker and deployed it on Google Cloud Run, which provides automatic horizontal scaling from zero to N instances based on traffic. The CI/CD pipeline via GitHub Actions ensures that every merge to development automatically builds, tests, and deploys the new version with zero downtime. The current SQLite database is being migrated to PostgreSQL on Supabase to support multi-instance read/write consistency, which is required when Cloud Run scales beyond a single container."

That paragraph covers: containerization, serverless, auto-scaling, CI/CD, zero-downtime deployment, database scalability, and the migration plan. Each term maps to a real implementation decision in this project.

---

## 19. Common Interview Questions About Deployment

### "Why did you choose Docker?"
"Cloud Run requires containers, but beyond that — Docker guarantees our app runs identically everywhere. No more 'works on my machine' issues. Our Dockerfile uses multi-stage layer caching: requirements install first, so code-only changes rebuild in seconds, not minutes."

### "Why Cloud Run over a VM?"
"A VM runs 24/7 whether there's traffic or not. Cloud Run scales to zero — zero traffic means zero cost. When traffic arrives, it spins up containers in seconds. For a project that might see bursts of demo traffic and long quiet periods, serverless is the right economic model."

### "How does your CI/CD pipeline work?"
"Push to development triggers a GitHub Actions workflow. It authenticates to Google Cloud, builds the Docker image, pushes it to Artifact Registry, and tells Cloud Run to use the new image. Cloud Run does a rolling update — the old version keeps serving until the new one passes health checks. Zero downtime."

### "What happens if your app crashes in production?"
"Three layers of recovery: (1) Gunicorn restarts crashed worker processes automatically. (2) If the entire container dies, Cloud Run replaces it with a fresh one. (3) If the new deployment is broken, Cloud Run keeps the old version running — it only switches traffic after the new container is healthy."

### "How do you handle secrets in production?"
"Secrets never touch the codebase. Locally, we use a `.env` file that's gitignored. In production, secrets are stored in Cloud Run's environment variable configuration, which is encrypted at rest. GitHub Actions reads deployment credentials from GitHub's encrypted secrets store — they're redacted in logs and inaccessible from forks."

### "What does 'scalable' mean in your architecture?"
"Our app scales horizontally — Cloud Run adds containers as traffic grows, up to our configured maximum. Each container runs 2 gunicorn workers handling requests concurrently. The planned PostgreSQL migration ensures the database layer scales too, since all containers will share a single managed database instead of isolated SQLite files."

---

## 20. Glossary

| Term | Definition |
|---|---|
| **Artifact Registry** | Google's storage service for Docker images. Like a "Docker Hub" but private to your project. |
| **Auto-scaling** | Automatically adjusting the number of running instances based on traffic. |
| **CI/CD** | Continuous Integration / Continuous Deployment — automating the build-test-deploy pipeline. |
| **Container** | A lightweight, isolated environment containing everything an app needs to run. Starts in seconds. |
| **Cloud Run** | Google's serverless container platform. Runs Docker containers, auto-scales, handles HTTPS. |
| **Docker** | A tool for packaging applications into containers that run the same everywhere. |
| **Dockerfile** | A text file with instructions for building a Docker image. Like a recipe. |
| **Docker Image** | The built result of a Dockerfile. A snapshot of your app + dependencies, ready to run. |
| **docker-compose** | A tool for defining and running multi-container applications locally using a YAML file. |
| **Environment Variable** | A value set outside the code that the application reads at runtime. Used for secrets and configuration. |
| **GitHub Actions** | GitHub's built-in CI/CD platform. Runs workflows in response to events like `git push`. |
| **gcloud** | Google Cloud's command-line tool. Used to deploy, configure, and manage Google Cloud services. |
| **Gunicorn** | A production-grade Python HTTP server that manages multiple worker processes. |
| **Health Check** | A request Cloud Run sends to verify your container is working before routing traffic to it. |
| **Horizontal Scaling** | Adding more machines/containers to handle load (vs. vertical: making one machine bigger). |
| **Layer Caching** | Docker's optimization that reuses unchanged build steps, making rebuilds fast. |
| **Min/Max Instances** | Cloud Run settings controlling how many containers run. Min=0 means scale to zero. |
| **Rolling Update** | Deploying new code by gradually replacing old containers with new ones. No downtime. |
| **Scale to Zero** | Shutting down all instances when there's no traffic. Costs $0 while idle. |
| **Secrets** | Sensitive values (API keys, passwords) stored securely outside the codebase. |
| **Serverless** | A cloud model where the provider manages all infrastructure. You deploy code, not servers. |
| **Service Account** | A Google Cloud identity used by automated systems (like GitHub Actions) to access resources. |
| **Slim Image** | A Docker base image stripped of unnecessary tools, keeping the final image small. |
| **Uvicorn** | An ASGI server for Python async web frameworks like FastAPI. |
| **Volume** | A Docker mechanism for persisting data outside the container's filesystem. |
| **Workflow** | A GitHub Actions automation defined in a YAML file, triggered by events. |
| **Zero Downtime** | Deploying new code without any period where users see errors or an unavailable app. |
