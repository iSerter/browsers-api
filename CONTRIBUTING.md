# Contributing to Browsers API

Thank you for considering contributing to Browsers API! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Project Structure](#project-structure)

## Getting Started

### Prerequisites

- Node.js v20.x LTS or higher
- Docker & Docker Compose
- PostgreSQL 15.x (for local development without Docker)
- Git

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/browsers-api.git
cd browsers-api

# Install dependencies
npm install

# Install Playwright browsers
npm run test:setup

# Copy environment configuration
cp .env.example .env

# Start development stack with Docker
./scripts/docker-dev.sh start
./scripts/docker-dev.sh migrate
./scripts/docker-dev.sh seed
```

### Development Environment

We recommend using VS Code with the following extensions:
- ESLint
- Prettier
- Jest
- NestJS Snippets
- Docker

See [`.cursor/rules/vscode.mdc`](.cursor/rules/vscode.mdc) for complete setup instructions.

## Development Workflow

### Creating a New Feature

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/my-new-feature
   ```

2. **Make your changes:**
   - Write code following our [coding standards](#coding-standards)
   - Add tests for your changes
   - Update documentation as needed

3. **Run tests and linting:**
   ```bash
   npm run lint
   npm test
   npm run test:e2e
   ```

4. **Commit your changes:**
   ```bash
   git add .
   git commit -m "feat: add my new feature"
   ```

5. **Push and create a pull request:**
   ```bash
   git push origin feature/my-new-feature
   ```

### Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

**Examples:**
```
feat: add executeScript action handler
fix: resolve browser pool memory leak
docs: update API reference for snapshot action
test: add e2e tests for browser storage
```

## Coding Standards

### TypeScript/NestJS Guidelines

- Follow NestJS conventions and patterns
- Use dependency injection for all dependencies
- Use constructor injection over property injection
- Add proper TypeScript types (avoid `any`)
- Use meaningful variable and function names
- Keep functions small and focused (< 50 lines ideally)

### Code Organization

```typescript
// ✅ DO: Proper service structure
@Injectable()
export class MyService {
  private readonly logger = new Logger(MyService.name);

  constructor(
    private readonly repository: Repository<MyEntity>,
    private readonly configService: ConfigService,
  ) {}

  async doSomething(id: string): Promise<MyEntity> {
    try {
      this.logger.log(`Processing ${id}`);
      return await this.repository.findOne({ where: { id } });
    } catch (error) {
      this.logger.error(`Failed to process ${id}: ${error.message}`);
      throw error;
    }
  }
}
```

### Error Handling

- Use specific NestJS exception types
- Log errors with context
- Don't expose sensitive information

```typescript
// ✅ DO: Specific error handling
if (!job) {
  throw new NotFoundException(`Job with ID ${id} not found`);
}

// ❌ DON'T: Generic errors
throw new Error('Something went wrong');
```

### DTO Validation

- Use class-validator decorators
- Make optional fields truly optional
- Add descriptive comments

```typescript
// ✅ DO: Well-validated DTO
export class CreateJobDto {
  @IsInt()
  @IsPositive()
  @ApiProperty({ description: 'Browser type ID' })
  browserTypeId: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  timeoutMs?: number;
}
```

## Testing Requirements

### Unit Tests

- Write unit tests for all services, controllers, and handlers
- Place tests next to source files: `*.spec.ts`
- Use Jest testing framework
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies
- Aim for 80%+ code coverage

```typescript
// ✅ DO: Clear test structure
describe('JobsService', () => {
  describe('createJob', () => {
    it('should create a new job', async () => {
      // Arrange
      const dto = { browserTypeId: 1, targetUrl: 'https://example.com', actions: [] };
      
      // Act
      const result = await service.createJob(dto);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe('pending');
    });
  });
});
```

### E2E Tests

- Place E2E tests in `test/` directory
- Test complete workflows
- Use real database (test database)
- Clean up test data

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test
npm run test:e2e -- job-workflow.e2e-spec.ts
```

### Testing Checklist

Before submitting a PR, ensure:
- [ ] All unit tests pass
- [ ] All E2E tests pass
- [ ] Code coverage is maintained or improved
- [ ] No linting errors
- [ ] Tests for new features are included
- [ ] Tests for bug fixes demonstrate the fix

## Pull Request Process

### Before Submitting

1. **Update your branch:**
   ```bash
   git checkout main
   git pull origin main
   git checkout feature/my-feature
   git rebase main
   ```

2. **Run full test suite:**
   ```bash
   npm run lint
   npm test
   npm run test:e2e
   npm run test:docker  # Optional but recommended
   ```

3. **Update documentation:**
   - Update README.md if adding new features
   - Update API documentation in `docs/tech/05-api-reference.md`
   - Add JSDoc comments for public APIs

### PR Checklist

- [ ] Branch is up to date with main
- [ ] All tests pass
- [ ] No linting errors
- [ ] Code follows project conventions
- [ ] Documentation is updated
- [ ] Commit messages follow convention
- [ ] PR has clear description
- [ ] Breaking changes are documented

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual testing performed

## Documentation
- [ ] README updated
- [ ] API docs updated
- [ ] Code comments added

## Related Issues
Closes #123
```

## Project Structure

```
browsers-api/
├── src/
│   ├── modules/              # Feature modules
│   │   ├── jobs/            # Job processing
│   │   │   ├── handlers/    # Action handlers
│   │   │   ├── dto/         # Data transfer objects
│   │   │   ├── entities/    # TypeORM entities
│   │   │   └── services/    # Business logic
│   │   ├── browsers/        # Browser pool management
│   │   ├── auth/            # Authentication
│   │   └── ...
│   ├── common/              # Shared utilities
│   │   ├── filters/         # Exception filters
│   │   ├── guards/          # Auth guards
│   │   ├── interceptors/    # Request/response interceptors
│   │   └── middleware/      # Custom middleware
│   ├── config/              # Configuration
│   │   ├── database.config.ts
│   │   └── validation.schema.ts
│   └── database/            # Database
│       ├── migrations/      # TypeORM migrations
│       └── seeds/           # Database seeds
├── test/                    # E2E tests
├── scripts/                 # Development scripts
├── dev/                     # Developer helper scripts
├── docs/                    # Documentation
└── .cursor/rules/           # Cursor AI rules
```

## Adding New Features

### Adding a New Action Handler

1. **Create handler file:**
   ```
   src/modules/jobs/handlers/my-action.handler.ts
   ```

2. **Implement handler:**
   ```typescript
   @Injectable()
   export class MyActionHandler {
     async execute(page: Page, action: ActionConfig, jobId: string): Promise<void> {
       // Implementation
     }
   }
   ```

3. **Create tests:**
   ```
   src/modules/jobs/handlers/my-action.handler.spec.ts
   ```

4. **Register in factory:**
   ```typescript
   // action-handler.factory.ts
   case 'myAction':
     return this.myActionHandler;
   ```

5. **Update DTO:**
   ```typescript
   // action-config.dto.ts
   @IsIn(['click', 'fill', 'myAction', ...])
   action: string;
   ```

6. **Update documentation:**
   - README.md
   - docs/tech/05-api-reference.md

### Adding a New API Endpoint

1. **Add controller method:**
   ```typescript
   @Get('new-endpoint')
   async newEndpoint() {
     return this.service.newMethod();
   }
   ```

2. **Add service method:**
   ```typescript
   async newMethod(): Promise<Result> {
     // Implementation
   }
   ```

3. **Create/update DTOs:**
   - Request DTO
   - Response DTO

4. **Add tests:**
   - Unit tests for controller and service
   - E2E test for the endpoint

5. **Update documentation:**
   - API reference
   - Swagger/OpenAPI annotations

## Code Review Process

### As a Reviewer

- Review code for correctness and adherence to standards
- Test the changes locally
- Provide constructive feedback
- Approve when satisfied

### As an Author

- Respond to feedback promptly
- Make requested changes
- Re-request review when ready
- Don't force push after reviews start (add new commits)

## Questions or Issues?

- Open an issue for bugs or feature requests
- Ask questions in pull request comments
- Review existing documentation in `docs/`

## Additional Resources

- [Development Guide](.cursor/rules/development.mdc)
- [NestJS Best Practices](.cursor/rules/nestjs.mdc)
- [API Patterns](.cursor/rules/api-patterns.mdc)
- [Docker Guide](.cursor/rules/docker.mdc)
- [VS Code Setup](.cursor/rules/vscode.mdc)

Thank you for contributing! 🎉
