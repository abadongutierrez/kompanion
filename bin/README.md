# bin/ — Development Scripts

Common commands for developing SDLC Kompanion locally.

## Quick Start

```bash
# First time only
./bin/setup

# Start dev environment (runs until you Ctrl+C)
./bin/start

# In another terminal, stop when done
./bin/stop
```

---

## All Commands

### Setup & Initialization

#### `./bin/setup`
Validates your development environment and installs dependencies.

**Checks:**
- Node.js 20+
- pnpm
- Docker daemon
- Installs all monorepo dependencies

**When to run:** Once per machine, or after adding major dependencies.

**Example:**
```bash
$ ./bin/setup
🔧 SDLC Kompanion Dev Environment Setup

📋 Checking Node.js 20+...
✓ Node.js v20.11.1
📋 Checking pnpm...
✓ pnpm 11.9.0
📋 Checking Docker...
✓ Docker is running
📋 Installing dependencies...
✓ Dependencies installed

✅ Setup complete! Run: bin/start
```

---

### Running the App

#### `./bin/start`
Starts the complete dev environment: PostgreSQL (Docker) + TypeScript server + Kotlin server + React UI.

**Does:**
1. Checks Docker is running
2. Starts PostgreSQL container
3. Waits for database to be ready
4. Starts TypeScript server on http://localhost:3000
5. Starts React UI on http://localhost:5173
6. Starts Kotlin server on http://localhost:8081

**Access:**
- UI: http://localhost:5173
- API (TypeScript): http://localhost:3000
- Kotlin API: http://localhost:8081
- Press Ctrl+C to stop

**Example:**
```bash
$ ./bin/start
▶️  Starting SDLC Kompanion dev environment

📦 Starting PostgreSQL...
✓ PostgreSQL ready

🚀 Starting services...
✓ TypeScript server on http://localhost:3000
✓ React UI on http://localhost:5173
✓ Kotlin server on http://localhost:8081

Press Ctrl+C to stop
```

---

#### `./bin/stop`
Gracefully stops all services (PostgreSQL, servers, UI).

**Does:**
1. Stops Docker containers
2. Kills Node.js processes
3. Cleans up

**Example:**
```bash
$ ./bin/stop
⏹️  Stopping SDLC Kompanion

📦 Stopping PostgreSQL...
✓ All services stopped
```

---

### Testing

#### `./bin/test`
Runs the entire test suite (unit tests across workspaces).

**Example:**
```bash
$ ./bin/test
🧪 Running tests

Running workspace tests...

✅ All tests passed
```

---

#### `./bin/test:e2e`
Runs end-to-end tests (Playwright).

**Requires:** Docker running, servers running or running in headless mode

**Example:**
```bash
$ ./bin/test:e2e
🎭 Running e2e tests with Playwright

Running e2e-tests...

✅ All e2e tests passed
```

---

### Database

#### `./bin/db-reset`
⚠️  **Destructive.** Drops all data and re-creates the database schema.

**Use case:** When you need a fresh database during development.

**Does:**
1. Confirms you really want to reset (interactive prompt)
2. Stops PostgreSQL container
3. Removes volume (all data)
4. Starts fresh PostgreSQL
5. Runs migrations on next app start

**Example:**
```bash
$ ./bin/db-reset
⚠️  Database Reset
This will drop all data.

Are you sure? (y/N): y

Stopping database container...
Starting fresh database...
Waiting for PostgreSQL...
✓ Database reset complete
```

---

### Building & Deployment

#### `./bin/build`
Creates production-ready builds for all packages.

**Requires:** Node.js 20+

**Creates:** Build artifacts in each package's dist/build directory

**Use case:** Before deploying.

**Example:**
```bash
$ ./bin/build
🏗️  Building SDLC Kompanion

Building all packages...

✅ Build successful
   UI: ui/dist
   Server: server/dist
   Kotlin: server-kotlin/target
```

---

#### `./bin/logs`
View application logs from running services.

**Use case:** Debug startup issues or see real-time output.

**Example:**
```bash
$ ./bin/logs
📋 Application Logs

PostgreSQL logs:
[...]

TypeScript Server logs:
[...]
```

---

#### `./bin/clean`
Remove all build artifacts, Docker containers, and cache files.

**Does:**
1. Removes node_modules and build artifacts
2. Stops and removes Docker containers/volumes
3. Cleans temporary files

**Use case:** Start fresh, or before committing to clean up disk space.

**Example:**
```bash
$ ./bin/clean
🧹 Cleaning build artifacts and containers

Removing node_modules and build artifacts...
Removing Docker containers and volumes...

✓ Clean complete
```

---

## Common Workflows

### Daily Development
```bash
# Start of day
./bin/start

# ... make code changes ...

# End of day (Ctrl+C in terminal running bin/start)
./bin/stop
```

### Testing a Feature
```bash
./bin/start  # in one terminal
./bin/test   # in another terminal
```

### Run E2E Tests
```bash
./bin/start  # in one terminal (servers running)
./bin/test:e2e  # in another terminal
```

### Reset Database
```bash
./bin/db-reset
./bin/start  # Migrations re-create schema
```

### Before Committing
```bash
./bin/test
./bin/test:e2e
./bin/clean  # Optional: remove build artifacts
```

### Deploy to Production
```bash
./bin/build
# Take artifacts from each package and deploy
```

---

## Troubleshooting

### Node.js 20+ Not Found
```bash
Error: Node.js 20+ not available
```
**Fix:** Install Node.js 20+ from https://nodejs.org

### pnpm Not Found
```bash
Error: pnpm not available
```
**Fix:** Run `npm install -g pnpm`

### Docker Daemon Not Running
```bash
Error: Docker daemon not running. Start Docker Desktop.
```
**Fix:** Open Docker Desktop app (macOS/Windows) or run `sudo systemctl start docker` (Linux)

### Database Connection Failed
```bash
Error: Unable to connect to database
```
**Fix:** Run `./bin/db-reset` to recreate the database

### Stale Containers/Volumes
```bash
Error: Docker conflict with existing container
```
**Fix:** Run `./bin/clean` to remove all containers and volumes

---

## Prerequisites

All scripts assume:
- **Node.js 20+** (from https://nodejs.org)
- **pnpm 11.9+** (`npm install -g pnpm`)
- **Docker** (with daemon running)

Run `./bin/setup` once to validate your environment.

---

## Adding New Scripts

Keep the naming simple and consistent:
- `./bin/action` (lowercase, no extension)
- Shebang: `#!/bin/bash`
- Color output using ANSI codes for readability
- Include helpful error messages

Example template:
```bash
#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}✓ Operation successful${NC}"
```
