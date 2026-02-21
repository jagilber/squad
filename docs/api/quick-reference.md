# Squad SDK v1 — API Quick Reference

> **⚠️ INTERNAL ONLY — DO NOT PUBLISH**

## Adapter (`src/adapter/`)

| Export | Kind | Description |
|--------|------|-------------|
| `SquadClient` | class | Wraps Copilot SDK with lifecycle management and auto-reconnection |
| `SquadConnectionState` | type | `"disconnected" \| "connecting" \| "connected" \| "reconnecting" \| "error"` |
| `SquadClientOptions` | interface | Configuration for SquadClient (CLI path, port, auth, reconnection) |
| `SquadError` | class | Base error with severity, category, context, and recoverability |
| `SDKConnectionError` | class | SDK connection failure |
| `SessionLifecycleError` | class | Session create/destroy failure |
| `ToolExecutionError` | class | Tool invocation failure |
| `ModelAPIError` | class | Model API call failure |
| `ConfigurationError` | class | Invalid configuration |
| `AuthenticationError` | class | Auth failure |
| `RateLimitError` | class | Rate limit exceeded |
| `RuntimeError` | class | General runtime failure |
| `ValidationError` | class | Input validation failure |
| `ErrorSeverity` | enum | `INFO \| WARNING \| ERROR \| CRITICAL` |
| `ErrorCategory` | enum | `SDK_CONNECTION \| SESSION_LIFECYCLE \| TOOL_EXECUTION \| MODEL_API \| ...` |
| `ErrorFactory` | class | Wraps raw SDK errors with Squad context |
| `TelemetryCollector` | class | Tracks operation latency and error rates |
| `SquadSession` | interface | Session handle with sendMessage/destroy |
| `SquadTool` | interface | Tool definition with name, schema, handler |
| `SquadSessionHooks` | interface | Lifecycle hooks (pre/post tool use, session start/end) |

## Client (`src/client/`)

| Export | Kind | Description |
|--------|------|-------------|
| `SquadClientWithPool` | class | High-level client composing SquadClient + SessionPool + EventBus |
| `SessionPool` | class | Bounded concurrent session management with idle cleanup |
| `SessionStatus` | type | `"creating" \| "active" \| "idle" \| "error" \| "destroyed"` |
| `SessionPoolConfig` | interface | Pool config (maxConcurrent, idleTimeout, healthCheckInterval) |
| `EventBus` | class | Pub/sub for session lifecycle events |
| `SquadEvent` | interface | Event with type, sessionId, payload, timestamp |
| `SquadEventType` | type | `"session.created" \| "session.destroyed" \| "session.status_changed" \| ...` |

## Runtime (`src/runtime/`)

| Export | Kind | Description |
|--------|------|-------------|
| `loadConfig` | function | Discovers, loads, and validates squad.config.ts |
| `loadConfigSync` | function | Synchronous variant of loadConfig |
| `discoverConfigFile` | function | Walks up directories to find config file |
| `validateConfig` | function | Runtime type guard for SquadConfig |
| `HealthMonitor` | class | Periodic connection health checks |
| `HealthCheckResult` | interface | Status (`healthy \| degraded \| unhealthy`) with response time |
| `EventBus` | class | Enhanced event bus with error handlers and cleanup |

## Config (`src/config/`)

| Export | Kind | Description |
|--------|------|-------------|
| `SquadConfig` | interface | Root typed configuration for Squad teams |
| `TeamConfig` | interface | Team name, root directory, description |
| `AgentConfig` | interface | Per-agent configuration (model, tools, status) |
| `RoutingConfig` | interface | Work-type and issue-label routing rules |
| `ModelConfig` | interface | Model preferences and fallback chains |
| `HooksConfig` | interface | Hook/policy configuration |
| `defineConfig` | function | Merges partial config with defaults (Vite-style API) |
| `DEFAULT_CONFIG` | const | Default configuration values |
| `ModelRegistry` | class | Model catalog with tier/provider indexing and fallback chains |
| `MODEL_CATALOG` | const | Array of 17 ModelInfo entries |
| `ModelInfo` | interface | Model capability metadata (name, tier, provider, context window) |
| `DEFAULT_FALLBACK_CHAINS` | const | Tier-based fallback model chains |
| `getModelInfo` | function | Look up model by name |
| `getFallbackChain` | function | Get fallback chain for a tier |
| `isModelAvailable` | function | Check if a model is in the catalog |
| `compileRoutingRules` | function | Compiles routing config into regex-based router |
| `matchRoute` | function | Matches a message to a routing rule |
| `matchIssueLabels` | function | Matches issue labels to routing rules |
| `parseRoutingMarkdown` | function | Parses legacy routing.md table format |
| `AgentDefinition` | interface | Full agent definition from any source |
| `AgentRegistry` | class | Multi-source agent discovery |
| `LocalAgentSource` | class | Discovers agents from local .squad/ directory |
| `GitHubAgentSource` | class | Fetches agents from GitHub repositories |
| `MarketplaceAgentSource` | class | Discovers agents from marketplace |
| `parseAgentDoc` | function | Parses .agent.md into structured metadata |
| `AgentDocMetadata` | interface | Structured metadata from agent docs |
| `syncDocToConfig` | function | Merges agent doc metadata into SquadConfig |
| `syncConfigToDoc` | function | Generates agent markdown from typed config |
| `detectDrift` | function | Detects mismatches between doc and config |
| `DriftReport` | interface | List of drift entries with mismatch details |
| `initSquad` | function | Scaffolds a new Squad project |
| `InitOptions` | interface | Options for project initialization |
| `MigrationRegistry` | class | Registers and executes semver migration chains |
| `Migration` | interface | Single version migration (from, to, transform function) |
| `parseSemVer` | function | Parses version string into SemVer object |
| `compareSemVer` | function | Compares two SemVer values |
| `migrateMarkdownToConfig` | function | Converts .ai-team/ markdown to typed SquadConfig |
| `parseTeamMarkdown` | function | Parses team.md into structured data |
| `generateConfigFromParsed` | function | Converts parsed markdown into SquadConfig |

## Agents (`src/agents/`)

| Export | Kind | Description |
|--------|------|-------------|
| `AgentCharter` | interface | Agent identity: name, role, expertise, style, tools, model |
| `AgentLifecycleState` | type | `"pending" \| "spawning" \| "active" \| "idle" \| "error" \| "destroyed"` |
| `AgentSessionInfo` | interface | Agent session state (charter, sessionId, state) |
| `compileCharter` | function | Transforms charter.md → SDK CustomAgentConfig |
| `compileCharterFull` | function | Full compile with resolved model/tools and metadata |
| `parseCharterMarkdown` | function | Extracts sections from charter markdown |
| `CompiledCharter` | interface | Compiled charter with resolved model and tools |
| `ParsedCharter` | interface | Parsed charter structure (identity, model, collaboration) |
| `resolveModel` | function | 4-layer priority model resolution |
| `ResolvedModel` | interface | Result with model, tier, source, fallback chain |
| `TaskType` | type | `"code" \| "prompt" \| "docs" \| "visual" \| "planning" \| "mechanical"` |
| `ModelTier` | type | `"premium" \| "standard" \| "fast"` |
| `ModelResolutionSource` | type | `"user-override" \| "charter" \| "task-auto" \| "default"` |
| `AgentLifecycleManager` | class | Manages agent spawn→destroy lifecycle with idle reaping |
| `AgentHandle` | interface | Handle to spawned agent (sendMessage, destroy) |
| `SpawnAgentOptions` | interface | Options for spawning an agent |
| `onboardAgent` | function | Creates agent directory, charter, and history |
| `addAgentToConfig` | function | Registers agent in squad.config.ts |
| `createHistoryShadow` | function | Creates agent history.md file |
| `appendToHistory` | function | Appends entry to agent history section |
| `readHistory` | function | Reads and parses agent history |

## Coordinator (`src/coordinator/`)

| Export | Kind | Description |
|--------|------|-------------|
| `Coordinator` | class | Central orchestrator for routing and agent sessions |
| `RoutingDecision` | interface | Routing result with tier, targets, parallelism flag |
| `ResponseTier` | type | `"direct" \| "lightweight" \| "standard" \| "full"` |
| `spawnParallel` | function | Spawns multiple agents concurrently (Promise.allSettled) |
| `aggregateSessionEvents` | function | Forwards agent events to coordinator event bus |
| `SpawnResult` | interface | Spawn outcome with status, timing, and errors |
| `AgentSpawnConfig` | interface | Config for spawning (name, task, priority, model override) |

## Hooks (`src/hooks/`)

| Export | Kind | Description |
|--------|------|-------------|
| `HookPipeline` | class | Runs pre/post tool hooks with 5 built-in policies |
| `ReviewerLockoutHook` | class | Prevents agents from editing artifacts they review |
| `PolicyConfig` | interface | Config for file guards, shell restrictions, rate limits, PII |
| `HookAction` | type | `"allow" \| "block" \| "modify"` |
| `PreToolUseHook` | type | Async hook function for pre-tool interception |
| `PostToolUseHook` | type | Async hook function for post-tool inspection |

## Tools (`src/tools/`)

| Export | Kind | Description |
|--------|------|-------------|
| `ToolRegistry` | class | Registers and manages the 5 built-in Squad tools |
| `defineTool` | function | Defines a typed tool with JSON schema |
| `ToolResult` | interface | Tool execution result (success flag + data) |
| `RouteRequest` | interface | Parameters for routing a task to another agent |
| `DecisionRecord` | interface | Data for recording a team decision |
| `MemoryEntry` | interface | Entry for agent history (learnings, updates) |
| `StatusQuery` | interface | Query filter for session pool status |
| `SkillRequest` | interface | Parameters for reading/writing agent skills |
