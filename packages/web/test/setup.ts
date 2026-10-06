import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// React Testing Library only cleans up on its own when the test runner exposes global hooks, which vitest does not.
afterEach(() => cleanup());

// Browsers give a File a text() method; jsdom does not yet. This stands in for it so the app's file reading can be
// tested as it will run.
if (typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
