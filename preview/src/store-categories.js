// The directory's five store categories, grouped from OpenStreetMap shop tags,
// with a short slug for styling and filtering.
export const STORE_CATEGORIES = [
  ['shopping', 'Shopping & culture'], ['dining', 'Dining'], ['jewelry', 'Jewelry & accessories'], ['beauty', 'Beauty & wellness'], ['homes', 'Homes'],
];
const BEAUTY = ['beauty', 'hairdresser', 'fitness_centre', 'wellness', 'perfumery', 'optician'];
export const storeCategory = store => store.category === 'home' ? 'Homes' : ['restaurant', 'ice_cream'].includes(store.category) ? 'Dining'
  : ['jewelry', 'fashion_accessories'].includes(store.category) ? 'Jewelry & accessories' : BEAUTY.includes(store.category) ? 'Beauty & wellness' : 'Shopping & culture';
export const categorySlug = label => STORE_CATEGORIES.find(([, name]) => name === label)?.[0] ?? null;
