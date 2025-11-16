# Captcha Solver Services

## Confidence Scoring Algorithm

The `ConfidenceScoringService` implements a sophisticated multi-factor algorithm for calculating confidence scores in anti-bot system detection.

### Algorithm Overview

The confidence score (0-1) is calculated using four components:

1. **Base Score** - Weighted sum of individual signal strengths
2. **Strong Signals Bonus** - Additional confidence from multiple strong signals
3. **Diversity Bonus** - Reward for having different types of detection signals
4. **Context Adjustment** - System-specific signal importance tuning

### Signal Weights

Default weights for signal strengths:
- **STRONG**: 0.4 (definitive indicators like challenge forms, widgets)
- **MODERATE**: 0.25 (supporting evidence like scripts, cookies)
- **WEAK**: 0.1 (generic indicators like common headers)

### Bonus Calculations

#### Strong Signals Bonus
When multiple strong signals are present, confidence increases beyond linear addition:
- 2 strong signals: +0.15 bonus
- 3+ strong signals: +0.15 + (0.075 × additional signals)

This reflects that multiple definitive indicators provide exceptional certainty.

#### Diversity Bonus
Different types of signals (DOM, script, cookie, header) increase confidence:
- 2 types: +0.05 bonus (50% of max)
- 3 types: +0.075 bonus (75% of max)
- 4+ types: +0.10 bonus (full bonus)

Cross-validation across different evidence types indicates robust detection.

### Context-Aware Scoring

The algorithm applies small adjustments (+0.03 to +0.05) for signals that are particularly indicative of specific anti-bot systems:

**Cloudflare**:
- `challenge-form` (DOM): +0.05
- `turnstile-widget` (DOM): +0.05
- `cf-ray` (header): +0.03

**DataDome**:
- `datadome-js` (script): +0.05
- `datadome-captcha` (DOM): +0.05

**Akamai**:
- `akamai-sensor` (script): +0.05
- `akamai-bot-manager` (script): +0.05
- `akamai-cookies` (cookie): +0.03

**Imperva**:
- `imperva-script` (script): +0.05
- `imperva-cookies` (cookie): +0.03

**reCAPTCHA**:
- `recaptcha-widget` (DOM): +0.05
- `recaptcha-api` (script): +0.05

**hCaptcha**:
- `hcaptcha-widget` (DOM): +0.05
- `hcaptcha-api` (script): +0.05

### Score Normalization

Final scores are:
1. Capped at 1.0 (maximum confidence)
2. Rounded to 2 decimal places
3. Compared against minimum detection threshold (default: 0.3)

### Example Calculations

#### Example 1: Single Strong Signal
```typescript
Signals: [{ type: 'dom-element', strength: STRONG }]
Base: 0.4
Strong Bonus: 0 (only 1 strong)
Diversity: 0 (only 1 type)
Context: 0 (no system specified)
Final: 0.40
```

#### Example 2: Multiple Strong Signals with Diversity
```typescript
Signals: [
  { type: 'dom-element', strength: STRONG },
  { type: 'script', strength: STRONG },
  { type: 'cookie', strength: MODERATE }
]
Base: 0.4 + 0.4 + 0.25 = 1.05
Strong Bonus: 0.15 (2 strong signals)
Diversity: 0.075 (3 types)
Context: 0
Subtotal: 1.275
Final: 1.00 (capped)
```

#### Example 3: Cloudflare with Context
```typescript
Signals: [
  { type: 'dom-element', name: 'challenge-form', strength: STRONG },
  { type: 'header', name: 'cf-ray', strength: MODERATE }
]
System: CLOUDFLARE
Base: 0.4 + 0.25 = 0.65
Strong Bonus: 0 (only 1 strong)
Diversity: 0.05 (2 types)
Context: 0.05 + 0.03 = 0.08
Final: 0.78
```

### Configuration

The algorithm can be configured with custom weights and bonuses:

```typescript
const customConfig = {
  signalWeights: {
    [SignalStrength.STRONG]: 0.5,
    [SignalStrength.MODERATE]: 0.3,
    [SignalStrength.WEAK]: 0.15,
  },
  multipleStrongSignalsBonus: 0.2,
  diversityBonus: 0.15,
  maxConfidence: 1.0,
  minDetectionThreshold: 0.4,
};

const service = new ConfidenceScoringService(customConfig);
```

### Usage

```typescript
// Basic usage
const confidence = service.calculateConfidence(signals);

// With system-specific tuning
const confidence = service.calculateConfidence(
  signals,
  AntiBotSystemType.CLOUDFLARE
);

// Get detailed breakdown
const breakdown = service.calculateDetailedScore(signals);
console.log(breakdown.baseScore);           // 0.65
console.log(breakdown.strongSignalsBonus);  // 0.15
console.log(breakdown.diversityBonus);      // 0.05
console.log(breakdown.score);               // 0.85
console.log(breakdown.meetsThreshold);      // true
```

## Detection Service

The `DetectionService` uses the confidence scoring service to detect various anti-bot systems:
- Cloudflare (Turnstile, Challenge Pages, Bot Management)
- DataDome
- Akamai Bot Manager
- Imperva (Incapsula)
- Google reCAPTCHA (v2/v3)
- hCaptcha

Each detection method:
1. Inspects DOM, scripts, cookies, and headers via Playwright
2. Collects detection signals with strength classifications
3. Calculates confidence using the scoring service
4. Returns structured results with detailed context
