import { describe, expect, it } from 'vitest';

import { checkA11y } from './a11y-rules';

const check = (jsx: string) => checkA11y('screen.tsx', `export const X = () => (\n${jsx}\n);\n`);

describe('checkA11y: touchables', () => {
  it('accepts a Pressable with role and label', () => {
    expect(check(`<Pressable accessibilityRole="button" accessibilityLabel={t('a.b')} onPress={go} />`)).toEqual([]);
  });

  it('accepts the web-style role and aria-label props', () => {
    expect(check(`<Pressable role="button" aria-label="x" onPress={go} />`)).toEqual([]);
  });

  it('reports a missing label with the line number', () => {
    const problems = check(`<Pressable accessibilityRole="button" onPress={go}>\n  <Text>{t('a.b')}</Text>\n</Pressable>`);
    expect(problems).toEqual([{ line: 2, message: '<Pressable> needs accessibilityLabel' }]);
  });

  it('reports both missing props on PressableScale and Touchable*', () => {
    expect(check(`<PressableScale onPress={go} />`)[0]?.message).toBe('<PressableScale> needs accessibilityRole and accessibilityLabel');
    expect(check(`<TouchableOpacity onPress={go} />`)).toHaveLength(1);
  });

  it('skips pass-through wrappers with a spread (the caller is checked)', () => {
    expect(check(`<Pressable {...rest} />`)).toEqual([]);
  });

  it('skips hidden elements', () => {
    expect(check(`<Pressable accessible={false} onPress={go} />`)).toEqual([]);
  });

  it('honours an a11y-ignore comment with a reason, but not without one', () => {
    expect(check(`// a11y-ignore: covered by the parent row\n<Pressable onPress={go} />`)).toEqual([]);
    expect(check(`// a11y-ignore:\n<Pressable onPress={go} />`)).toHaveLength(1);
  });
});

describe('checkA11y: inputs and images', () => {
  it('requires a label on Switch and TextInput', () => {
    expect(check(`<Switch value={on} />`)).toEqual([{ line: 2, message: '<Switch> needs accessibilityLabel' }]);
    expect(check(`<TextInput accessibilityLabel={label} />`)).toEqual([]);
  });

  it('accepts a labelled image and a decorative hidden one', () => {
    expect(check(`<Image source={src} accessibilityLabel={t('a.b')} />`)).toEqual([]);
    expect(check(`<Image source={src} accessible={false} />`)).toEqual([]);
    expect(check(`<Image source={src} accessibilityElementsHidden />`)).toEqual([]);
    expect(check(`<Image source={src} importantForAccessibility="no-hide-descendants" />`)).toEqual([]);
  });

  it('does not trust a conditional importantForAccessibility or accessibilityElementsHidden={false}', () => {
    expect(check(`<Image source={src} importantForAccessibility={a ? 'auto' : 'no'} />`)).toHaveLength(1);
    expect(check(`<Image source={src} accessibilityElementsHidden={false} />`)).toHaveLength(1);
  });

  it('accepts an image inside a labelled element', () => {
    expect(check(`<Pressable accessibilityRole="button" accessibilityLabel="x">\n  <Image source={src} />\n</Pressable>`)).toEqual([]);
  });

  it('reports an unlabelled image, including Animated.Image', () => {
    expect(check(`<Image source={src} />`)).toHaveLength(1);
    expect(check(`<Animated.Image source={src} />`)).toHaveLength(1);
  });
});

describe('checkA11y: edge cases', () => {
  it('returns nothing for an empty or non-JSX file', () => {
    expect(checkA11y('empty.tsx', '')).toEqual([]);
    expect(checkA11y('util.tsx', 'export const answer = 42;\n')).toEqual([]);
  });

  it('does not throw on a syntax error (the TypeScript parser recovers)', () => {
    expect(() => checkA11y('broken.tsx', 'export const X = () => (<Pressable onPress={')).not.toThrow();
  });
});
