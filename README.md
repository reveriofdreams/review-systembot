# Overview

This is a premium Discord review bot built with Discord.js v14 that provides a comprehensive sequential review system for Discord servers. The bot features a multi-step review process where users progress through star rating selection, comment input, and product selection via interactive menus and modals. Administrators can configure review channels, manage product lists, and customize embed styling. Reviews are stored in a PostgreSQL database and displayed as rich embeds in designated channels with premium styling and minimal emoji usage.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Bot Framework
- **Discord.js v14**: Primary framework for Discord API interaction
- **Gateway Intents**: Configured for guilds and guild messages only to minimize resource usage
- **Slash Commands**: Modern Discord command interface using REST API registration
- **Interactive Components**: Utilizes buttons, modals, and select menus for user interaction

## Database Layer
- **PostgreSQL**: Primary data storage with environment-based connection string
- **postgres-js**: Direct PostgreSQL client for secure parameterized queries
- **Schema Design**: 
  - `reviews` table: Stores user reviews with ratings (1-5), comments, and product information
  - `settings` table: Guild-specific configuration with customizable embed styling and admin roles
- **Data Validation**: Database-level constraints ensure data integrity (rating bounds, required fields)
- **Security**: Parameterized queries prevent SQL injection vulnerabilities

## Permission System
- **Multi-tier Admin Access**: Supports both Discord permissions (Administrator, ManageGuild) and custom role-based access
- **Guild Isolation**: All data and permissions are scoped to individual Discord servers
- **Dynamic Configuration**: Admin roles can be configured per-guild through database settings

## Review Workflow
- **Session Management**: Active review sessions tracked in memory collections
- **Sequential Steps**: Users progress through rating → comment → product selection workflow
- **Modal-based Input**: Users complete reviews through Discord's native modal interface
- **Rich Embeds**: Review submissions formatted as customizable Discord embeds
- **Product Management**: Configurable product lists stored as JSON strings in database

## Data Persistence
- **Environment Configuration**: Database connection managed through environment variables
- **Graceful Initialization**: Automatic table creation with error handling for missing configurations
- **JSON Storage**: Complex data structures (products, admin roles) serialized as JSON strings for flexibility

# External Dependencies

## Core Services
- **Discord API**: Primary service for bot functionality and user interaction
- **PostgreSQL Database**: Requires active database instance with connection string via `DATABASE_URL` environment variable

## NPM Packages
- **discord.js**: Discord API wrapper and bot framework (v14.14.1)
- **@discordjs/builders**: Command and component builders for Discord interactions
- **@discordjs/rest**: REST API client for Discord command registration
- **postgres**: PostgreSQL client library (v3.4.7)
- **pg**: Additional PostgreSQL driver support
- **drizzle-orm**: Database toolkit and ORM
- **drizzle-kit**: Database migration and schema management tools

## Environment Requirements
- **Node.js**: Minimum version 18.0.0 required
- **DATABASE_URL**: PostgreSQL connection string must be configured as environment variable
- **DISCORD_BOT_TOKEN**: Bot token required for Discord API authentication