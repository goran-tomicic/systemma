// "src/components/Button/Button.module.css" and ".../Button/index.tsx" both become "components/Button",
// so a component's styles and its code count as one component.
export function componentNameFromPath(path: string): string {
  const parts = path.split('/');
  const file = parts.pop() ?? '';
  let base = file.replace(/\.[^.]+$/, '').replace(/\.(module|styles?|stories)$/i, '');
  if (/^index$/i.test(base) && parts.length) base = parts.pop() ?? base;
  if (parts.length && parts[parts.length - 1] === base) parts.pop();
  return (parts.length ? parts[parts.length - 1] : 'root') + '/' + base;
}
