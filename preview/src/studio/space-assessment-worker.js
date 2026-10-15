import { assessSpace } from './space-assessment.js';

self.onmessage = ({ data }) => {
  try {
    const { space, context, revision, maxWork } = data;
    self.postMessage({ result: assessSpace(space, context, { revision, maxWork }) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
