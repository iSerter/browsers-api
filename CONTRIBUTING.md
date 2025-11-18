# Contributing to Browsers API

Thank you for your interest in contributing to Browsers API! This document outlines the best practices and rules that all contributors must follow.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Testing Requirements](#testing-requirements)
- [Code Style & Standards](#code-style--standards)
- [Pull Request Process](#pull-request-process)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Documentation](#documentation)
- [Dependencies](#dependencies)

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the project
- Help others learn and grow

## Getting Started

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/browsers-api.git
   cd browsers-api
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Environment**
   - Copy `.env.example` to `.env` (if available)
   - Configure required environment variables
   - Set up PostgreSQL database

4. **Install Playwright Browsers (Required for Tests)**
   ```bash
   npm run test:setup
   # Or manually: npx playwright install
   ```
   **Note:** Some tests require Playwright browsers to be installed. Tests that require browsers will be skipped gracefully if browsers are not available, but you should install them to run the full test suite.

5. **Run Tests**
   ```bash
   npm test
   npm run test:cov  # Check coverage
   ```

## Development Workflow

### Branch Naming

Use descriptive branch names following these patterns:

- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates
- `test/description` - Test improvements
- `chore/description` - Maintenance tasks

**Examples:**
- `feature/captcha-solver-integration`
- `fix/job-timeout-handling`
- `refactor/browser-pool-service`

### Branch Strategy

- Create a new branch from `main` (or `master`) for each feature/fix
- Keep branches focused on a single feature or fix
- Keep branches up to date with the base branch
- Delete branches after merging

## Testing Requirements

### ⚠️ MANDATORY: All Contributions Must Include Tests

**Testing is non-negotiable.** Every PR must include comprehensive tests.

### Test Coverage Requirements

- **Minimum 80% code coverage** for all new code
- **100% coverage** for critical business logic
- All services, controllers, and handlers must have unit tests
- Integration tests required for complex workflows
- E2E tests required for critical API endpoints

### Test Structure

1. **Unit Tests** (`*.spec.ts`)
   - Place next to source files: `src/modules/feature/feature.service.spec.ts`
   - Test individual components in isolation
   - Mock external dependencies (databases, APIs, filesystem)
   - Follow AAA pattern (Arrange, Act, Assert)

2. **Integration Tests**
   - Test module wiring (controllers + services + repositories)
   - Focus on behavior contracts
   - Use NestJS `TestingModule`

3. **E2E Tests** (`test/*.e2e-spec.ts`)
   - Test critical API endpoints end-to-end
   - Use `supertest` for HTTP testing
   - Place in `test/` directory

### Test Best Practices

```typescript
// ✅ DO: Clear test structure with AAA pattern
describe('FeatureService', () => {
  let service: FeatureService;
  let repository: Repository<Entity>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureService,
        {
          provide: getRepositoryToken(Entity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<FeatureService>(FeatureService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('methodName', () => {
    it('should handle happy path correctly', async () => {
      // Arrange
      const input = { /* test data */ };
      mockRepository.findOne.mockResolvedValue(expectedResult);

      // Act
      const result = await service.methodName(input);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(mockRepository.findOne).toHaveBeenCalledWith(/* expected args */);
    });

    it('should throw error when validation fails', async () => {
      // Arrange
      const invalidInput = { /* invalid data */ };

      // Act & Assert
      await expect(service.methodName(invalidInput)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
```

### Running Tests

```bash
# Install Playwright browsers (required for some tests)
npm run test:setup

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:cov

# Run E2E tests
npm run test:e2e

# Run specific test file
npm test -- feature.service.spec.ts
```

**Note:** Tests that require Playwright browsers (e.g., `stealth.service.spec.ts`, `human-behavior-simulation.service.spec.ts`) will be skipped gracefully if browsers are not installed. Install browsers using `npm run test:setup` to run the complete test suite.

### Test Proof in PRs

**MANDATORY:** Every PR must include:

1. **Coverage Report**
   - Run `npm run test:cov` before submitting PR
   - Include coverage summary in PR description
   - Ensure coverage meets minimum requirements

2. **Test Results**
   - All tests must pass: `npm test`
   - Include test output or screenshot in PR
   - Document any known test limitations

3. **Test Files**
   - Include all `*.spec.ts` files in the PR
   - Tests must be committed alongside implementation
   - No PR will be merged without tests

**Example PR Description:**
```markdown
## Changes
- Added new feature X
- Fixed bug Y

## Tests
- ✅ Unit tests: 15 tests, all passing
- ✅ Integration tests: 3 tests, all passing
- ✅ Coverage: 85% (exceeds 80% requirement)
- ✅ Test files: feature.service.spec.ts, feature.controller.spec.ts

## Test Coverage Report
```
File      | % Stmts | % Branch | % Funcs | % Lines
----------|---------|----------|---------|--------
feature   |   85.2  |   82.5   |   90.0  |   85.0
```
```
```

## Code Style & Standards

### TypeScript & NestJS

- Use **TypeScript strictly** (no `any` types unless absolutely necessary)
- Follow **NestJS conventions** and patterns
- Use **dependency injection** for all services
- Keep controllers thin (routing only)
- Business logic belongs in services
- Use **class-validator** for DTO validation

### Code Formatting

- Use **Prettier** for code formatting
- Run `npm run format` before committing
- Use **ESLint** for linting
- Run `npm run lint` to check and fix issues

### File Organization

```
src/
├── modules/           # Feature modules
│   └── feature/
│       ├── feature.controller.ts
│       ├── feature.service.ts
│       ├── feature.service.spec.ts  # Tests next to source
│       ├── entities/
│       ├── dto/
│       └── feature.module.ts
├── common/            # Shared utilities
├── config/            # Configuration
└── database/          # Database setup
```

### Naming Conventions

- **Files**: kebab-case for files, PascalCase for classes
- **Classes**: PascalCase (e.g., `UserService`, `JobController`)
- **Variables/Functions**: camelCase (e.g., `getUserById`, `jobStatus`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRY_ATTEMPTS`)
- **Interfaces**: PascalCase with `I` prefix or descriptive name (e.g., `IUser` or `UserInterface`)

### Best Practices

- **Keep functions small and focused** (single responsibility)
- **Use meaningful names** that describe purpose
- **Document complex logic** with comments
- **Handle errors explicitly** with proper exception types
- **Use async/await** over Promises when possible
- **Always handle async errors** with try/catch

## Pull Request Process

### Before Submitting

1. ✅ **All tests pass**: `npm test`
2. ✅ **Coverage meets requirements**: `npm run test:cov`
3. ✅ **Code is formatted**: `npm run format`
4. ✅ **Linting passes**: `npm run lint`
5. ✅ **Branch is up to date** with base branch
6. ✅ **No merge conflicts**

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Tests added/updated and passing
- [ ] Test coverage ≥ 80%
- [ ] Documentation updated (if needed)
- [ ] Commit messages follow guidelines
- [ ] No console.logs or debug code
- [ ] No commented-out code
- [ ] Dependencies added are necessary and justified

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
- ✅ Unit tests: X tests, all passing
- ✅ Integration tests: Y tests, all passing
- ✅ Coverage: Z% (exceeds 80% requirement)
- ✅ Test files included: [list files]

## Test Coverage Report
```
[Coverage output]
```

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

### Code Review

- All PRs require at least one approval
- Address review comments promptly
- Be open to feedback and suggestions
- Keep discussions constructive and respectful
- Update PR based on feedback

## Commit Message Guidelines

Follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

### Examples

```bash
feat(captcha): add 2captcha provider integration

- Implement 2captcha API client
- Add provider registration
- Include unit tests with 90% coverage

Closes #123

---

fix(jobs): handle timeout errors gracefully

- Add timeout error handling in job processor
- Update error messages for better debugging
- Add integration tests for timeout scenarios

Fixes #456

---

test(browser-pool): improve test coverage to 85%

- Add edge case tests for pool exhaustion
- Test error recovery scenarios
- Mock external dependencies properly
```

### Commit Best Practices

- Write clear, descriptive commit messages
- Keep commits focused (one logical change per commit)
- Reference issue numbers when applicable
- Use present tense ("add feature" not "added feature")
- Keep subject line under 50 characters
- Use body to explain what and why, not how

## Documentation

### Code Documentation

- **JSDoc comments** for public APIs
- **Inline comments** for complex logic
- **README updates** for new features or breaking changes
- **API documentation** via Swagger/OpenAPI decorators

### Documentation Updates

- Update README.md for user-facing changes
- Update API documentation for endpoint changes
- Add migration guides for breaking changes
- Document new environment variables
- Update examples if API changes

## Dependencies

### Adding Dependencies

- **Justify** why a new dependency is needed
- **Prefer** well-maintained, popular packages
- **Check** for security vulnerabilities: `npm audit`
- **Consider** bundle size and performance impact
- **Document** in PR description why it's needed

### Updating Dependencies

- Test thoroughly after updating
- Check for breaking changes
- Update related code if needed
- Document breaking changes in PR

### Security

- Run `npm audit` regularly
- Fix security vulnerabilities promptly
- Keep dependencies up to date
- Report security issues privately

## Getting Help

- Check existing documentation in `docs/`
- Review similar code in the codebase
- Ask questions in PR comments
- Open an issue for bugs or feature requests

## Additional Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Conventional Commits](https://www.conventionalcommits.org/)

---

Thank you for contributing to Browsers API! 🚀

