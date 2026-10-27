import {DEFAULT_APPEARANCE_REALISM, defaultAppearanceRealism} from '../../preview/src/default-appearance-realism.js';
import {DEFAULT_GUEST_APPEARANCE, DEFAULT_SHARED_APPEARANCE} from '../../preview/src/shared-appearances.js';

// A trial variant without `components` at a realism tier lets the named-default
// policy decide. A named default the policy leaves out has no trial: the fixture
// would render the whole preset under the trial's name, so there is nothing to capture.
export function untrialedVariant(appearanceId, variant, policy = DEFAULT_APPEARANCE_REALISM) {
  return !variant.components && variant.realism !== 'off'
    && [DEFAULT_SHARED_APPEARANCE, DEFAULT_GUEST_APPEARANCE].includes(appearanceId)
    && !defaultAppearanceRealism(appearanceId, policy);
}
