# Database Setup Guide

This guide explains how to set up the PostgreSQL database for the Browser Automation API.

## Prerequisites

- PostgreSQL 15.x or higher installed
- Node.js 20.x LTS
- npm or yarn package manager

## Setup Steps

### 1. Create PostgreSQL Database and User

```bash
# Connect to PostgreSQL as superuser
psql postgres

# Create database user
CREATE USER automation_user WITH PASSWORD 'secure_password';

# Create database
CREATE DATABASE browser_automation;

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE browser_automation TO automation_user;

# Exit psql
\q
```

### 2. Configure Environment Variables

Create a `.env` file in the project root (or copy from `.env.example`):

```bash
cp .env.example .env
```

Update the database credentials in `.env`:

```
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=automation_user
DB_PASSWORD=secure_password
DB_DATABASE=browser_automation
```

### 3. Run Migrations

The initial migration will create all tables, indexes, and seed data:

```bash
npm run migration:run
```

This will create the following tables:
- `browser_types` - Available browser configurations
- `automation_jobs` - Job queue and status tracking
- `job_artifacts` - Screenshots, PDFs, and other outputs
- `browser_workers` - Worker process tracking
- `job_logs` - Detailed execution logs

### 4. Verify Setup

Connect to the database and verify tables were created:

```bash
psql -U automation_user -d browser_automation

# List all tables
\dt

# View browser types seed data
SELECT * FROM browser_types;

# Exit
\q
```

You should see 5 browser types:
- Chromium (desktop)
- Firefox (desktop)
- WebKit (desktop)
- Mobile Chrome
- Mobile Firefox

## Database Schema

### Core Entities

#### browser_types
Stores browser configurations with viewport settings and user agents.

#### automation_jobs
Main job queue with status tracking (pending → processing → completed/failed).

#### job_artifacts
Binary storage for screenshots, PDFs, and other job outputs.

#### browser_workers
Tracks active worker processes and their current jobs.

#### job_logs
Detailed execution logs for debugging.

## Migration Commands

```bash
# Run pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Generate new migration from entity changes
npm run migration:generate src/database/migrations/MigrationName

# Create empty migration file
npm run migration:create src/database/migrations/MigrationName
```

## Seed Data

To re-run seed data (safe to run multiple times):

```bash
npm run seed
```

## Troubleshooting

### Connection refused
- Ensure PostgreSQL is running: `pg_ctl status`
- Check connection settings in `.env`
- Verify firewall/network settings

### Permission denied
- Ensure user has proper privileges
- Run the GRANT commands from step 1

### Migration errors
- Check that database exists
- Ensure no other migrations have been run
- Try reverting: `npm run migration:revert`

## Development vs Production

### Development
- `synchronize: true` in TypeORM config (auto-sync schema)
- Use local PostgreSQL instance
- Enable query logging

### Production
- `synchronize: false` (use migrations only)
- Use managed database service (AWS RDS, etc.)
- Disable query logging
- Enable connection pooling
- Set up read replicas for scaling

