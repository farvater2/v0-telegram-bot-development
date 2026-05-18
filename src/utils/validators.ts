// URL validation
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// RegExp validation
export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

// Frequency validation
export function isValidFrequency(value: number, minSeconds: number): boolean {
  return !isNaN(value) && value >= minSeconds;
}
