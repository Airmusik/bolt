export function siteWordmarkParts(value: string) {
  const name = value.trim().replace(/\s+/g, ' ') || 'Site name';
  const driveAt = name.toLowerCase().indexOf('drive');
  const boundary = name.search(/\s|(?<=[a-z0-9])(?=[A-Z])|(?<=\d)(?=[A-Za-z])/);
  const chars = Array.from(name);
  const split = driveAt > 0 ? driveAt : boundary > 0 ? boundary : chars.slice(0, Math.ceil(chars.length / 2)).join('').length;
  return { name, first: name.slice(0, split), second: name.slice(split) };
}

// An explicit SVG text length keeps short, long and non-Latin names inside the
// same responsive box, without measuring/reflowing the page after fonts load.
export function siteWordmarkWidth(name: string) {
  return Math.max(250, 150 + Array.from(name).reduce((width, char) => width + (/\s/.test(char) ? 45 : /[ilI1.,!]/.test(char) ? 48 : /[MW@]/.test(char) ? 145 : 100), 0));
}
