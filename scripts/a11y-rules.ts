/**
 * Static accessibility rules for the app's TSX (docs/14-animatsioonid-ja-ligipaasetavus.md).
 * Pure: takes a file's text and returns problems, so it is unit-tested; `a11y-check.ts` runs it
 * over apps/mobile/src in CI.
 *
 * 1. A touchable (Pressable, PressableScale, Touchable*) has an `accessibilityRole` and an
 *    `accessibilityLabel`. Without a role VoiceOver does not say "button"; without a label it
 *    reads the children in whatever order they happen to be, or nothing for an icon.
 * 2. A `Switch` or `TextInput` has an `accessibilityLabel` (its visible label is a separate Text).
 * 3. An `Image` has an `accessibilityLabel`, or is explicitly hidden (`accessible={false}`,
 *    `accessibilityElementsHidden`, `importantForAccessibility="no…"`), or sits inside an element
 *    that already has a label (a photo tile inside a labelled button).
 *
 * An element with a spread (`{...rest}`) is a pass-through wrapper: its caller provides the props
 * and is checked where it is used. A deliberate exception needs `a11y-ignore: <reason>` in a
 * comment on the line above (the reason is required, so exceptions are reviewable).
 */
import ts from 'typescript';

const TOUCHABLES = new Set(['Pressable', 'PressableScale', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback']);
const LABELLED_INPUTS = new Set(['Switch', 'TextInput']);
const IMAGES = new Set(['Image']);
const IGNORE = /a11y-ignore:\s*\S/;

export type A11yProblem = { line: number; message: string };

type Attributes = { names: Set<string>; values: Map<string, ts.JsxAttribute>; spread: boolean };

function attributesOf(element: ts.JsxOpeningLikeElement): Attributes {
  const names = new Set<string>();
  const values = new Map<string, ts.JsxAttribute>();
  let spread = false;
  for (const property of element.attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) spread = true;
    else {
      const name = property.name.getText();
      names.add(name);
      values.set(name, property);
    }
  }
  return { names, values, spread };
}

/** `accessible={false}` / `importantForAccessibility="no-hide-descendants"` / bare `accessibilityElementsHidden`. */
function isHidden(attributes: Attributes): boolean {
  if (attributes.names.has('accessibilityElementsHidden')) {
    const value = attributes.values.get('accessibilityElementsHidden')!.initializer;
    if (!value || value.getText() !== '{false}') return true;
  }
  const accessible = attributes.values.get('accessible')?.initializer;
  if (accessible && accessible.getText() === '{false}') return true;
  const important = attributes.values.get('importantForAccessibility')?.initializer;
  // Only a literal "no" / "no-hide-descendants"; a conditional value is not trusted to hide.
  return Boolean(important && important.getText().replace(/[{}'"]/g, '').startsWith('no'));
}

const hasLabel = (a: Attributes) => a.names.has('accessibilityLabel') || a.names.has('aria-label');
const hasRole = (a: Attributes) => a.names.has('accessibilityRole') || a.names.has('role');

/** Whether an ancestor JSX element carries a label (the image is part of a labelled control). */
function insideLabelledElement(node: ts.Node): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isJsxElement(parent) && hasLabel(attributesOf(parent.openingElement))) return true;
  }
  return false;
}

function tagName(element: ts.JsxOpeningLikeElement): string {
  // `Animated.Image` → "Image"; `AppleAuthentication.AppleAuthenticationButton` → its last part.
  const text = element.tagName.getText();
  return text.slice(text.lastIndexOf('.') + 1);
}

export function checkA11y(fileName: string, text: string): A11yProblem[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = text.split('\n');
  const problems: A11yProblem[] = [];

  const ignored = (line: number) => {
    // The line itself or the two lines above (a JSX comment usually sits right above the element).
    for (let i = Math.max(0, line - 3); i < line; i++) if (IGNORE.test(lines[i] ?? '')) return true;
    return false;
  };
  const report = (node: ts.Node, message: string) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    if (!ignored(line)) problems.push({ line, message });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = tagName(node);
      const attributes = attributesOf(node);
      if (!attributes.spread && !isHidden(attributes)) {
        if (TOUCHABLES.has(name)) {
          const missing = [hasRole(attributes) ? null : 'accessibilityRole', hasLabel(attributes) ? null : 'accessibilityLabel'].filter(Boolean);
          if (missing.length > 0) report(node, `<${name}> needs ${missing.join(' and ')}`);
        } else if (LABELLED_INPUTS.has(name) && !hasLabel(attributes)) {
          report(node, `<${name}> needs accessibilityLabel`);
        } else if (IMAGES.has(name) && !hasLabel(attributes) && !insideLabelledElement(node)) {
          report(node, `<${name}> needs accessibilityLabel, or accessible={false} if it is decorative`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}
