import { Page, Locator } from 'playwright';

/**
 * Creates a Playwright locator with support for handling multiple matches.
 * When multiple elements match, uses the index parameter to select which one.
 * If index is not provided, defaults to the first match (index 0).
 *
 * @param page - The Playwright page object
 * @param target - The target string to search for
 * @param getTargetBy - The method to use for finding the element
 * @param index - Optional 0-based index to select which match to use (defaults to 0)
 * @returns A Playwright locator for the selected element
 */
export function getLocator(
  page: Page,
  target: string,
  getTargetBy:
    | 'getByLabel'
    | 'getByText'
    | 'getByRole'
    | 'getBySelector'
    | 'getByPlaceholder',
  index: number = 0,
): Locator {
  let locator: Locator;

  switch (getTargetBy) {
    case 'getByLabel':
      locator = page.getByLabel(target);
      break;
    case 'getByText':
      locator = page.getByText(target);
      break;
    case 'getByRole':
      locator = page.getByRole(target as any);
      break;
    case 'getByPlaceholder':
      locator = page.getByPlaceholder(target);
      break;
    case 'getBySelector':
      locator = page.locator(target);
      break;
    default:
      throw new Error(`Unknown getTargetBy method: ${getTargetBy}`);
  }

  // Always use nth() or first() to handle strict mode violations
  // This ensures we always have a single element, even when multiple matches exist
  if (index > 0) {
    return locator.nth(index);
  }

  // Use first() to handle cases where multiple elements match
  // This prevents strict mode violations by explicitly selecting the first match
  return locator.first();
}

/**
 * Detects if an error is a Playwright strict mode violation
 * (multiple elements matched when exactly one was expected)
 */
export function isStrictModeViolation(error: any): boolean {
  return (
    error?.message?.includes('strict mode violation') ||
    error?.message?.includes('resolved to') ||
    error?.message?.includes('multiple elements')
  );
}

/**
 * Extracts helpful suggestions from strict mode violation errors
 */
export function getStrictModeViolationSuggestions(error: any): string {
  if (!isStrictModeViolation(error)) {
    return '';
  }

  const message = error.message || '';
  const suggestions: string[] = [];

  // Extract the number of matched elements from the error message
  const matchCountMatch = message.match(/resolved to (\d+) elements?/);
  const matchCount = matchCountMatch ? parseInt(matchCountMatch[1], 10) : null;

  // Extract element details if available (format: "1) <tag>...</tag> aka ...")
  const elementMatches = message.match(/\d+\)\s*<([^>]+)[^<]*>/g);
  if (elementMatches && elementMatches.length > 0) {
    const elementDetails = elementMatches
      .slice(0, 3)
      .map((match, idx) => {
        const tagMatch = match.match(/<([^>\s]+)/);
        const tag = tagMatch ? tagMatch[1] : 'element';
        return `${idx}: ${tag}`;
      })
      .join(', ');
    suggestions.push(
      `Found ${matchCount || elementMatches.length} matching elements. To select a specific one, add "index": 0 (or 1) to your action config. Available elements: ${elementDetails}${elementMatches.length > 3 ? '...' : ''}`,
    );
  } else if (matchCount) {
    suggestions.push(
      `Found ${matchCount} matching elements. Add "index": 0 (or 1) to your action config to select which one to use.`,
    );
  }

  // Check if getByRole would be more specific
  if (message.includes('getByText') && message.includes('getByRole')) {
    const roleMatch = message.match(/getByRole\('([^']+)',\s*\{[^}]+\}\)/);
    if (roleMatch) {
      suggestions.push(
        `Consider using getByRole('${roleMatch[1]}', { name: '...' }) for more specific targeting`,
      );
    } else {
      suggestions.push(
        'Consider using getByRole with a more specific role for better element targeting',
      );
    }
  }

  // Suggest using index parameter if not already mentioned
  if (!suggestions.some((s) => s.includes('index'))) {
    suggestions.push(
      'Use the "index" parameter (0-based) to select which matching element to use',
    );
  }

  // Suggest using getBySelector for more precise targeting
  suggestions.push(
    'Alternatively, use getBySelector with a CSS selector for more precise element targeting',
  );

  return suggestions.join(' ') + '.';
}

